"use client";

/**
 * The PUT that carries the bytes, and the only conversation the browser has
 * with Supabase.
 *
 * `XMLHttpRequest`, in 2026, for one reason: `fetch` has no upload progress
 * event. There is a streaming-request workaround, but it needs HTTP/2, a
 * duplex flag and a half-dozen browser caveats, and what it buys over XHR here
 * is nothing at all. The progress this reports is not decoration — it drives
 * the 3D upload scene, which is the progress indicator, so a fake easing curve
 * would be a lie told at sixty frames a second.
 *
 * Using the raw PUT rather than `supabase-js`'s `uploadToSignedUrl` also keeps
 * the Supabase client out of the browser bundle entirely, and means this app
 * needs no anon key: the signed URL carries its own scoped token.
 */

export interface PutOptions {
  url: string;
  body: Blob;
  contentType: string;
  onProgress?: (fraction: number) => void;
  signal?: AbortSignal;
}

export function putToSignedUrl({
  url,
  body,
  contentType,
  onProgress,
  signal,
}: PutOptions): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException("Aborted", "AbortError"));
      return;
    }

    const xhr = new XMLHttpRequest();
    xhr.open("PUT", url);
    xhr.setRequestHeader("content-type", contentType);
    xhr.setRequestHeader("cache-control", "max-age=3600");
    // The signed URL is single-use by design and the row it belongs to is
    // freshly created, so an upsert would only ever mask a bug.
    xhr.setRequestHeader("x-upsert", "false");

    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable && onProgress) {
        onProgress(event.loaded / event.total);
      }
    };

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        onProgress?.(1);
        resolve();
        return;
      }
      // 413 is the bucket's own `file_size_limit` refusing the body — the
      // limit that a client cannot lie past, unlike the one checked in the
      // form. Worth naming, because "upload failed" sends someone looking at
      // their network rather than at the size of their file.
      reject(
        new Error(
          xhr.status === 413
            ? "That file is larger than the drive allows."
            : `Upload failed (${xhr.status}).`,
        ),
      );
    };

    xhr.onerror = () => reject(new Error("The upload could not be sent."));
    xhr.onabort = () => reject(new DOMException("Aborted", "AbortError"));

    signal?.addEventListener("abort", () => xhr.abort(), { once: true });

    xhr.send(body);
  });
}
