/**
 * Phone number normalization and utility functions for UniFi Talk CRM.
 */

export function extractDigits(phone: string): string {
  if (!phone) return "";
  return phone.replace(/\D/g, "");
}

/**
 * Normalizes phone number to E.164 standard (e.g. +15551234567 for North America).
 */
export function normalizePhoneNumber(raw: string): string {
  if (!raw) return "";
  let digits = extractDigits(raw);

  // If 10 digits (US/Canada area code + local), prepend 1
  if (digits.length === 10) {
    return `+1${digits}`;
  }

  // If 11 digits starting with 1, prepend +
  if (digits.length === 11 && digits.startsWith("1")) {
    return `+${digits}`;
  }

  // If already starts with +
  if (raw.trim().startsWith("+")) {
    return `+${digits}`;
  }

  return digits ? `+${digits}` : "";
}

/**
 * Formats a phone number for user-friendly display: (555) 123-4567
 */
export function formatPhoneDisplay(phone: string): string {
  if (!phone) return "Unknown";
  const digits = extractDigits(phone);

  if (digits.length === 10) {
    return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
  }
  if (digits.length === 11 && digits.startsWith("1")) {
    return `+1 (${digits.slice(1, 4)}) ${digits.slice(4, 7)}-${digits.slice(7)}`;
  }

  return phone;
}

/** Talk time for display: "45s", "3m 05s", "1h 02m". */
export function formatDuration(seconds: number): string {
  if (!seconds || seconds < 1) return "0s";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h) return `${h}h ${String(m).padStart(2, "0")}m`;
  if (m) return `${m}m ${String(s).padStart(2, "0")}s`;
  return `${s}s`;
}

/** The office line a call came in on (our DID) or went out from (an extension), or a dash. */
export function formatLine(toExtension: string | null | undefined): string {
  return toExtension ? formatPhoneDisplay(toExtension) : "—";
}

/**
 * Generates search patterns for database matching.
 * e.g., for "+15551234567" -> ["+15551234567", "5551234567", "15551234567"]
 */
export function getPhoneSearchKeys(raw: string): string[] {
  const digits = extractDigits(raw);
  const keys = new Set<string>();

  if (!digits) return [];

  keys.add(digits);
  keys.add(normalizePhoneNumber(raw));

  if (digits.length === 11 && digits.startsWith("1")) {
    keys.add(digits.slice(1)); // 10 digit without leading 1
  } else if (digits.length === 10) {
    keys.add(`1${digits}`); // 11 digit with leading 1
    keys.add(`+1${digits}`);
  }

  return Array.from(keys).filter(Boolean);
}
