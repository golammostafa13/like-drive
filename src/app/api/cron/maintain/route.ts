import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { beat, drainOrphans, reapPendingUploads } from "@/lib/db/orphans";

/**
 * The daily housekeeping, and the thing that keeps the lights on.
 *
 * Three jobs, in order of how much trouble skipping them causes:
 *
 * 1. **Beat.** A free Supabase project pauses after seven days without
 *    activity, and a paused project fails *everything* — listing, reading,
 *    signing in — until someone clicks Restore in the dashboard. One write a
 *    day keeps the clock permanently reset. Note this only *prevents* a pause;
 *    it cannot cure one, so a deploy that sits idle past the window still
 *    needs a human.
 *
 * 2. **Reap.** Delete `pending` file rows older than two hours. Two hours
 *    because that is the fixed, non-configurable lifetime of a Supabase signed
 *    upload URL: past it the ticket is dead and the bytes can never arrive, so
 *    the row is not in progress, it is abandoned. Deleting it fires the same
 *    trigger as any other file delete, so a half-uploaded object is queued for
 *    removal too.
 *
 * 3. **Drain.** Remove the storage objects whose tombstones are sitting in
 *    `orphan_objects` — anything a delete could not reach at the time. This is
 *    the retry that lets every other storage call in the codebase be
 *    best-effort.
 *
 * ── On the schedule ───────────────────────────────────────────────────────
 * Vercel's Hobby plan allows one cron run per day and runs them only against
 * production deployments, with timing approximate to the hour. All three jobs
 * above are indifferent to the exact minute, and one run a day is comfortably
 * inside a seven-day window.
 */

export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(request: NextRequest) {
  // Vercel sends `Authorization: Bearer $CRON_SECRET`. Checked rather than
  // trusted-by-obscurity, because this endpoint deletes rows: unguarded, it is
  // a URL anyone can call to make the reaper run at a moment of their
  // choosing. With no secret configured it refuses rather than running openly.
  const secret = process.env.CRON_SECRET;
  const offered = request.headers.get("authorization");

  if (!secret || offered !== `Bearer ${secret}`) {
    return new NextResponse(null, { status: 401 });
  }

  const report: Record<string, unknown> = {};

  // Each job is isolated. The beat is the one that must happen — it is what
  // stops the project pausing — so a failure in the reaper or the drain must
  // not prevent it, and none of the three failing should fail the request in a
  // way that makes Vercel stop scheduling it.
  try {
    await beat();
    report.beat = "ok";
  } catch (error) {
    report.beat = String(error);
  }

  try {
    report.reaped = await reapPendingUploads();
  } catch (error) {
    report.reaped = String(error);
  }

  try {
    report.drained = await drainOrphans();
  } catch (error) {
    report.drained = String(error);
  }

  return NextResponse.json(report, {
    headers: { "Cache-Control": "no-store" },
  });
}
