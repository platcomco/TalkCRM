import { db } from "./db";
import { getGoogleClient, GoogleAuthError, hasScopes, CHAT_SCOPES } from "./google";

const CHAT_API_URL = "https://chat.googleapis.com/v1";
// Each sync re-reads this much recent history so edited messages are picked up
const RESYNC_OVERLAP_MS = 7 * 24 * 60 * 60 * 1000;

export type ChatSpaceSummary = { name: string; displayName: string };

/** Turns a Chat API error response into a message a person can act on. */
async function chatFailure(context: string, res: Response): Promise<Error> {
  const body = await res.text().catch(() => "");
  console.error(`[google-chat] ${context} failed: HTTP ${res.status} ${body.slice(0, 500)}`);
  let detail = "";
  try {
    detail = JSON.parse(body)?.error?.message || "";
  } catch {
    // Not JSON
  }
  if (/chat app not found/i.test(detail)) {
    return new Error(
      "Google Chat API isn't configured yet: in Google Cloud Console open Google Chat API → Configuration, fill in the app name, avatar and description, and save."
    );
  }
  if (res.status === 403) {
    return new Error(
      `Google Chat refused access (HTTP 403)${detail ? `: ${detail}` : ""}. Check that the Chat API is enabled and reconnect Google in Settings.`
    );
  }
  return new Error(`${context} failed (HTTP ${res.status})${detail ? `: ${detail}` : ""}.`);
}

async function getChatClient(email: string) {
  const google = await getGoogleClient(email);
  if (!google || !hasScopes(google.account, CHAT_SCOPES)) {
    throw new GoogleAuthError(`${email} hasn't given TalkCRM access to Google Chat. Connect Google in Settings.`);
  }
  return google;
}

/** The named spaces (not DMs) the staff member belongs to. */
export async function listMyChatSpaces(email: string): Promise<ChatSpaceSummary[]> {
  const google = await getChatClient(email);
  const spaces: ChatSpaceSummary[] = [];
  let pageToken = "";
  do {
    const params = new URLSearchParams({ pageSize: "1000", filter: 'spaceType = "SPACE"' });
    if (pageToken) params.set("pageToken", pageToken);
    const res = await google.get(`${CHAT_API_URL}/spaces?${params.toString()}`);
    if (!res.ok) throw await chatFailure("Listing Chat spaces", res);
    const data = await res.json();
    for (const s of data.spaces || []) {
      spaces.push({ name: s.name, displayName: s.displayName || s.name });
    }
    pageToken = data.nextPageToken || "";
  } while (pageToken);

  return spaces.sort((a, b) => a.displayName.localeCompare(b.displayName));
}

/**
 * Accepts a Chat thread link copied from the browser (chat.google.com/room/SPACE/THREAD or
 * mail.google.com/chat/...#chat/space/SPACE/THREAD) or a resource name, and returns the
 * thread's resource name.
 */
export function parseThreadReference(input: string): string | null {
  const text = input.trim();
  const resource = text.match(/spaces\/([A-Za-z0-9_-]+)\/threads\/([A-Za-z0-9_-]+)/);
  if (resource) return `spaces/${resource[1]}/threads/${resource[2]}`;
  const link = text.match(/(?:room|space)\/([A-Za-z0-9_-]+)\/([A-Za-z0-9_-]+)/);
  if (link) return `spaces/${link[1]}/threads/${link[2]}`;
  return null;
}

