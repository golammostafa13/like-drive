/**
 * The drive's mark, as flat SVG.
 *
 * The same five-facet crystal as `app/icon.svg`, but drawn from the CSS brand
 * tokens instead of fixed hex, so it follows a theme change like everything
 * else on the page. The favicon cannot do that — browser chrome has no access
 * to this document's custom properties — which is why the two exist
 * separately rather than one importing the other.
 *
 * This is also the still frame behind `BrandMark3D`: whenever WebGL is
 * refused — reduced motion, no context, a low-memory device — this is what
 * remains, and it is a finished mark rather than a placeholder.
 */
export function BrandMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 32 32"
      className={className}
      aria-hidden="true"
      focusable="false"
    >
      <defs>
        <linearGradient id="bm-a" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="var(--brand-2)" />
          <stop offset="1" stopColor="var(--brand-1)" />
        </linearGradient>
        <linearGradient id="bm-b" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="var(--surface)" />
          <stop offset="1" stopColor="var(--brand-2)" />
        </linearGradient>
        <linearGradient id="bm-c" x1="1" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="var(--brand-3)" />
          <stop offset="1" stopColor="var(--brand-2)" />
        </linearGradient>
        <linearGradient id="bm-d" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="var(--brand-1)" />
          <stop offset="1" stopColor="var(--brand-2)" />
        </linearGradient>
        <linearGradient id="bm-e" x1="1" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="var(--brand-3)" />
          <stop offset="1" stopColor="var(--brand-1)" />
        </linearGradient>
      </defs>
      <path d="M4 13 L10.5 4 L16 13 Z" fill="url(#bm-a)" />
      <path d="M10.5 4 L21.5 4 L16 13 Z" fill="url(#bm-b)" />
      <path d="M21.5 4 L28 13 L16 13 Z" fill="url(#bm-c)" />
      <path d="M4 13 L16 13 L16 29 Z" fill="url(#bm-d)" />
      <path d="M16 13 L28 13 L16 29 Z" fill="url(#bm-e)" />
      <path d="M4 13 H28" stroke="var(--surface)" strokeOpacity=".5" strokeWidth="1" />
    </svg>
  );
}
