import "server-only";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * The one database handle, holding the service-role key.
 *
 * `import "server-only"` is the first line for a reason. This module is the
 * single place the service-role key is read, and that key bypasses row-level
 * security entirely — it is the database, with no restrictions. If a Client
 * Component ever imports this file, directly or through three layers of
 * re-export, the key lands in a JavaScript bundle served to every visitor.
 * `server-only` turns that from a silent catastrophe into a build error.
 *
 * Which is also why the variable is `SUPABASE_SERVICE_ROLE_KEY` and never
 * `NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY`. Next inlines anything with that
 * prefix into the client bundle by name, without asking.
 *
 * There is no anon-key client anywhere in this project. The browser talks to
 * Supabase exactly once — a PUT to a signed upload URL, which carries its own
 * token in the query string — so a public key would be a credential with
 * nothing to do.
 *
 * ── On RLS ────────────────────────────────────────────────────────────────
 * Every table has row-level security enabled and no policies at all. That
 * sounds like theatre given this client bypasses it, and it is not: it means
 * the anon key — public by design — can read and write nothing, so a bucket
 * accidentally flipped public, or a key pasted into a client file, is a
 * non-event rather than a breach. Authorisation itself lives one layer up, in
 * `requireAdmin()` and `getReader()`, because this app authenticates with its
 * own signed cookie and Supabase Auth is not in the picture.
 */

let client: SupabaseClient | null = null;

export function supabaseAdmin(): SupabaseClient {
  if (client) return client;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    throw new Error(
      "NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must both be set.",
    );
  }

  client = createClient(url, key, {
    auth: {
      // No user sessions to keep. Persisting or refreshing one would write to
      // storage that does not exist on a serverless instance, and this client
      // is the service role on every request regardless.
      persistSession: false,
      autoRefreshToken: false,
    },
  });

  return client;
}

/**
 * Whether the project looks asleep rather than broken.
 *
 * A free Supabase project pauses after seven days of inactivity, and every
 * query then fails at the transport layer rather than returning an error the
 * caller can read. The daily cron exists to stop that happening, but a deploy
 * that sat idle over a holiday will still meet it, and "the library is waking
 * up" is a far better page than a stack trace.
 */
export function looksPaused(error: unknown): boolean {
  return /fetch failed|ENOTFOUND|EAI_AGAIN|ECONNREFUSED|ECONNRESET|socket hang up|network|timeout/i.test(
    describe(error),
  );
}

/**
 * Every string an error of any shape might be hiding the cause in.
 *
 * supabase-js does **not** throw `Error` instances. A failed query hands back
 * a plain object — `{ message, details, hint, code }` — which the data layer
 * rethrows as-is, so `String(error)` on it is `"[object Object]"` and any
 * check that relied on that silently matched nothing.
 *
 * That is not a hypothetical: it is how the first version of `looksPaused`
 * failed. It was written for `Error`, met a Postgrest-shaped object, and
 * turned the carefully-worded "the library is waking up" page into a 500 —
 * the exact failure it existed to prevent, in the exact circumstance it was
 * written for. Hence: gather every candidate string and test the lot.
 *
 * The transport-level cause is usually in `details` rather than `message`, and
 * the `cause` chain is where Node puts `ENOTFOUND`, so both are walked.
 */
function describe(error: unknown): string {
  const parts: string[] = [];
  let current: unknown = error;

  for (let depth = 0; current && depth < 5; depth++) {
    if (typeof current === "string") {
      parts.push(current);
      break;
    }
    if (typeof current !== "object") break;

    const shape = current as {
      message?: unknown;
      details?: unknown;
      code?: unknown;
      cause?: unknown;
    };
    for (const field of [shape.message, shape.details, shape.code]) {
      if (typeof field === "string") parts.push(field);
    }
    current = shape.cause;
  }

  return parts.join(" ");
}
