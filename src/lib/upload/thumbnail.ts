"use client";

/**
 * Page one, drawn to a small image, in the browser.
 *
 * Done here rather than on the server for a plain reason: rasterising a PDF
 * server-side means either a native binary that does not exist on a serverless
 * runtime, or pdf.js inside a function that has ten seconds and no GPU. In the
 * browser the file is already in memory and pdf.js is already a dependency, so
 * the whole job costs nothing anyone is paying for.
 *
 * It returns the page count too, because opening the document is the expensive
 * part and it would be silly to do it twice.
 */

export interface Thumbnail {
  blob: Blob;
  pageCount: number;
}

/** Wide enough to read a title at 2× on a phone, small enough to stay ~20KB. */
const TARGET_WIDTH = 400;

export async function renderFirstPage(
  file: File,
  maxWidth = TARGET_WIDTH,
): Promise<Thumbnail | null> {
  // Dynamic, so pdf.js stays out of the bundle for everyone who never uploads.
  const pdfjs = await import("pdfjs-dist");
  pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";

  // The loading task is kept, not discarded: `destroy()` lives on it rather
  // than on the document proxy, and it is the only thing that frees the worker
  // and the parsed document together.
  const task = pdfjs.getDocument({
    data: new Uint8Array(await file.arrayBuffer()),
  });
  const doc = await task.promise;

  try {
    const page = await doc.getPage(1);
    const base = page.getViewport({ scale: 1 });
    // Never upscale past 2×: a small page blown up is a blurry thumbnail that
    // costs more bytes than the sharp small one it replaced.
    const scale = Math.min(maxWidth / base.width, 2);
    const viewport = page.getViewport({ scale });

    const canvas = document.createElement("canvas");
    canvas.width = Math.round(viewport.width);
    canvas.height = Math.round(viewport.height);

    const context = canvas.getContext("2d", { alpha: false });
    if (!context) return null;

    // PDFs assume paper. A page whose content draws no background box renders
    // onto transparency, and a transparent PNG/WebP composited on a dark card
    // reads as a solid black rectangle — which looks exactly like a failed
    // render rather than a correct one. Fill first.
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, canvas.width, canvas.height);

    await page.render({ canvas, canvasContext: context, viewport }).promise;

    const blob = await new Promise<Blob | null>((resolve) =>
      // WebP at 0.72 lands around 10–25KB for a typical title page. If the
      // browser cannot encode WebP it returns null rather than throwing, and
      // the caller falls back to PNG — the bucket allows both.
      canvas.toBlob(resolve, "image/webp", 0.72),
    );

    const finalBlob =
      blob ??
      (await new Promise<Blob | null>((resolve) =>
        canvas.toBlob(resolve, "image/png"),
      ));

    // Release the bitmap now rather than waiting for the collector. A 400px
    // canvas is small, but this runs alongside a 20MB document that pdf.js is
    // still holding, on a phone.
    canvas.width = 0;
    canvas.height = 0;

    return finalBlob ? { blob: finalBlob, pageCount: doc.numPages } : null;
  } finally {
    // Not optional. Without it the parsed document — tens of megabytes for a
    // large file — stays reachable for the life of the page, and uploading
    // three files in a row is how a tab runs out of memory.
    await task.destroy();
  }
}
