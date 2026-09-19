/**
 * Postgres errors, translated into something a person can act on.
 *
 * In its own module rather than beside the actions that use it because a
 * `"use server"` file may only export async functions — Next turns every
 * export into a callable endpoint, and a synchronous helper exported from one
 * is a build error rather than a subtle mistake.
 */

/**
 * The constraint violations this app expects, and what they mean here.
 *
 * `23505` is a sibling-name unique index. It is caught rather than pre-empted
 * with a SELECT, because a pre-check races: two renames to the same name,
 * started together, both find nothing in the way and both proceed, and the
 * database refuses the second regardless. The constraint is the decision; this
 * only puts it into words.
 *
 * The cycle case arrives as a raised exception rather than a SQLSTATE, so it
 * is matched on its message — which is why `folders_reject_cycle` raises a
 * fixed English string rather than an interpolated one.
 */
export function describeDbError(error: unknown): string {
  const code = (error as { code?: string } | null)?.code;
  const message = (error as { message?: string } | null)?.message ?? "";

  if (code === "23505") {
    return "Something with that name is already in this folder.";
  }
  if (code === "23514") {
    return "That name is not allowed.";
  }
  if (/moved inside itself/i.test(message)) {
    return "A folder cannot be moved inside itself.";
  }
  if (/too deep/i.test(message)) {
    return "That folder is nested too deeply.";
  }
  return "Could not save that. Try again.";
}
