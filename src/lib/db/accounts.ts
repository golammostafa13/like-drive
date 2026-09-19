import "server-only";

import { supabaseAdmin } from "@/lib/supabase/admin";
import type { Role } from "@/lib/auth/config";

/**
 * The register of addresses that have opened the door.
 *
 * This is a record, never a gate. Nothing here is consulted when deciding
 * whether to let someone in — `doorRole` does that, offline, from the password
 * and the admin list — and a row appearing for a new address is exactly what
 * "each email is a new account" means here: the account is created by being
 * used, and it confers nothing that any other address does not have.
 *
 * It exists so the drive's owner can see who is reading, which a shared
 * password otherwise makes unknowable.
 */
export interface Account {
  email: string;
  role: Role;
  firstSeenAt: string;
  lastSeenAt: string;
  visits: number;
}

/**
 * Record a sign-in: create the account, or bump it.
 *
 * Deliberately not awaited by the sign-in path in a way that can fail it. A
 * person typing the right password should be let in even if this write cannot
 * happen, because the write is bookkeeping and the password is the decision —
 * see the `.catch` at the call site in `lib/actions/auth`.
 *
 * `visits` is incremented in SQL rather than read-then-written, so two tabs
 * signing in at once cannot both read 4 and both write 5.
 */
export async function noteSignIn(email: string, role: Role): Promise<void> {
  const { error } = await supabaseAdmin().rpc("note_sign_in", {
    p_email: email,
    p_role: role,
  });
  if (error) throw error;
}

export async function listAccounts(): Promise<Account[]> {
  const { data, error } = await supabaseAdmin()
    .from("accounts")
    .select("email, role, first_seen_at, last_seen_at, visits")
    .order("last_seen_at", { ascending: false });

  if (error) throw error;

  return (
    data as {
      email: string;
      role: Role;
      first_seen_at: string;
      last_seen_at: string;
      visits: number;
    }[]
  ).map((row) => ({
    email: row.email,
    role: row.role,
    firstSeenAt: row.first_seen_at,
    lastSeenAt: row.last_seen_at,
    visits: row.visits,
  }));
}
