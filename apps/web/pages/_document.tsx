import { Head, Html, Main, NextScript } from "next/document";

/**
 * This app uses the App Router for all user-facing routes, but Next's
 * production build still resolves the legacy pages-layer document entry.
 * Providing an explicit pages/_document keeps the pages manifest stable
 * without changing any route behavior.
 */
export default function Document() {
  return (
    <Html lang="en">
      <Head />
      <body>
        <Main />
        <NextScript />
      </body>
    </Html>
  );
}
