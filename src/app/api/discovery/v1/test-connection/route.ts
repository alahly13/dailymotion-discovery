// POST /api/discovery/v1/test-connection — genuine V1 token + API probe.
// Sanitized: no keys, secrets, or tokens in the response. Same-version only.

import { NextResponse } from "next/server";
import { testVersionConnection } from "@/lib/discovery/connection-test";

export async function POST() {
  try {
    return NextResponse.json(await testVersionConnection("v1"));
  } catch {
    return NextResponse.json(
      { ok: false, version: "v1", testedAt: new Date().toISOString(), steps: [], token: { acquired: false, expiresIn: null, scope: null, fromCache: false }, api: null, remedy: "Connection test crashed server-side; retry shortly." },
      { status: 500 }
    );
  }
}
