import { afterEach, describe, expect, it, vi } from "vitest";
import { commitBatch } from "../commit";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("batch payload validation", () => {
  it("rejects invalid batches without touching backends", async () => {
    const fetchMock = vi.fn(async () => {
      throw new Error("no network allowed");
    });
    vi.stubGlobal("fetch", fetchMock);
    const result = await commitBatch({ savedTitles: [{ platform: "", platformVideoId: "", title: "" }] });
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/Invalid batch/);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects missing idempotency keys", async () => {
    const result = await commitBatch({ savedTitles: [] });
    expect(result.ok).toBe(false);
  });

  it("fails closed with a remedy when the database is unconfigured", async () => {
    vi.stubEnv("DATABASE_URL_CONNECTION_STRING", "");
    vi.stubEnv("DATABASE_URL", "");
    const result = await commitBatch({ idempotencyKey: "test-key-123", savedTitles: [], history: [], includeSnapshot: false });
    expect(result.ok).toBe(false);
    expect(result.remedy).toMatch(/drafts stay local/i);
  });
});
