// Countdown formatting for token expiry (pure, UI-agnostic).
// Shared by the global status bar and its tests.

/** HH:MM:SS countdown; "Expired" past expiry; null when no token timestamp. */
export function formatCountdown(expiresAt: number | null, now: number): string | null {
  if (expiresAt === null) return null;
  const remaining = Math.max(0, Math.floor((expiresAt - now) / 1000));
  if (remaining <= 0) return "Expired";
  const h = Math.floor(remaining / 3600);
  const m = Math.floor((remaining % 3600) / 60);
  const s = remaining % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return `Expires in ${pad(h)}:${pad(m)}:${pad(s)}`;
}
