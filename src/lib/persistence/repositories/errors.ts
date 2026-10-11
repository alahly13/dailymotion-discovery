// Shared persistence errors (sanitized, actionable, never secret-bearing).

export class PersistenceUnavailableError extends Error {
  constructor(message = "Database unavailable. Retry shortly; no data was changed.") {
    super(message);
    this.name = "PersistenceUnavailableError";
  }
}

/** Map Prisma/connection failures to PersistenceUnavailableError; rethrow rest. */
export function toPersistenceError(error: unknown): Error {
  if (error instanceof PersistenceUnavailableError) return error;
  const message = error instanceof Error ? error.message : String(error);
  if (/P1000|P1001|P1011|connect|timeout|ECONNREFUSED|ENOTFOUND/i.test(message)) {
    return new PersistenceUnavailableError(
      "Database unreachable (check DATABASE_URL_CONNECTION_STRING + network). No data was changed."
    );
  }
  return error instanceof Error ? error : new Error("Persistence operation failed.");
}
