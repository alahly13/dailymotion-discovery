/**
 * Compatibility re-export for server callers importing `@/lib/db/prisma`.
 * Canonical Prisma ORM 7 singleton lives in `@/lib/prisma/client`.
 */
export { getPrismaClient } from "@/lib/prisma/client";
