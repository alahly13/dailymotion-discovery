import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { resolveDatabaseUrl } from "@/lib/db/database-url";

const globalForPrisma = globalThis as unknown as {
  dailymotionDiscoveryPrisma?: PrismaClient;
};

/**
 * Canonical server-side Prisma ORM 7 singleton using @prisma/adapter-pg.
 * Scope: Node.js route handlers, server components, and persistence repositories.
 * Never import into Client Components or browser/Edge bundles, and keep the
 * global singleton so Next.js hot reloads and Supabase poolers do not exhaust slots.
 */
export function getPrismaClient(): PrismaClient {
  if (!globalForPrisma.dailymotionDiscoveryPrisma) {
    // Primary: DATABASE_URL; Backup: SUPABASE_DATABASE_URL_CONNECTION_STRING.
    const connectionString = resolveDatabaseUrl();
    const rawTimeoutSeconds = Number.parseInt(
      process.env.PRISMA_CONNECT_TIMEOUT_SECONDS ?? "30",
      10,
    );
    const connectionTimeoutMillis =
      Number.isFinite(rawTimeoutSeconds) && rawTimeoutSeconds > 0
        ? rawTimeoutSeconds * 1000
        : 30_000;

    const adapter = new PrismaPg({
      connectionString,
      connectionTimeoutMillis,
      max: 5,
    });

    globalForPrisma.dailymotionDiscoveryPrisma = new PrismaClient({ adapter });
  }

  return globalForPrisma.dailymotionDiscoveryPrisma;
}
