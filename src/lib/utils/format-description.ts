// Description & HTML Text Sanitization Utility (2026)
//
// What this controls: Cleans, decodes, and formats raw Dailymotion text descriptions.
// Why it exists: Dailymotion V1 and V2 APIs often return descriptions with embedded
// raw HTML tags (e.g. `<br />`, `<div>`, `<p>`) and HTML entities (e.g. `&quot;`, `&amp;`).
// Never renders unescaped raw HTML strings directly into the UI.
// Scope: Card components, intelligence overviews, completed explorations archive.

export function formatSafeDescription(raw: string | null | undefined): string {
  if (!raw || typeof raw !== "string") return "";

  let text = raw;

  // 1. Replace explicit break/paragraph tags with newlines
  text = text.replace(/<br\s*\/?>/gi, "\n");
  text = text.replace(/<\/(p|div)>/gi, "\n");
  text = text.replace(/<(p|div)[^>]*>/gi, "");

  // 2. Strip any remaining HTML tags safely BEFORE entity decoding
  text = text.replace(/<[^>]+>/g, "");

  // 3. Decode standard and numbered HTML entities
  text = text
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ")
    .replace(/&hellip;/g, "...")
    .replace(/&#(\d+);/g, (_, code) => {
      const num = Number(code);
      return Number.isFinite(num) && num > 0 ? String.fromCharCode(num) : "";
    });

  // 4. Normalize excess blank lines (max 2 consecutive newlines)
  text = text.replace(/\n{3,}/g, "\n\n");

  return text.trim();
}
