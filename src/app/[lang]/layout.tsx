import type { Metadata, Viewport } from "next";
import { notFound } from "next/navigation";
import { Familjen_Grotesk, Hind_Siliguri } from "next/font/google";
import { Backdrop } from "@/components/backdrop";
import { ThemeProvider } from "@/components/theme-provider";
import { hasLocale, locales } from "@/lib/i18n/config";
import { site } from "@/lib/site";
import "../globals.css";

/**
 * The root layout.
 *
 * It lives under `[lang]` rather than at the top of `app/` because the
 * language has to reach the `<html lang>` attribute: screen readers pick their
 * voice from it and search engines their index. `proxy.ts` makes sure no
 * request ever arrives here without a locale prefix, so there is deliberately
 * no `app/layout.tsx` above this one — two layouts rendering `<html>` is
 * invalid markup that React does not warn about until hydration.
 */

/**
 * Fonts are self-hosted by next/font: no request ever leaves for a font CDN.
 * That is both a load-time win and what lets the CSP in `next.config.ts` keep
 * `font-src 'self'` with no exceptions.
 */
const display = Familjen_Grotesk({
  variable: "--font-display",
  subsets: ["latin"],
  display: "swap",
});

/**
 * Bengali faces are large. `subsets: ["bengali"]` emits its own `@font-face`
 * with a Bengali unicode-range, so a reader who never meets a Bengali glyph
 * never downloads it.
 */
const bengali = Hind_Siliguri({
  variable: "--font-bengali",
  subsets: ["bengali", "latin"],
  weight: ["300", "400", "500", "600", "700"],
  display: "swap",
});

export function generateStaticParams() {
  return locales.map((lang) => ({ lang }));
}

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f6f6fb" },
    { media: "(prefers-color-scheme: dark)", color: "#0b0b12" },
  ],
};

export async function generateMetadata(
  props: LayoutProps<"/[lang]">,
): Promise<Metadata> {
  const { lang } = await props.params;
  if (!hasLocale(lang)) return {};

  return {
    title: {
      default: lang === "bn" ? site.nameBn : site.name,
      template: `%s · ${lang === "bn" ? site.nameBn : site.name}`,
    },
    description: lang === "bn" ? site.descriptionBn : site.description,
    // Nothing here should be indexed. The only reachable page without a
    // session is the door, and a search result pointing at someone's private
    // document library is not a feature.
    robots: { index: false, follow: false },
  };
}

/**
 * Applied before first paint so a dark-theme visitor never sees a white flash.
 *
 * It has to be inline and it has to be synchronous: anything deferred runs
 * after the first paint, which is the flash. The CSP carries
 * `script-src 'unsafe-inline'` partly for this and partly for Next's own
 * hydration payload — see the note in `next.config.ts`.
 */
const themeScript = `
(function() {
  try {
    var stored = localStorage.getItem("theme");
    var theme = stored === "light" || stored === "dark"
      ? stored
      : (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
    document.documentElement.classList.add(theme);
    document.documentElement.style.colorScheme = theme;
  } catch (e) {}
})();
`;

export default async function LangLayout(props: LayoutProps<"/[lang]">) {
  const { lang } = await props.params;
  if (!hasLocale(lang)) notFound();

  return (
    <html lang={lang} suppressHydrationWarning>
      <head>
        {/* A raw `<script>`, deliberately, and not `next/script`.
            `beforeInteractive` does not emit an executable tag: it pushes the
            source into `self.__next_s` for Next's runtime to inject once its
            own async chunk has loaded, which is after first paint — the exact
            flash this exists to prevent. React warns in development that it
            will not execute this tag on a client render, which is true and
            harmless: it runs while the server-rendered HTML is parsed, which
            is the only moment that matters here. */}
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body
        className={`${display.variable} ${bengali.variable} min-h-dvh antialiased`}
      >
        <ThemeProvider>
          {/* Mounted once here rather than per page, so the motion is
              continuous across navigation instead of restarting. It disposes
              itself inside the reader — see the component. */}
          <Backdrop />
          {props.children}
        </ThemeProvider>
      </body>
    </html>
  );
}
