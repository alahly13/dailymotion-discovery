import { NextResponse } from "next/server";
import { z } from "zod";
import { AiRouteError, generateGeminiJson } from "@/lib/ai/gemini-client";
import { compactManifestContext } from "@/lib/ai/manifest-context";
import { AI_SAFETY_PROMPT } from "@/lib/ai/prompts";

const SummarizeManifestRequestSchema = z.object({
  manifest: z.unknown().refine((val) => val !== undefined && val !== null, "Manifest summary payload is required."),
});

export async function POST(request: Request) {
  try {
    const body = SummarizeManifestRequestSchema.safeParse(await request.json().catch(() => null));
    if (!body.success) {
      return NextResponse.json(
        { ok: false, error: body.error.issues[0]?.message ?? "Manifest metadata is required.", reason: "user_input_error" },
        { status: 400 },
      );
    }

    const compacted = compactManifestContext(body.data.manifest);
    const serialized = compacted.serialized;
    if (!serialized || serialized === "{}" || serialized === "[]") {
      return NextResponse.json(
        { ok: false, error: "Manifest summary is empty. Load or analyze items first.", reason: "user_input_error" },
        { status: 400 },
      );
    }

    const prompt = [
      AI_SAFETY_PROMPT,
      "Summarize ONLY what exists in this fetched metadata snapshot without inventing videos, URLs, or figures.",
      `Cite evidence IDs strictly from this set when referencing specific items: ${compacted.evidenceIds.join(", ") || "none"}.`,
      'Return JSON: {"summary": string, "highlights": string[]}',
      `Metadata snapshot: ${serialized}`,
    ].join("\n");

    const raw = await generateGeminiJson<{ summary?: unknown; highlights?: unknown }>(prompt);
    const summary =
      typeof raw?.summary === "string" && raw.summary.trim()
        ? raw.summary.trim()
        : "Grounded metadata summary generated from current items.";
    const highlights = Array.isArray(raw?.highlights)
      ? raw.highlights.filter((item): item is string => typeof item === "string" && item.trim().length > 0).slice(0, 6)
      : [];

    return NextResponse.json({
      ok: true,
      summary,
      highlights,
      text: summary,
    });
  } catch (error) {
    if (error instanceof AiRouteError) {
      return NextResponse.json(
        { ok: false, error: error.message, reason: error.reason },
        { status: error.status },
      );
    }
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "AI manifest summary failed.", reason: "unknown" },
      { status: 500 },
    );
  }
}
