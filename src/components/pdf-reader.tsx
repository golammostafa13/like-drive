"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import Link from "next/link";
import {
  ArrowLeft,
  ChevronDown,
  ChevronUp,
  Download,
  Loader2,
  Maximize2,
  Moon,
  QrCode,
  Sun,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import { QrDialog } from "@/components/qr-dialog";
import { getDictionary } from "@/lib/i18n";
import type { Locale } from "@/lib/i18n/config";
import { formatBytes, formatNumberIn, textClass } from "@/lib/i18n/content";
import { cn } from "@/lib/utils";
import { fill } from "@/lib/i18n/format";
import type { DriveFile } from "@/types";

/**
 * In-browser PDF reader.
 *
 * One continuous scroll, the way a document is read, not a slideshow of pages
 * behind a Next button. The whole book is one column and the window is the
 * scroller, so scrolling, momentum on a phone, Space, PageDown, Home/End and
 * the browser's own scrollbar all work without this component implementing any
 * of them.
 *
 * That means the column has to be virtualized. The handbook is 1,549 pages and
 * the Nelson textbook is 4,535: mounting a canvas per page would allocate tens
 * of gigabytes of bitmap before the first page appeared. So the column is a
 * single tall element of the right total height, and only the pages within a
 * screen of the viewport are mounted at all: see `layout` and `mounted` below.
 * Page geometry is estimated from page one and corrected from each page's real
 * viewport as it renders, which is what keeps the scrollbar honest in a book
 * whose plates are a different size from its body.
 *
 * Security posture: PDFs are untrusted input, so pages stream on demand via
 * HTTP range requests (`disableAutoFetch`) and the worker runs from our own
 * origin (see `worker-src` in next.config). pdf.js 6 has no eval paths left to
 * disable, and the production CSP carries no 'unsafe-eval' either way.
 */

// Type-only import: erased at compile time, so pdfjs still loads lazily
// in the effect below and never lands in the initial bundle.
import type { PDFDocumentProxy, RenderTask } from "pdfjs-dist";

/** Gutter between pages, px. Enough to read as separate sheets of paper. */
const GAP = 16;

/**
 * How much to render beyond the viewport, as a fraction of its height.
 *
 * Half a screen in each direction: enough that a normal scroll always lands on
 * a page that is already drawn, and few enough canvases (three or four at a
 * time) that a 4,000-page book never holds more than ~60MB of bitmap.
 */
const OVERSCAN = 0.5;

interface PageSize {
  width: number;
  height: number;
}

interface Layout {
  count: number;
  /** Top of each page, px from the top of the column, at the current scale. */
  offsets: Float64Array;
  /** Each page's drawn size at the current scale. Parallel to `offsets`. */
  widths: Float64Array;
  heights: Float64Array;
  /** Column height: every page, every gutter. */
  height: number;
}

/** Largest i with offsets[i] <= y. The page the given y sits inside. */
function pageAt(offsets: Float64Array, y: number): number {
  let low = 0;
  let high = offsets.length - 1;
  while (low < high) {
    const mid = (low + high + 1) >> 1;
    if (offsets[mid] <= y) low = mid;
    else high = mid - 1;
  }
  return low;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

export function PdfReader({
  file,
  backHref,
  lang,
}: {
  file: DriveFile;
  /** Where the back arrow goes: the folder this file lives in. */
  backHref: string;
  lang: Locale;
}) {
  const dict = getDictionary(lang);
  const [doc, setDoc] = useState<PDFDocumentProxy | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  /** Page one at scale 1, in points. The estimate every page starts from. */
  const [natural, setNatural] = useState<PageSize | null>(null);
  /**
   * `null` means "as wide as the column allows" and is the state the reader
   * opens in. A fixed default cannot be right for both a phone and a desktop,
   * so it is resolved against the measured frame width in `fitScale` below and
   * replaced by a real number the moment the reader zooms.
   */
  const [scale, setScale] = useState<number | null>(null);
  const [frameWidth, setFrameWidth] = useState(0);
  const [sepia, setSepia] = useState(false);
  const [qrOpen, setQrOpen] = useState(false);

  const [page, setPage] = useState(1);
  const [mounted, setMounted] = useState({ first: 1, last: 1 });

  const frameRef = useRef<HTMLDivElement>(null);
  const columnRef = useRef<HTMLDivElement>(null);
  const headerRef = useRef<HTMLElement>(null);

  /**
   * Every measurement taken, by page number. A ref because a hundred pages
   * reporting the size they already had must not be a hundred renders: it is
   * read and written only inside `measure`, never while rendering.
   */
  const measured = useRef(new Map<number, PageSize>());
  /**
   * The subset that *contradicts* the page-one estimate, which is all the
   * column's geometry has to know about. State rather than a ref, because the
   * layout is computed from it during render.
   */
  const [overrides, setOverrides] = useState<ReadonlyMap<number, PageSize>>(
    () => new Map(),
  );

  /*
     Keyed on the file id, not its name. That is what makes a rename and a
     move free: the position follows the file, because the id is the one thing
     about it that never changes. Note the sibling libraries this reader came
     from still write `cef3:progress:` in two forks that are not cef-3 — a key
     is an interface, and copying one forward without renaming it is how it
     stops meaning anything. */
  const storageKey = `gdrive:progress:${file.id}`;

  // --- Load the document -------------------------------------------------
  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const pdfjs = await import("pdfjs-dist");
        pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";

        const task = pdfjs.getDocument({
          url: `/api/file/${file.id}`,
          disableAutoFetch: true,
          disableStream: false,
        });

        const loaded = await task.promise;
        if (cancelled) return;

        // Page one's geometry is the estimate for the whole column, so it is
        // fetched before the reader is shown rather than after: without it
        // there is no column height, and without that there is nothing to
        // restore a saved reading position against.
        const first = await loaded.getPage(1);
        if (cancelled) return;
        const viewport = first.getViewport({ scale: 1 });

        setDoc(loaded);
        setNatural({ width: viewport.width, height: viewport.height });
        setLoading(false);
      } catch (err) {
        if (!cancelled) {
          // The file is gone, or unreadable. Forget where we were in it: this
          // is the one moment the browser can know a saved position is dead,
          // and it is why `use-prune-progress` only sweeps by age rather than
          // trying to guess from a folder listing.
          try {
            localStorage.removeItem(storageKey);
          } catch {
            // Blocked site data; nothing here is worth an exception.
          }
          setError(
            process.env.NODE_ENV === "development"
              ? `PDF load failed: ${err instanceof Error ? err.message : String(err)}`
              : dict.reader.failed,
          );
          setLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [file.id, storageKey, dict.reader.failed]);

  /* --- Fit to width -----------------------------------------------------
     Measured off a zero-height ruler that carries the column's own padding,
     not off the column: a zoomed page is wider than the screen by design, and
     measuring the thing that overflows would feed its own width back in. ---- */
  useEffect(() => {
    const el = frameRef.current;
    if (!el) return;
    const measure = () => setFrameWidth(el.clientWidth);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const fitScale =
    natural && frameWidth
      ? // Never blown up past a comfortable reading size on a wide screen: a
        // 1600px-wide page of body text is a worse read than a 1.6x one.
        clamp(frameWidth / natural.width, 0.2, 1.6)
      : 1;

  const effectiveScale = scale ?? fitScale;

  // --- Column geometry ---------------------------------------------------
  const layout = useMemo<Layout | null>(() => {
    if (!doc || !natural) return null;

    const count = doc.numPages;
    const offsets = new Float64Array(count);
    const widths = new Float64Array(count);
    const heights = new Float64Array(count);
    let y = 0;
    for (let i = 0; i < count; i++) {
      const size = overrides.get(i + 1) ?? natural;
      const height = Math.round(size.height * effectiveScale);
      offsets[i] = y;
      widths[i] = Math.round(size.width * effectiveScale);
      heights[i] = height;
      y += height + GAP;
    }
    return { count, offsets, widths, heights, height: Math.max(0, y - GAP) };
  }, [doc, natural, effectiveScale, overrides]);

  const headerHeight = useCallback(
    () => headerRef.current?.offsetHeight ?? 64,
    [],
  );

  /** Column top in document coordinates. */
  const columnTop = useCallback(() => {
    const col = columnRef.current;
    if (!col) return 0;
    return col.getBoundingClientRect().top + window.scrollY;
  }, []);

  const scrollToPage = useCallback(
    (target: number, behavior: ScrollBehavior = "smooth") => {
      if (!layout) return;
      const index = clamp(target, 1, layout.count) - 1;
      window.scrollTo({
        // Less the sticky toolbar, or the page's own top edge opens underneath
        // it and the first two lines are never visible.
        top: columnTop() + layout.offsets[index] - headerHeight() - 8,
        behavior,
      });
    },
    [layout, columnTop, headerHeight],
  );

  /* --- Scroll position → which pages exist, and where we are -------------
     One rAF-throttled listener does both jobs, and writes state only when the
     answer has actually changed: a scroll through a long book fires this
     hundreds of times and almost all of them land on the same page. --------- */
  useEffect(() => {
    if (!layout) return;

    let frame = 0;
    const read = () => {
      frame = 0;
      const viewport = window.innerHeight;
      const y = window.scrollY - columnTop();
      const pad = viewport * OVERSCAN;

      const first = pageAt(layout.offsets, y - pad) + 1;
      const last = pageAt(layout.offsets, y + viewport + pad) + 1;
      setMounted((prev) =>
        prev.first === first && prev.last === last ? prev : { first, last },
      );

      // The page under the top of the readable area, just below the toolbar:
      // is the one the reader would say they are on.
      const at = pageAt(layout.offsets, y + headerHeight() + 8) + 1;
      setPage((prev) => (prev === at ? prev : clamp(at, 1, layout.count)));
    };

    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(read);
    };

    read();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      if (frame) cancelAnimationFrame(frame);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, [layout, columnTop, headerHeight]);

  /* --- Keeping your place across a zoom ---------------------------------
     Scale changes rewrite every offset in the column, so the scroll position
     that meant page 400 before means something else after. The page is
     recorded on the way in and restored once the new geometry is laid out. --- */
  const anchor = useRef<number | null>(null);
  const restored = useRef(false);

  const rescale = useCallback((next: number | null) => {
    anchor.current = page;
    setScale(next);
  }, [page]);

  useLayoutEffect(() => {
    if (!layout) return;

    /* `instant`, not `auto`, for both of these. The stylesheet sets
       `html { scroll-behavior: smooth }` and `auto` defers to it, so
       reopening the handbook at page 1,200 would have *animated* down forty
       thousand pixels of column, mounting and dropping pages the whole way. */

    // First layout: pick up where this book was left off.
    if (!restored.current) {
      restored.current = true;
      const saved = Number(window.localStorage.getItem(storageKey) ?? 1);
      const target = clamp(saved, 1, layout.count);
      if (target > 1) scrollToPage(target, "instant");
      return;
    }

    if (anchor.current !== null) {
      const target = anchor.current;
      anchor.current = null;
      scrollToPage(target, "instant");
    }
  }, [layout, scrollToPage, storageKey]);

  useEffect(() => {
    if (doc) window.localStorage.setItem(storageKey, String(page));
  }, [page, doc, storageKey]);

  /* --- Measurements from real pages -------------------------------------
     A book whose plates are a different shape from its body would otherwise
     drift: the estimate says every page is page one's size, and 300 landscape
     plates later the scrollbar is lying. Each page reports its own size as it
     renders and the column is re-laid-out only when one disagrees. ---------- */
  /**
   * Stable, and it has to be: it is a dependency of every mounted page's render
   * effect, so a `measure` that changed identity when the page counter ticked
   * would redraw every canvas on screen on every scroll. Hence the ref: the
   * anchor wants the page we are on *now*, not the one this closure was built
   * with.
   */
  const pageRef = useRef(page);
  useEffect(() => {
    pageRef.current = page;
  }, [page]);

  const measure = useCallback(
    (pageNumber: number, size: PageSize) => {
      const known = measured.current.get(pageNumber);
      if (known && Math.abs(known.height - size.height) < 0.5) return;
      measured.current.set(pageNumber, size);

      // Page one *is* the estimate, so it can never contradict it.
      if (pageNumber === 1) return;
      const estimate = natural?.height ?? size.height;
      if (Math.abs(estimate - size.height) < 0.5) return;

      // Hold the reader's place: the pages above just changed height.
      anchor.current = pageRef.current;
      setOverrides((prev) => {
        const next = new Map(prev);
        next.set(pageNumber, size);
        return next;
      });
    },
    [natural],
  );

  // --- Keyboard ----------------------------------------------------------
  /**
   * Vertical keys are the browser's: Space, PageUp/PageDown, arrows and
   * Home/End already scroll a document, and reimplementing them here would
   * only make them worse. Left and Right have no scroll meaning of their own,
   * so they are the page-at-a-time jump.
   */
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.matches("input, textarea, select")) return;
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      if (event.key === "ArrowRight") scrollToPage(page + 1);
      else if (event.key === "ArrowLeft") scrollToPage(page - 1);
      else return;
      event.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [page, scrollToPage]);

  const total = layout?.count ?? file.pageCount ?? 1;
  const progress = total ? (page / total) * 100 : 0;
  const pageWidth = natural ? Math.round(natural.width * effectiveScale) : 0;

  const slots: number[] = [];
  if (layout) {
    const first = clamp(mounted.first, 1, layout.count);
    const last = clamp(mounted.last, first, layout.count);
    for (let n = first; n <= last; n++) slots.push(n);
  }

  return (
    <div className="min-h-dvh bg-bg-deep">
      {/* Toolbar

          Two rows below `sm`, one from there up. Eight controls, a zoom
          readout and a two-line title do not fit across 360px: squeezed onto
          one row the title collapsed to nothing and the buttons overlapped,
          so on a phone the book's name gets the first row and the controls get
          the second, where they are still full-size tap targets. */}
      <header
        ref={headerRef}
        className="sticky top-0 z-40 border-b border-line/60 bg-bg/90 backdrop-blur-xl"
      >
        <div className="mx-auto flex max-w-6xl flex-col gap-1 px-3 py-2 sm:h-16 sm:flex-row sm:items-center sm:gap-3 sm:px-4 sm:py-0">
          <div className="flex min-w-0 items-center gap-2 sm:flex-1 sm:gap-3">
            <Link
              href={backHref}
              className="inline-flex size-10 shrink-0 items-center justify-center rounded-full text-ink-mute hover:bg-accent-soft hover:text-accent"
              aria-label={dict.reader.backToBook}
            >
              <ArrowLeft className="size-[18px]" />
            </Link>

            <div className="min-w-0 flex-1">
              <p
                className={cn(
                  "truncate text-sm font-semibold text-ink sm:text-base",
                  textClass(lang),
                )}
              >
                {file.name}
              </p>
              <p
                className={cn("truncate text-xs text-ink-faint", textClass(lang))}
              >
                {formatBytes(file.sizeBytes, lang)}
              </p>
            </div>
          </div>

          <div className="flex shrink-0 items-center justify-end gap-0.5 sm:gap-1">
            <ToolButton
              onClick={() => rescale(Math.max(0.25, effectiveScale - 0.2))}
              label={dict.reader.zoomOut}
            >
              <ZoomOut className="size-[18px]" />
            </ToolButton>
            {/* The readout is a label, not a control, and it is the first
                thing to go when the row is short of room. */}
            <span className="hidden w-12 text-center text-xs tabular-nums text-ink-mute sm:inline">
              {formatNumberIn(Math.round(effectiveScale * 100), lang)}%
            </span>
            <ToolButton
              onClick={() => rescale(Math.min(4, effectiveScale + 0.2))}
              label={dict.reader.zoomIn}
            >
              <ZoomIn className="size-[18px]" />
            </ToolButton>
            {/* Back to fitting the column: the state the reader opened in, and
                the way out of a zoom that has left the page wider than the
                screen. */}
            <ToolButton
              onClick={() => rescale(null)}
              label={dict.reader.fitWidth}
              pressed={scale === null}
            >
              <Maximize2 className="size-[18px]" />
            </ToolButton>
            <ToolButton
              onClick={() => setSepia((v) => !v)}
              label={dict.reader.sepia}
              pressed={sepia}
            >
              {sepia ? <Sun className="size-[18px]" /> : <Moon className="size-[18px]" />}
            </ToolButton>
            <ToolButton
              onClick={() => setQrOpen(true)}
              label={dict.qr.title}
            >
              <QrCode className="size-[18px]" />
            </ToolButton>
            <a
              /* The gated redirect, not the streaming route: a download is
                 the whole file however it is served, so it is handed to a
                 302 that points at a one-minute signed URL rather than
                 proxied through a serverless function. `download` is left on
                 for the same-origin redirect itself; the saved filename is
                 actually set by Supabase, because the attribute is ignored
                 once the browser follows a cross-origin hop. */
              href={`/api/file/${file.id}/download`}
              download
              aria-label={fill(lang, dict.common.downloadFormat, {
                format: "PDF",
              })}
              className="inline-flex size-10 shrink-0 items-center justify-center rounded-full text-ink-mute hover:bg-accent-soft hover:text-accent"
            >
              <Download className="size-[18px]" />
            </a>
          </div>
        </div>

        <div
          className="h-0.5 bg-accent transition-[width] duration-300"
          style={{ width: `${progress}%` }}
          role="progressbar"
          aria-valuenow={page}
          aria-valuemin={1}
          aria-valuemax={total}
          aria-label={fill(lang, dict.reader.pageOf, { page, total })}
        />
      </header>

      {/* The ruler `fitScale` is measured from. Zero height, the column's own
          padding, and (unlike the column) never wider than the screen. */}
      <div ref={frameRef} className="h-0 px-3 sm:px-4" aria-hidden="true" />

      {loading && (
        <div className="flex flex-col items-center gap-3 py-32 text-ink-mute">
          <Loader2 className="size-7 animate-spin" aria-hidden="true" />
          <p className={textClass(lang)}>{dict.reader.loading}</p>
        </div>
      )}

      {error && (
        <div className="py-32 text-center">
          <p className="text-lg text-ink">{error}</p>
          <Link
            href={backHref}
            className={cn(
              "mt-4 inline-block text-accent underline underline-offset-4",
              textClass(lang),
            )}
          >
            {dict.reader.backToBook}
          </Link>
        </div>
      )}

      {/* The book

          One column, `pb-24` clear of the fixed footer. Pages are absolutely
          positioned inside it at their computed offsets, so mounting and
          unmounting them as they pass the viewport moves nothing: the column's
          height is the whole book's height from the first frame, which is what
          makes the browser's scrollbar the real one. */}
      {doc && layout && !error && (
        <div
          className={cn(
            "px-3 pb-24 pt-5 sm:px-4 sm:pt-10",
            sepia && "sepia-[0.35] saturate-[0.9]",
          )}
        >
          <div
            ref={columnRef}
            className="relative mx-auto"
            style={{ width: pageWidth, height: layout.height }}
          >
            {slots.map((number) => (
              <PdfPage
                key={number}
                doc={doc}
                pageNumber={number}
                scale={effectiveScale}
                top={layout.offsets[number - 1]}
                width={layout.widths[number - 1]}
                height={layout.heights[number - 1]}
                label={fill(lang, dict.reader.pageLabel, { page: number })}
                onMeasure={measure}
              />
            ))}
          </div>
        </div>
      )}

      {/* Where you are

          Not a pager: the buttons nudge the scroll by one page for anyone who
          wants a page at a time, and the field jumps to a page in a book too
          long to reach by scrolling, page 1,200 of the handbook is a long way
          down. The reading itself is the scroll. */}
      <footer className="fixed inset-x-0 bottom-0 z-40 border-t border-line/60 bg-bg/90 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-center gap-3 px-3 sm:gap-4 sm:px-4">
          <button
            type="button"
            onClick={() => scrollToPage(page - 1)}
            disabled={page <= 1}
            aria-label={dict.reader.previousPage}
            title={dict.reader.previousPage}
            className="inline-flex size-10 shrink-0 items-center justify-center rounded-full border border-line text-ink-mute transition-colors hover:border-ink/30 hover:text-ink disabled:opacity-40"
          >
            <ChevronUp className="size-4" aria-hidden="true" />
          </button>

          <PageJump
            page={page}
            total={total}
            lang={lang}
            label={dict.reader.jumpToPage}
            of={fill(lang, dict.reader.pageOf, { page, total })}
            onJump={scrollToPage}
          />

          <button
            type="button"
            onClick={() => scrollToPage(page + 1)}
            disabled={page >= total}
            aria-label={dict.reader.nextPage}
            title={dict.reader.nextPage}
            className="inline-flex size-10 shrink-0 items-center justify-center rounded-full border border-line text-ink-mute transition-colors hover:border-ink/30 hover:text-ink disabled:opacity-40"
          >
            <ChevronDown className="size-4" aria-hidden="true" />
          </button>
        </div>
      </footer>

      {qrOpen && (
        <QrDialog
          fileId={file.id}
          fileName={file.name}
          onClose={() => setQrOpen(false)}
          dict={dict}
          lang={lang}
        />
      )}
    </div>
  );
}

/**
 * One page, drawn when it is mounted and released when it is not.
 *
 * The slot keeps its size whether or not the canvas has caught up, so a fast
 * scroll never collapses the column behind it; the white ground is the paper
 * showing through until the render lands. Freeing the bitmap on unmount is not
 * optional at this scale: a canvas the GC has not got to yet is still several
 * megabytes of video memory, and a reader can pass a hundred pages in a flick.
 */
function PdfPage({
  doc,
  pageNumber,
  scale,
  top,
  width,
  height,
  label,
  onMeasure,
}: {
  doc: PDFDocumentProxy;
  pageNumber: number;
  scale: number;
  top: number;
  width: number;
  height: number;
  label: string;
  onMeasure: (pageNumber: number, size: PageSize) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    let cancelled = false;
    let task: RenderTask | null = null;
    // Captured now: by the time the cleanup runs, React may already have
    // detached the node this ref pointed at, and the bitmap to release is this
    // one.
    const canvas = canvasRef.current;

    (async () => {
      const pdfPage = await doc.getPage(pageNumber);
      if (cancelled || !canvas) return;

      const unscaled = pdfPage.getViewport({ scale: 1 });
      onMeasure(pageNumber, {
        width: unscaled.width,
        height: unscaled.height,
      });

      const viewport = pdfPage.getViewport({ scale });

      // Render at device resolution, lay out at CSS resolution, so the page
      // is sharp on HiDPI screens without doubling the layout size.
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.floor(viewport.width * dpr);
      canvas.height = Math.floor(viewport.height * dpr);
      canvas.style.width = `${Math.floor(viewport.width)}px`;
      canvas.style.height = `${Math.floor(viewport.height)}px`;

      // pdf.js v6 wants the canvas itself; passing only `canvasContext` is a
      // legacy path that requires `canvas: null` and otherwise renders nothing.
      task = pdfPage.render({
        canvas,
        viewport,
        transform: dpr === 1 ? undefined : [dpr, 0, 0, dpr, 0, 0],
      });
      try {
        await task.promise;
      } catch {
        /* superseded, or scrolled past: expected */
      }
    })();

    return () => {
      cancelled = true;
      task?.cancel();
      if (canvas) {
        canvas.width = 0;
        canvas.height = 0;
      }
    };
  }, [doc, pageNumber, scale, onMeasure]);

  return (
    <div
      // A real page number for assistive tech and for the browser's own
      // find-in-page position, which is otherwise a column of unlabelled boxes.
      role="img"
      aria-label={label}
      className="absolute left-1/2 -translate-x-1/2 overflow-hidden rounded-lg bg-white shadow-e4"
      style={{ top, width, height }}
    >
      <canvas ref={canvasRef} className="block" />
    </div>
  );
}

/**
 * The page field.
 *
 * Uncontrolled while it has focus, so typing "1200" is not fought over by the
 * scroll listener rewriting the value on every frame; it snaps back to wherever
 * the reader actually is the moment it is left alone.
 */
function PageJump({
  page,
  total,
  lang,
  label,
  of,
  onJump,
}: {
  page: number;
  total: number;
  lang: Locale;
  label: string;
  of: string;
  onJump: (page: number) => void;
}) {
  const [draft, setDraft] = useState<string | null>(null);

  const commit = () => {
    const next = Number(draft);
    setDraft(null);
    if (Number.isFinite(next) && next >= 1) onJump(Math.min(next, total));
  };

  return (
    <form
      className="flex items-center gap-2"
      onSubmit={(event) => {
        event.preventDefault();
        commit();
        (event.currentTarget.querySelector("input") as HTMLInputElement)?.blur();
      }}
    >
      <input
        type="number"
        inputMode="numeric"
        min={1}
        max={total}
        value={draft ?? String(page)}
        aria-label={label}
        onFocus={(event) => {
          setDraft(String(page));
          event.currentTarget.select();
        }}
        onChange={(event) => setDraft(event.currentTarget.value)}
        onBlur={commit}
        className="h-10 w-16 rounded-full border border-line bg-surface/60 text-center text-sm tabular-nums text-ink transition-colors focus:border-accent focus:outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
      />
      {/* The live figure for anyone who cannot see the field's value change. */}
      <span className="sr-only" aria-live="polite">
        {of}
      </span>
      <span
        className={cn(
          "text-sm tabular-nums text-ink-faint",
          textClass(lang),
        )}
        aria-hidden="true"
      >
        / {formatNumberIn(total, lang)}
      </span>
    </form>
  );
}

function ToolButton({
  onClick,
  label,
  children,
  pressed,
}: {
  onClick: () => void;
  label: string;
  children: React.ReactNode;
  /** For the two toggles, so their state is visible and announced. */
  pressed?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      aria-pressed={pressed}
      title={label}
      className={cn(
        "inline-flex size-10 shrink-0 items-center justify-center rounded-full transition-colors hover:bg-accent-soft hover:text-accent",
        pressed ? "bg-accent-soft text-accent" : "text-ink-mute",
      )}
    >
      {children}
    </button>
  );
}
