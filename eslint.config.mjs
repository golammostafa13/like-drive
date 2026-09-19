import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Vendored, minified third-party build output: pdfjs-dist's worker, copied
    // into public/ so it is served from our own origin. Linting it produces
    // ~1,500 findings about code we do not maintain and drowns real ones.
    "public/pdf.worker.min.mjs",
  ]),
]);

export default eslintConfig;
