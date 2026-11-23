const URL_REGEX = /\b(?:https?:\/\/|www\.)\S+/gi;
const QUERY_REGEX = /\?[^\s]*/g;
const SPACE_REGEX = /\s+/g;

export function scrubMessage(message: string, limit = 200): string {
  if (limit < 0) throw new Error("limit must be >= 0");
  let cleaned = message.replace(URL_REGEX, "[url]");
  cleaned = cleaned.replace(QUERY_REGEX, "");
  cleaned = cleaned.replace(SPACE_REGEX, " ").trim();
  return cleaned.length > limit ? cleaned.slice(0, limit) : cleaned;
}
