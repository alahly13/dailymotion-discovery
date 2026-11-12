/**
 * Bounded manifest serializer for scoped Gemini AI prompts.
 *
 * Prevents oversized payloads and token blowups when summarizing large local
 * manifests, Saved Library exports, or personal collections, while keeping exact
 * evidence IDs grounded to inspected records.
 */

export interface CompactManifestContextResult {
  totalInputItems: number;
  includedItems: number;
  truncated: boolean;
  evidenceIds: string[];
  serialized: string;
}

function parsePositiveInt(raw: string | undefined, fallback: number, max: number): number {
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 1) return fallback;
  return Math.min(Math.trunc(n), max);
}

export function getAiManifestBounds(): { maxItems: number; maxChars: number } {
  return {
    maxItems: parsePositiveInt(process.env.AI_MANIFEST_MAX_ITEMS, 25, 100),
    maxChars: parsePositiveInt(process.env.AI_MANIFEST_MAX_CHARS, 9000, 24000),
  };
}

function trimItemForAi(item: unknown, idx: number): { id: string; summary: Record<string, unknown> } {
  if (!item || typeof item !== "object") {
    return { id: `item-${idx}`, summary: { value: String(item) } };
  }
  const obj = item as Record<string, unknown>;
  const snapshot = (obj.snapshot && typeof obj.snapshot === "object" ? obj.snapshot : obj) as Record<string, unknown>;
  const id = String(snapshot.id ?? obj.itemKey ?? `item-${idx}`);

  return {
    id,
    summary: {
      id,
      apiVersion: snapshot.apiVersion ?? obj.apiVersion ?? null,
      kind: snapshot.kind ?? obj.resourceType ?? null,
      title: typeof snapshot.title === "string" ? snapshot.title.slice(0, 140) : null,
      ownerName: typeof snapshot.ownerName === "string" ? snapshot.ownerName.slice(0, 60) : null,
      category: snapshot.category ?? null,
      language: snapshot.language ?? null,
      duration: typeof snapshot.duration === "number" ? snapshot.duration : null,
      views: typeof snapshot.views === "number" ? snapshot.views : null,
      createdAt: snapshot.createdAt ?? null,
      tags: Array.isArray(snapshot.tags) ? snapshot.tags.slice(0, 6) : [],
    },
  };
}

export function compactManifestContext(
  input: unknown,
  overrides?: { maxItems?: number; maxChars?: number }
): CompactManifestContextResult {
  const defaults = getAiManifestBounds();
  const maxItems = overrides?.maxItems ?? defaults.maxItems;
  const maxChars = overrides?.maxChars ?? defaults.maxChars;

  if (Array.isArray(input)) {
    const sliced = input.slice(0, maxItems);
    const trimmed = sliced.map((entry, idx) => trimItemForAi(entry, idx));
    const evidenceIds = trimmed.map((t) => t.id);
    const payload = {
      totalItems: input.length,
      sampledItems: trimmed.length,
      truncatedByItemCap: input.length > maxItems,
      evidenceIds,
      items: trimmed.map((t) => t.summary),
    };
    const serialized = JSON.stringify(payload).slice(0, maxChars);
    return {
      totalInputItems: input.length,
      includedItems: trimmed.length,
      truncated: input.length > maxItems || JSON.stringify(payload).length > maxChars,
      evidenceIds,
      serialized,
    };
  }

  if (input && typeof input === "object") {
    const obj = input as Record<string, unknown>;
    if (Array.isArray(obj.items)) {
      const sliced = obj.items.slice(0, maxItems);
      const trimmed = sliced.map((entry, idx) => trimItemForAi(entry, idx));
      const evidenceIds = trimmed.map((t) => t.id);
      const wrapper = {
        ...obj,
        totalItems: obj.items.length,
        sampledItems: trimmed.length,
        truncatedByItemCap: obj.items.length > maxItems,
        evidenceIds,
        items: trimmed.map((t) => t.summary),
      };
      const rawJson = JSON.stringify(wrapper);
      return {
        totalInputItems: obj.items.length,
        includedItems: trimmed.length,
        truncated: obj.items.length > maxItems || rawJson.length > maxChars,
        evidenceIds,
        serialized: rawJson.slice(0, maxChars),
      };
    }
  }

  const rawJson = JSON.stringify(input ?? {});
  return {
    totalInputItems: 1,
    includedItems: 1,
    truncated: rawJson.length > maxChars,
    evidenceIds: [],
    serialized: rawJson.slice(0, maxChars),
  };
}
