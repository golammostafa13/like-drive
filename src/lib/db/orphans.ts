import "server-only";

import { deleteObjects } from "@/lib/storage/signing";
import { supabaseAdmin } from "@/lib/supabase/admin";

/**
 * Draining the tombstones.
 *
 * `orphan_objects` is written by a trigger, inside the transaction that
 * deletes a file row, so by the time anything here runs the rows are already
 * gone and the objects are already unreferenced. That is what makes every
 * storage call below safe to fail: a failure leaves a queued tombstone, and
 * the daily cron tries again.
 *
 * Called twice: immediately after a delete, so the common case reclaims space
 * at once, and from `/api/cron/maintain` for whatever did not.
 */

interface OrphanRow {
  id: number;
  bucket: string;
  object_key: string;
}

export async function drainOrphans(limit = 500): Promise<{
  deleted: number;
  failed: number;
}> {
  const { data, error } = await supabaseAdmin()
    .from("orphan_objects")
    .select("id, bucket, object_key")
    .order("queued_at")
    .limit(limit);

  if (error) throw error;

  const rows = (data ?? []) as OrphanRow[];
  if (!rows.length) return { deleted: 0, failed: 0 };

  // Group by bucket: `remove` takes a list of keys within one bucket.
  const byBucket = new Map<string, OrphanRow[]>();
  for (const row of rows) {
    const group = byBucket.get(row.bucket) ?? [];
    group.push(row);
    byBucket.set(row.bucket, group);
  }

  const doneIds: number[] = [];
  let failed = 0;

  for (const [bucket, group] of byBucket) {
    const { deleted } = await deleteObjects(
      bucket,
      group.map((row) => row.object_key),
    );
    const deletedSet = new Set(deleted);
    for (const row of group) {
      if (deletedSet.has(row.object_key)) doneIds.push(row.id);
      else failed += 1;
    }
  }

  if (doneIds.length) {
    // Only the tombstones whose objects actually went are cleared. The rest
    // stay queued, which is the whole point of the table.
    await supabaseAdmin().from("orphan_objects").delete().in("id", doneIds);
  }

  // Note the attempt on what is left, so a key that can never be deleted —
  // because it was removed by hand, say — is visible rather than retried
  // silently forever.
  const stuckIds = rows
    .map((row) => row.id)
    .filter((id) => !doneIds.includes(id));

  if (stuckIds.length) {
    await supabaseAdmin().rpc("bump_orphan_attempts", { p_ids: stuckIds });
  }

  return { deleted: doneIds.length, failed };
}

/**
 * Reap reservations whose upload never arrived.
 *
 * Two hours because that is how long a Supabase signed upload URL lives, and
 * that lifetime is fixed rather than configurable: past it the ticket is dead
 * and the bytes can never turn up, so the row is not "in progress", it is
 * abandoned. Deleting it fires the same trigger as any other file delete, so
 * a half-uploaded object is queued for removal too.
 */
export async function reapPendingUploads(): Promise<number> {
  const cutoff = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();

  const { data, error } = await supabaseAdmin()
    .from("files")
    .delete()
    .eq("status", "pending")
    .lt("created_at", cutoff)
    .select("id");

  if (error) throw error;
  return data?.length ?? 0;
}

/** One write a day is all it takes to keep a free project from pausing. */
export async function beat(): Promise<void> {
  const { error } = await supabaseAdmin()
    .from("heartbeat")
    .update({ beat_at: new Date().toISOString() })
    .eq("id", 1);
  if (error) throw error;
}
