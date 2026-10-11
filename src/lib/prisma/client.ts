import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { resolveDatabaseUrl } from "@/lib/db/database-url";

const globalForPrisma = globalThis as unknown as {
  dailymotionDiscoveryPrisma?: PrismaClient;
};

// Channel Explorer route handlers run in the Node.js server runtime only. This
// singleton keeps Prisma out of browser/proxy code and avoids creating extra
// clients during Next.js hot reloads, which is important for Supabase pooler
// connection pressure and future Vercel deployments.
export function getPrismaClient() {
  if (!globalForPrisma.dailymotionDiscoveryPrisma) {
    // Canonical contract: DATABASE_URL_CONNECTION_STRING first, legacy
    // DATABASE_URL with a sanitized deprecation warning. Never printed.
    const connectionString = resolveDatabaseUrl();

    const adapter = new PrismaPg({
      connectionString,
      connectionTimeoutMillis: 30_000,
      max: 5,
    });

    globalForPrisma.dailymotionDiscoveryPrisma = new PrismaClient({ adapter });
  }

  return globalForPrisma.dailymotionDiscoveryPrisma;
}
