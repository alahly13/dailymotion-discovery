import { NextResponse } from "next/server";
import { z } from "zod";
import { validateAiParsedQuery } from "@/lib/ai/ai-schemas";
import { AiRouteError, generateGeminiJson } from "@/lib/ai/gemini-client";
import { AI_SAFETY_PROMPT } from "@/lib/ai/prompts";

const ParseQueryRequestSchema = z.object({
  query: z.string().trim().min(1, "Query is required.").max(600, "Query is too long."),
});

export async function POST(request: Request) {
  try {
    const body = ParseQueryRequestSchema.safeParse(await request.json().catch(() => null));
    if (!body.success) {
      return NextResponse.json(
        { ok: false, error: body.error.issues[0]?.message ?? "Query is required.", reason: "user_input_error" },
        { status: 400 },
      );
    }

    const prompt = [
      AI_SAFETY_PROMPT,
      "Convert the user's video discovery request into JSON matching this exact shape:",
      `{"searchQuery": string, "channel"?: string, "country"?: string, "language"?: string, "tags"?: string, "sort"?: "relevance"|"recent"|"visited"|"visited-hour"|"visited-day"|"visited-week"|"visited-month", "longerThan"?: number, "shorterThan"?: number, "createdAfter"?: "YYYY-MM-DD", "createdBefore"?: "YYYY-MM-DD", "explanation": string, "warnings": string[]}`,
      "Note: longerThan and shorterThan are duration bounds in MINUTES; country and language are ISO-2 codes (e.g. us, fr, en, ar).",
      `User query: ${body.data.query}`,
    ].join("\n");

    const raw = await generateGeminiJson<Record<string, unknown>>(prompt);
    const parsed = validateAiParsedQuery(raw, body.data.query);
    return NextResponse.json({
      ok: true,
      parsed,
      text: parsed.explanation,
    });
  } catch (error) {
    if (error instanceof AiRouteError) {
      return NextResponse.json(
        { ok: false, error: error.message, reason: error.reason },
        { status: error.status },
      );
    }
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "AI query parsing failed.", reason: "unknown" },
      { status: 500 },
    );
  }
}
