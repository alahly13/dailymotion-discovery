/**
 * Shared Local FlexSearch Service for Dailymotion Discovery (2026)
 *
 * What this controls: fast, zero-API-call search inside Saved Library,
 * Personal Collections, Saved Search Presets, Search History, and Result Sets.
 * Uses the existing `flexsearch` package with weighted title/subtitle/body
 * fields plus a pure fallback matcher so multi-token queries stay exact.
 * Scope: client-side workspaces (/search, /saved, /collections, /workspace, /history).
 */

import { Document as FlexSearchDocument } from "flexsearch";

export interface DiscoverySearchableDoc {
  id: string;
  title: string;
  subtitle?: string | null;
  body?: string | null;
}

export interface DiscoverySearchHit {
  id: string;
  score: number;
}

export interface DiscoveryLocalSearcher {
  search: (query: string, limit?: number) => DiscoverySearchHit[];
  size: number;
}

function norm(value: string | null | undefined): string {
  return (value ?? "").toLowerCase();
}

function isSubsequence(needle: string, target: string): boolean {
  if (!needle) return true;
  let ni = 0;
  for (let ti = 0; ti < target.length && ni < needle.length; ti += 1) {
    if (target[ti] === needle[ni]) ni += 1;
  }
  return ni === needle.length;
}

function fallbackSearch(docs: DiscoverySearchableDoc[]): DiscoveryLocalSearcher {
  const byId = new Map(docs.map((d) => [d.id, d]));
  return {
    size: docs.length,
    search: (query: string, limit = 250): DiscoverySearchHit[] => {
      const q = query.trim().toLowerCase();
      if (!q) return [];
      const tokens = q.split(/\s+/).filter(Boolean);
      const hits: DiscoverySearchHit[] = [];
      for (const doc of docs) {
        const title = norm(doc.title);
        const subtitle = norm(doc.subtitle);
        const body = norm(doc.body);
        let score = 0;
        for (const token of tokens) {
          if (title.includes(token)) score += title === token ? 30 : title.startsWith(token) ? 16 : 10;
          else if (isSubsequence(token, title.replace(/[^a-z0-9]/g, ""))) score += 3;
          if (subtitle.includes(token)) score += 5;
          if (body.includes(token)) score += 2;
        }
        if (score > 0) hits.push({ id: doc.id, score });
      }
      const strict =
        tokens.length > 1
          ? hits.filter((hit) => {
              const d = byId.get(hit.id);
              if (!d) return false;
              const hay = `${d.title} ${d.subtitle ?? ""} ${d.body ?? ""}`.toLowerCase();
              return tokens.every((t) => hay.includes(t) || isSubsequence(t, hay.replace(/[^a-z0-9]/g, "")));
            })
          : hits;
      return strict.sort((a, b) => b.score - a.score).slice(0, limit);
    },
  };
}

export function createDiscoveryLocalSearcher(docs: DiscoverySearchableDoc[]): DiscoveryLocalSearcher {
  if (docs.length === 0) return { size: 0, search: () => [] };
  const fallback = fallbackSearch(docs);
  try {
    const index = new FlexSearchDocument<{
      id: string;
      title: string;
      subtitle: string;
      body: string;
    }>({
      tokenize: "forward",
      document: {
        id: "id",
        index: ["title", "subtitle", "body"],
      },
    });
    for (const d of docs) {
      index.add({
        id: d.id,
        title: d.title ?? "",
        subtitle: d.subtitle ?? "",
        body: d.body ?? "",
      });
    }
    return {
      size: docs.length,
      search: (query: string, limit = 250): DiscoverySearchHit[] => {
        const q = query.trim();
        if (!q) return [];
        const rawResults = index.search(q, { limit, suggest: true }) as Array<{ field: string; result: Array<string | number> }>;
        const scores = new Map<string, number>();
        const weight: Record<string, number> = { title: 12, subtitle: 6, body: 2 };
        for (const group of rawResults) {
          const w = weight[group.field] ?? 1;
          group.result.forEach((id, rank) => {
            const key = String(id);
            scores.set(key, (scores.get(key) ?? 0) + w + Math.max(0, 20 - rank));
          });
        }
        for (const fHit of fallback.search(q, limit)) {
          scores.set(fHit.id, (scores.get(fHit.id) ?? 0) + fHit.score);
        }
        return [...scores.entries()]
          .map(([id, score]) => ({ id, score }))
          .sort((a, b) => b.score - a.score)
          .slice(0, limit);
      },
    };
  } catch {
    return fallback;
  }
}
