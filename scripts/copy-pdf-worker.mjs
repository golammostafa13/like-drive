import { copyFileSync, mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";

/**
 * Vendor the pdf.js worker out of node_modules on every install.
 *
 * pdf.js refuses to run when the worker's build does not match the API's —
 * it throws rather than degrading, which is the right call but makes a
 * checked-in worker file a landmine. Copying it by hand once works until the
 * day `npm update` moves pdfjs-dist and nothing moves `public/`, and then the
 * reader dies with a version message on a machine where it had always worked.
 *
 * So the worker is not checked in. It is derived from the installed package on
 * every install, which makes the mismatch unrepresentable rather than merely
 * unlikely.
 *
 * It has to be a real file under `public/` rather than a bundler import
 * because `GlobalWorkerOptions.workerSrc` takes a URL, and because the CSP
 * says `worker-src 'self' blob:` — the worker must come from this origin.
 */

const require = createRequire(import.meta.url);
const source = join(
  dirname(require.resolve("pdfjs-dist/package.json")),
  "build",
  "pdf.worker.min.mjs",
);
const target = join(process.cwd(), "public", "pdf.worker.min.mjs");

mkdirSync(dirname(target), { recursive: true });
copyFileSync(source, target);
console.log(`pdf.worker.min.mjs ← ${source.replace(process.cwd() + "/", "")}`);
