"use client";

import { useEffect, useState } from "react";
import type { SessionSummary } from "@/app/api/session/route";

/**
 * The current session, read from `/api/session` after the page has painted.
 *
 * One request per document, not per component: the header renders the account
 * in two places (the bar and the mobile panel) and neither should cause its own
 * round trip. The promise is cached at module scope, so whichever mounts first
 * makes the call and the other awaits the same one.
 *
 * Deliberately no revalidation on focus or interval. A session lasts eight
 * hours and the only thing that ends one mid-visit is signing out, which
 * navigates, and a navigation discards this module along with its cache.
 */

let inflight: Promise<SessionSummary | null> | null = null;

function load(): Promise<SessionSummary | null> {
  inflight ??= fetch("/api/session", { credentials: "same-origin" })
    .then((response) => (response.ok ? response.json() : null))
    .then((body) => (body?.session as SessionSummary | undefined) ?? null)
    // A failed request is not a signed-out reader, but the header has nothing
    // better to show than the signed-out state, and clearing the cache lets the
    // next mount try again.
    .catch(() => {
      inflight = null;
      return null;
    });
  return inflight;
}

export interface SessionState {
  session: SessionSummary | null;
  /** True until the first answer arrives; the header shows nothing meanwhile. */
  loading: boolean;
}

export function useSession(): SessionState {
  const [state, setState] = useState<SessionState>({
    session: null,
    loading: true,
  });

  useEffect(() => {
    let live = true;
    load().then((session) => {
      if (live) setState({ session, loading: false });
    });
    return () => {
      live = false;
    };
  }, []);

  return state;
}

export type { SessionSummary };
