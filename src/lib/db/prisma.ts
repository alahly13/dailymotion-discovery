// Canonical Prisma access: src/lib/db/prisma.ts.
//
// What this controls: the single PrismaClient singleton for the app.
// Why this file exists: canonical import path for all persistence code.
// It reuses the existing adapter-pg singleton (no second pool, no duplicate
// client) while resolving the connection via the canonical env contract.
// Scope: server-only. Never import from client components.

export { getPrismaClient } from "@/lib/prisma/client";
