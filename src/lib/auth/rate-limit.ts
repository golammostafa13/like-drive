import "server-only";

import { supabaseAdmin } from "@/lib/supabase/admin";

/**
 * A fixed-window rate limit for the door.
 *
 * The reader password is short and shared, so without a throttle it is not a
 * lock: there is no account to lock out, no address to alert, and the whole
 * search space is a few thousand guesses. This is the only thing standing
 * between the library and someone counting upwards, which makes it
 * load-bearing rather than decorative.
 *
 * ── Why Postgres and not a Map ────────────────────────────────────────────
 * The sibling libraries fall back to an in-process Map when Redis is not
 * configured. On a serverless host that quietly turns "ten attempts per
 * address" into "ten attempts per instance", and instances are cheap: the
 * limit reads as enforced while barely existing. The counter has to live
 * somewhere every instance shares, and there is already a database here.
 *
 * `note_door_attempt` does the increment, the window roll-over and the verdict
 * in one statement, so two simultaneous attempts cannot both read a stale
 * count.
 */

const WINDOW_SECONDS = 10 * 60;
const MAX_ATTEMPTS = 10;

/**
 * The client's address, as well as it can be known.
 *
 * `x-real-ip` first, deliberately, where the siblings read `x-forwarded-for`.
 * `x-forwarded-for` is a list each hop appends to, so its first entry is
 * whatever the *client* sent if the edge does not overwrite it — which makes
 * the limit trivially evadable by varying one header. `x-real-ip` is set by
 * Vercel itself and is not client-supplied.
 *
 * The fallback is a single shared bucket rather than "unlimited": a request
 * nobody can attribute still gets counted, just counted together with every
 * other unattributable request.
 */
export function clientAddress(headers: Headers): string {
  const real = headers.get("x-real-ip")?.trim();
  if (real) return real;

  const forwarded = headers.get("x-forwarded-for");
  const first = forwarded?.split(",")[0]?.trim();
  return first || "unknown";
}

export interface RateLimitResult {
  ok: boolean;
  /** Whole seconds until the window rolls over. Shown to the person waiting. */
  retryAfterSeconds: number;
}

/**
 * Count one attempt and say whether it is allowed.
 *
 * Called on every submission, including successful ones: a limit that counts
 * only failures lets someone who already has the reader password hammer the
 * admin password for free.
 */
export async function checkDoorAttempt(
  address: string,
): Promise<RateLimitResult> {
  try {
    const { data, error } = await supabaseAdmin().rpc("note_door_attempt", {
      p_key: `door:${address}`,
      p_window_seconds: WINDOW_SECONDS,
      p_max: MAX_ATTEMPTS,
    });

    if (error || !data?.[0]) throw error ?? new Error("no row");

    return {
      ok: data[0].allowed,
      retryAfterSeconds: data[0].retry_after_seconds ?? WINDOW_SECONDS,
    };
  } catch {
    // Fail *open*, and be clear-eyed about the trade. A limiter that fails
    // closed locks every reader out of a library of free books because the
    // database had a bad minute — a certain outage to prevent a hypothetical
    // one. The password is still required; only the throttle is missing, and
    // only for as long as the database is unreachable, during which nothing
    // else on the site works either.
    return { ok: true, retryAfterSeconds: 0 };
  }
}

export { MAX_ATTEMPTS, WINDOW_SECONDS };