/** Link that opens the thread in Google Chat. */
export function chatThreadUrl(threadName: string): string {
  const [, spaceId, , threadId] = threadName.split("/");
  return `https://chat.google.com/room/${spaceId}/${threadId}`;
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

type MatchableCustomer = { id: string; name: string; companyName: string | null; accountNumber: string | null };

/**
 * Finds the customer a thread is about from its first message: a DIRECTV account number
 * first, then the longest customer or company name that appears as whole words. Anything
 * ambiguous is left for a person to link.
 */
export function matchThreadToCustomer(title: string, customers: MatchableCustomer[]): string | null {
  const accountNumbers = new Set(title.match(/(?<!\d)\d{8,9}(?!\d)/g) || []);
  if (accountNumbers.size > 0) {
    const byAccount = new Set(
      customers.filter((c) => c.accountNumber && accountNumbers.has(c.accountNumber)).map((c) => c.id)
    );
    if (byAccount.size === 1) return Array.from(byAccount)[0];
  }

  const haystack = title.toLowerCase().replace(/\s+/g, " ");
  let bestLength = 0;
  let bestIds = new Set<string>();
  for (const c of customers) {
    for (const candidate of [c.name, c.companyName]) {
      const needle = candidate?.toLowerCase().replace(/\s+/g, " ").trim();
      if (!needle || needle.length < 5) continue; // too short to trust ("Bar", "Joe")
      if (!new RegExp(`(^|[^a-z0-9])${escapeRegExp(needle)}([^a-z0-9]|$)`).test(haystack)) continue;
      if (needle.length > bestLength) {
        bestLength = needle.length;
        bestIds = new Set([c.id]);
      } else if (needle.length === bestLength) {
        bestIds.add(c.id);
      }
    }
  }
  return bestIds.size === 1 ? Array.from(bestIds)[0] : null;
}

/** Links threads nobody has decided on yet to the customer their first message names. */
export async function autoLinkChatThreads(): Promise<number> {
  const threads = await db.chatThread.findMany({
    where: { customerId: null, linkSource: null },
    select: { name: true, title: true },
  });
  if (threads.length === 0) return 0;

  const customers = await db.customer.findMany({
    select: { id: true, name: true, companyName: true, accountNumber: true },
  });

  let linked = 0;
  for (const t of threads) {
    const customerId = matchThreadToCustomer(t.title, customers);
    if (!customerId) continue;
    await db.chatThread.update({ where: { name: t.name }, data: { customerId, linkSource: "auto" } });
    linked++;
  }
  return linked;
}

/** Copies new and recently edited messages from one space into the local cache. */
export async function syncChatSpace(spaceName: string): Promise<{ messages: number }> {
  const space = await db.chatSpace.findUnique({ where: { name: spaceName } });
  if (!space) throw new Error(`Chat space ${spaceName} isn't set up in TalkCRM.`);

  const startedAt = new Date();
  try {
    const google = await getChatClient(space.syncAsEmail);
    const since = space.lastSyncedAt ? new Date(space.lastSyncedAt.getTime() - RESYNC_OVERLAP_MS) : null;
    const touchedThreads = new Set<string>();
    let messageCount = 0;
    let pageToken = "";

    do {
      // Oldest first, so a new thread's title comes from its first message
      const params = new URLSearchParams({ pageSize: "1000", orderBy: "createTime ASC" });
      if (since) params.set("filter", `createTime > "${since.toISOString()}"`);
      if (pageToken) params.set("pageToken", pageToken);

      const res = await google.get(`${CHAT_API_URL}/${space.name}/messages?${params.toString()}`);
      if (!res.ok) throw await chatFailure(`Reading messages in "${space.displayName}"`, res);
      const data = await res.json();

      for (const m of data.messages || []) {
        const threadName: string | undefined = m.thread?.name;
        if (!threadName || !m.name) continue;

        const text: string = m.text || m.argumentText || "";
        const createTime = new Date(m.createTime);
        const attachmentCount = Array.isArray(m.attachment) ? m.attachment.length : 0;

        await db.chatThread.upsert({
          where: { name: threadName },
          update: { lastMessageAt: createTime },
          create: {
            name: threadName,
            spaceName: space.name,
            title: (text || (attachmentCount ? "(photo/attachment)" : "(no text)")).slice(0, 500),
            lastMessageAt: createTime,
          },
        });
        const messageData = {
          threadName,
          text,
          senderName: m.sender?.displayName || null,
          createTime,
          attachmentCount,
        };
        await db.chatMessage.upsert({
          where: { name: m.name },
          update: messageData,
          create: { name: m.name, ...messageData },
        });
        touchedThreads.add(threadName);
        messageCount++;
      }
      pageToken = data.nextPageToken || "";
    } while (pageToken);

    for (const threadName of Array.from(touchedThreads)) {
      const count = await db.chatMessage.count({ where: { threadName } });
      await db.chatThread.update({ where: { name: threadName }, data: { messageCount: count } });
    }

    await db.chatSpace.update({
      where: { name: space.name },
      data: { lastSyncedAt: startedAt, lastError: null },
    });
    return { messages: messageCount };
  } catch (err: any) {
    await db.chatSpace.update({
      where: { name: space.name },
      data: { lastError: String(err?.message || err).slice(0, 500) },
    });
    throw err;
  }
}

type ChatSyncResult = { spaces: number; messages: number; linked: number; errors: string[] };
let chatSyncInFlight: Promise<ChatSyncResult> | null = null;

/**
 * Syncs every configured space (one failing doesn't stop the others), then auto-links threads.
 * Overlapping calls (scheduler + Sync button) share one run.
 */
export function syncAllChatSpaces(): Promise<ChatSyncResult> {
  chatSyncInFlight ??= runChatSync().finally(() => {
    chatSyncInFlight = null;
  });
  return chatSyncInFlight;
}

async function runChatSync(): Promise<ChatSyncResult> {
  const spaces = await db.chatSpace.findMany({ select: { name: true, displayName: true } });
  let messages = 0;
  const errors: string[] = [];
  for (const s of spaces) {
    try {
      messages += (await syncChatSpace(s.name)).messages;
    } catch (err: any) {
      errors.push(`${s.displayName}: ${err?.message || err}`);
    }
  }
  const linked = await autoLinkChatThreads();
  return { spaces: spaces.length, messages, linked, errors };
}
