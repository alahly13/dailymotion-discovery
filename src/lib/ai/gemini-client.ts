import { GoogleGenAI } from "@google/genai";
import { env } from "@/lib/config/env";

/**
 * Structured error thrown by Gemini AI routes so HTTP handlers preserve accurate
 * status codes (400 validation, 429 rate-limit, 502 bad model JSON, 503 missing config)
 * instead of collapsing failures to generic 400s.
 */
export class AiRouteError extends Error {
  constructor(
    message: string,
    public status = 503,
    public reason: string = "unavailable",
  ) {
    super(message);
    this.name = "AiRouteError";
  }
}

export interface GeminiGenerateOptions {
  systemInstruction?: string;
  responseMimeType?: "text/plain" | "application/json";
}

function isPlaceholderKey(value: string): boolean {
  const normalized = value.trim().toLowerCase();
  return (
    normalized.length < 16 ||
    normalized.startsWith("your-") ||
    normalized.startsWith("your_") ||
    normalized.includes("placeholder") ||
    normalized === "changeme"
  );
}

function getGeminiClient(): GoogleGenAI {
  let key: string;
  try {
    key = env.geminiApiKey;
  } catch {
    throw new AiRouteError(
      "AI features are currently unavailable because GEMINI_API_KEY is not configured.",
      503,
      "missing_config",
    );
  }

  if (isPlaceholderKey(key)) {
    throw new AiRouteError(
      "AI features are currently unavailable because GEMINI_API_KEY contains a placeholder value.",
      503,
      "missing_config",
    );
  }

  // Gemini client and model configuration belong strictly on the server so keys
  // and model overrides never enter browser bundles.
  return new GoogleGenAI({ apiKey: key });
}

function mapGeminiSdkError(error: unknown): AiRouteError {
  if (error instanceof AiRouteError) return error;
  const message = error instanceof Error ? error.message : String(error);
  if (/429|quota|rate.?limit|resource_exhausted/i.test(message)) {
    return new AiRouteError("Gemini rate limit or quota reached. Retry shortly.", 429, "rate_limited");
  }
  if (/401|403|api.?key|permission_denied|unauthenticated/i.test(message)) {
    return new AiRouteError("GEMINI_API_KEY was rejected by the Gemini API.", 503, "invalid_config");
  }
  return new AiRouteError("AI service is temporarily unavailable.", 503, "network_error");
}

export async function generateGeminiText(prompt: string, options: GeminiGenerateOptions = {}): Promise<string> {
  try {
    const ai = getGeminiClient();
    const response = await ai.models.generateContent({
      model: env.geminiModel,
      contents: prompt,
      config:
        options.systemInstruction || options.responseMimeType
          ? {
              ...(options.systemInstruction ? { systemInstruction: options.systemInstruction } : {}),
              ...(options.responseMimeType ? { responseMimeType: options.responseMimeType } : {}),
            }
          : undefined,
    });
    const text = response.text?.trim();
    if (!text) {
      throw new AiRouteError("AI returned an empty response.", 502, "invalid_response");
    }
    return text;
  } catch (error) {
    throw mapGeminiSdkError(error);
  }
}

/**
 * Generates structured JSON using Gemini `application/json` output mode with
 * safe markdown code-fence stripping for callers expecting typed filter/query objects.
 */
export async function generateGeminiJson<T>(prompt: string, systemInstruction?: string): Promise<T> {
  const raw = await generateGeminiText(prompt, {
    systemInstruction,
    responseMimeType: "application/json",
  });
  const cleaned = raw
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();

  try {
    return JSON.parse(cleaned) as T;
  } catch {
    throw new AiRouteError("AI returned malformed JSON output.", 502, "invalid_response");
  }
}
