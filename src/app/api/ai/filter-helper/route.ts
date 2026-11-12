import { NextResponse } from "next/server";
import { z } from "zod";
import { validateAiFilters } from "@/lib/ai/ai-schemas";
import { AiRouteError, generateGeminiJson } from "@/lib/ai/gemini-client";
import { compactManifestContext } from "@/lib/ai/manifest-context";
import { AI_SAFETY_PROMPT } from "@/lib/ai/prompts";

const FilterHelperRequestSchema = z.object({
  instruction: z.string().trim().max(600).optional(),
  manifestSummary: z.unknown(),
});

export async function POST(request: Request) {
  try {
    const body = FilterHelperRequestSchema.safeParse(await request.json().catch(() => null));
    if (!body.success) {
      return NextResponse.json(
        { ok: false, error: "Invalid filter helper request payload.", reason: "user_input_error" },
        { status: 400 },
      );
    }

    const compacted = compactManifestContext(body.data.manifestSummary ?? {}, { maxChars: 6500 });
    const prompt = [
      AI_SAFETY_PROMPT,
      "Analyze the current workspace or Channel Manifest summary and instruction, then return JSON matching:",
      `{"filters": {"keyword"?: string, "excludeKeyword"?: string, "tags"?: string, "minViews"?: number, "maxViews"?: number, "durationMin"?: number, "durationMax"?: number, "year"?: number, "yearFrom"?: number, "yearTo"?: number, "dateFrom"?: "YYYY-MM-DD", "dateTo"?: "YYYY-MM-DD", "language"?: string, "channel"?: string, "owner"?: string, "hasThumbnail"?: boolean, "hasDescription"?: boolean}, "explanation": string, "warnings": string[]}`,
      "Note: durationMin and durationMax are in SECONDS.",
      `Current manifest summary: ${compacted.serialized}`,
      `Instruction: ${body.data.instruction || "Suggest high-signal metadata filters."}`,
    ].join("\n");

    const raw = await generateGeminiJson<{ filters?: unknown; explanation?: unknown; warnings?: unknown }>(prompt);
    const filters = validateAiFilters(raw?.filters ?? raw);
    const explanation =
      typeof raw?.explanation === "string" && raw.explanation.trim()
        ? raw.explanation.trim()
        : "Suggested safe metadata filters based on the loaded dataset.";
    const warnings = Array.isArray(raw?.warnings)
      ? raw.warnings.filter((w): w is string => typeof w === "string" && w.trim().length > 0).slice(0, 4)
      : [];

    return NextResponse.json({
      ok: true,
      filters,
      explanation,
      warnings,
      text: explanation,
    });
  } catch (error) {
    if (error instanceof AiRouteError) {
      return NextResponse.json(
        { ok: false, error: error.message, reason: error.reason },
        { status: error.status },
      );
    }
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "AI filter helper failed.", reason: "unknown" },
      { status: 500 },
    );
  }
}
