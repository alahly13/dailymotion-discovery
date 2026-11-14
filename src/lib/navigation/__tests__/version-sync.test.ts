// Version Synchronization Test Suite (2026)
//
// Verifies:
// 1. URL search param (?v=v1|v2) is the canonical source of truth for API version.
// 2. setUrlApiVersion updates URL and dispatches API_VERSION_EVENT.
// 3. Existing search params (e.g. query, filters) are preserved during version toggle.
// 4. Default fallbacks when no ?v param is present.

import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";
import {
  getUrlApiVersion,
  setUrlApiVersion,
  API_VERSION_EVENT,
} from "../version-sync";

describe("API Version Synchronization", () => {
  let listeners: Record<string, ((event: any) => void)[]> = {};
  let currentSearch = "";

  beforeEach(() => {
    listeners = {};
    currentSearch = "";

    (globalThis as any).window = {
      location: {
        get search() {
          return currentSearch;
        },
        set search(val: string) {
          currentSearch = val;
        },
      },
      history: {
        replaceState: (_data: any, _unused: string, url: string) => {
          const parsed = new URL(url, "https://example.com");
          currentSearch = parsed.search;
        },
      },
      addEventListener: (type: string, fn: (event: any) => void) => {
        listeners[type] = listeners[type] || [];
        listeners[type].push(fn);
      },
      removeEventListener: (type: string, fn: (event: any) => void) => {
        listeners[type] = (listeners[type] || []).filter((f) => f !== fn);
      },
      dispatchEvent: (event: any) => {
        (listeners[event.type] || []).forEach((fn) => fn(event));
        return true;
      },
    };

    (globalThis as any).CustomEvent = class CustomEvent {
      type: string;
      detail: any;
      constructor(type: string, init?: { detail?: any }) {
        this.type = type;
        this.detail = init?.detail;
      }
    };
  });

  afterEach(() => {
    delete (globalThis as any).window;
    delete (globalThis as any).CustomEvent;
  });

  it("extracts v1 when ?v=v1 is present", () => {
    (globalThis as any).window.location.search = "?v=v1";
    expect(getUrlApiVersion()).toBe("v1");
  });

  it("extracts v2 when ?v=v2 is present", () => {
    (globalThis as any).window.location.search = "?v=v2";
    expect(getUrlApiVersion()).toBe("v2");
  });

  it("falls back to default fallback version when ?v is absent", () => {
    (globalThis as any).window.location.search = "";
    expect(getUrlApiVersion("v1")).toBe("v1");
    expect(getUrlApiVersion("v2")).toBe("v2");
  });

  it("updates URL and dispatches API_VERSION_EVENT when setUrlApiVersion is called", () => {
    (globalThis as any).window.location.search = "?q=space&sort=relevance";

    const listener = vi.fn();
    (globalThis as any).window.addEventListener(API_VERSION_EVENT, listener);

    setUrlApiVersion("v2");

    const params = new URLSearchParams((globalThis as any).window.location.search);
    expect(params.get("v")).toBe("v2");
    expect(params.get("q")).toBe("space");
    expect(params.get("sort")).toBe("relevance");

    expect(listener).toHaveBeenCalled();
    const event = listener.mock.calls[0][0];
    expect(event.detail).toBe("v2");

    (globalThis as any).window.removeEventListener(API_VERSION_EVENT, listener);
  });
});
