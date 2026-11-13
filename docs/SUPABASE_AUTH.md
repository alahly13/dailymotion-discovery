# Supabase Authentication & Admin Session Architecture — Dailymotion Discovery (2026)

This document details the authentication and authorization model of **Dailymotion Discovery**, including Supabase Auth SSR, admin single identity, session expiration policies, and route gating.

---

## 1. Single Authority: Supabase Auth

1. **Zero Passwords in PostgreSQL**:
   All user identities, passwords, and multi-factor credentials reside solely within **Supabase Auth** (`auth.users`).
2. **Canonical Administrator Identity**:
   - Username: `asdy`
   - Canonical Auth Email: `asdy@dailymotion.discov.com`
   - Server-side email resolution in `src/lib/admin/session.ts` maps login inputs `asdy`, `asdy@dailymotion.discov.com`, or legacy aliases to the canonical Supabase user without exposing the mapping to unauthenticated clients.

---

## 2. Server-Side Rendering (SSR) & Session Lifecycle

### Next.js 16 Proxy Convention (`src/proxy.ts`)
The application uses the Next.js 16 proxy convention with `@supabase/ssr` to refresh session cookies on incoming requests:

```typescript
// src/proxy.ts
import type { NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

export async function proxy(request: NextRequest) {
  return updateSession(request);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
```

### 7-Day Session TTL (`ADMIN_SESSION_TTL_SECONDS="604800"`)
- The administrator session cookie `dm_admin_session` is an HMAC-SHA256 signed stateless token (`src/lib/admin/session.ts`).
- Cookie flags: `httpOnly: true`, `sameSite: "lax"`, `path: "/"`, `maxAge: 604800` (7 days), `secure: true` in production.
- Token structure: `base64url(payload).hmac_signature` where payload includes `{ u: "asdy", exp: epoch_seconds }`.
- When `parsed.exp * 1000 < Date.now()`, the session is rejected as expired, preventing stale access even if browser cookies linger.

---

## 3. Server-Side Protection Boundaries

### Protected Route Handlers (`requireAdmin`)
Routes under `/api/cloud/*`, `/api/admin/*`, `/api/sync/*`, and `/api/storage/*` are strictly protected by `requireAdmin()`:

```typescript
// src/lib/admin/require-admin.ts
const session = await verifyAdminRequest(request);
if (!session) {
  return NextResponse.json({ ok: false, error: "Unauthorized." }, { status: 401 });
}
```

### Change Password Workflow
- Endpoint: `POST /api/admin/change-password`
- Caller must possess an active `dm_admin_session`.
- Re-authenticates current password with Supabase Auth before updating to the new password via `supabase.auth.updateUser({ password: newPassword })`.
- Updates occur through the authenticated Supabase client without exposing service role credentials.
