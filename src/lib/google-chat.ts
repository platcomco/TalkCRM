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

type MatchableCustomer = {
  id: string;
  name: string;
  companyName: string | null;
  accountNumber: string | null;
  parentName?: string | null;
};

const STOPWORDS = new Set(["the", "of", "and", "at", "a", "an", "to", "for", "in", "on", "is", "inc", "llc", "co", "ltd"]);

/** Lowercase words without punctuation, stopwords or bare numbers ("Joe's Bar-Frisco 123" → joes, bar, frisco). */
function tokenize(text: string | null | undefined): string[] {
  return (text || "")
    .toLowerCase()
    .replace(/['’]/g, "")
    .split(/[^a-z0-9]+/)
    .filter((w) => w && !STOPWORDS.has(w) && !/^\d+$/.test(w));
}

/** Words and numbers as one spaced string, for whole-phrase containment ("4000 NBS" → "4000 nbs"). */
function normalizePhrase(text: string | null | undefined): string {
  return (text || "").toLowerCase().replace(/['’]/g, "").replace(/[^a-z0-9]+/g, " ").trim();
}

/**
 * The heading of a thread: its first line, without @mentions of staff, and with a trailing
 * group of techs ("-JAMES/SERGIO") collapsed to one word.
 */
function threadHeading(title: string): string {
  const firstLine = title.split("\n").map((l) => l.trim()).find(Boolean) || "";
  return firstLine
    .slice(0, 120)
    .replace(/@[A-Z][\w.'-]*(\s+[A-Z][\w.'-]*)?/g, " ")
    .replace(/([A-Za-z]+)(\s*\/\s*[A-Za-z]+)+\s*$/, "$1");
}

/**
 * Matches the words of a heading against one customer name. A short heading word may be the
 * initials of consecutive name words ("fw" = "fort worth"). Only the LAST heading word may be
 * left over (the tech's name or "Done" in "Wild Pitch Frisco-JAMES"); returns null otherwise.
 */
function scoreLabel(heading: string[], label: string[]): { matched: number; exact: boolean } | null {
  const labelSet = new Set(label);
  let matched = 0;
  for (let i = 0; i < heading.length; i++) {
    const word = heading[i];
    const isInitials =
      word.length >= 2 &&
      word.length <= 4 &&
      label.some((_, j) => label.slice(j, j + word.length).map((w) => w[0]).join("") === word);
    if (labelSet.has(word) || isInitials) {
      matched++;
    } else if (i !== heading.length - 1) {
      return null;
    }
  }
  return { matched, exact: matched === heading.length && matched === label.length };
}

/**
 * Builds a matcher that finds the customer a thread is about from its first message:
 *  1. a DIRECTV account number in the message;
 *  2. the heading (e.g. "Wild Pitch Frisco-JAMES") matched word-by-word against customer and
 *     company names; the winner must match more words than any other customer, or be the
 *     only exact name among equals;
 *  3. a full customer name appearing in the heading ("Hat Creek RV Park Channel Lineup").
 * Anything ambiguous is left for a person to link.
 */
export function createThreadMatcher(customers: MatchableCustomer[]) {
  const byAccount = new Map<string, string[]>();
  const labels: { customer: MatchableCustomer; tokens: string[]; phrase: string }[] = [];
  const labelsByWord = new Map<string, number[]>();

  for (const c of customers) {
    if (c.accountNumber) byAccount.set(c.accountNumber, [...(byAccount.get(c.accountNumber) || []), c.id]);
    const seen = new Set<string>();
    for (const text of [c.name, c.companyName]) {
      const tokens = tokenize(text);
      const phrase = normalizePhrase(text);
      if (!phrase || seen.has(phrase)) continue;
      seen.add(phrase);
      const index = labels.push({ customer: c, tokens, phrase }) - 1;
      for (const w of Array.from(new Set([...tokens, ...phrase.split(" ")]))) {
        labelsByWord.set(w, [...(labelsByWord.get(w) || []), index]);
      }
    }
  }

  const unique = (ids: string[]) => {
    const set = Array.from(new Set(ids));
    return set.length === 1 ? set[0] : null;
  };

  return (title: string): string | null => {
    for (const number of title.match(/(?<!\d)\d{8,9}(?!\d)/g) || []) {
      const id = unique(byAccount.get(number) || []);
      if (id) return id;
    }

    const headingText = threadHeading(title);
    const heading = tokenize(headingText);
    const headingPhrase = ` ${normalizePhrase(headingText)} `;
    const candidates = Array.from(
      new Set(headingPhrase.trim().split(" ").flatMap((w) => labelsByWord.get(w) || []))
    );

    // 2. Word-by-word (only for heading-like first lines, not sentences)
    if (heading.length > 0 && heading.length <= 8) {
      const best = new Map<string, { matched: number; exact: boolean }>();
      for (const i of candidates) {
        const { customer, tokens } = labels[i];
        if (!tokens.length) continue;
        const score = scoreLabel(heading, tokens);
        if (!score) continue;
        const strongEnough = score.matched >= 2 || (score.matched === 1 && tokens.length === 1 && tokens[0].length >= 5);
        if (!strongEnough) continue;
        const prev = best.get(customer.id);
        if (!prev || score.matched > prev.matched || (score.matched === prev.matched && score.exact)) {
          best.set(customer.id, score);
        }
      }
      const ranked = Array.from(best.entries()).sort((a, b) => b[1].matched - a[1].matched);
      if (ranked.length > 0) {
        const top = ranked.filter(([, s]) => s.matched === ranked[0][1].matched);
        const winner = top.length === 1 ? top[0][0] : unique(top.filter(([, s]) => s.exact).map(([id]) => id));
        if (winner) return winner;
        if (top.length > 1) return null; // e.g. "Blue Goose Cantina" with several locations
      }
    }

    // 3. A whole customer name inside the heading; the longest such name wins. In a long
    //    sentence the name must open it ("Hat Creek RV Park Channel Lineup"), so a passing
    //    mention ("...drop down for fitness center") doesn't count.
    const isShortHeading = heading.length <= 6;
    let longest = 0;
    let ids: string[] = [];
    for (const i of candidates) {
      const { customer, phrase } = labels[i];
      if (phrase.length < 6 || !phrase.includes(" ")) continue; // single words are too loose here
      if (!headingPhrase.includes(` ${phrase} `)) continue;
      if (!isShortHeading && !headingPhrase.startsWith(` ${phrase} `)) continue;
      if (phrase.length > longest) {
        longest = phrase.length;
        ids = [customer.id];
      } else if (phrase.length === longest) {
        ids.push(customer.id);
      }
    }
    return unique(ids);
  };
}

/** Matches one thread title (see createThreadMatcher). */
export function matchThreadToCustomer(title: string, customers: MatchableCustomer[]): string | null {
  return createThreadMatcher(customers)(title);
}

/**
 * Links threads to the customer their first message names. Threads a person linked or unlinked
 * by hand are left alone; automatic links are re-checked, since customers and the matching
 * rules change. Returns how many threads got a new or different customer.
 */
export async function autoLinkChatThreads(): Promise<number> {
  const threads = await db.chatThread.findMany({
    where: { OR: [{ linkSource: null }, { linkSource: "auto" }] },
    select: { name: true, title: true, customerId: true },
  });
  if (threads.length === 0) return 0;

  const match = createThreadMatcher(
    await db.customer.findMany({
      select: { id: true, name: true, companyName: true, accountNumber: true, parentName: true },
    })
  );

  let changed = 0;
  for (const t of threads) {
    const customerId = match(t.title);
    if (customerId === t.customerId) continue;
    await db.chatThread.update({
      where: { name: t.name },
      data: customerId ? { customerId, linkSource: "auto" } : { customerId: null, linkSource: null },
    });
    if (customerId) changed++;
  }
  return changed;
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
