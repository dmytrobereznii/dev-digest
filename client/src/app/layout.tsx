import type { Metadata } from "next";
import { Suspense } from "react";
import { NextIntlClientProvider } from "next-intl";
import type { AbstractIntlMessages } from "next-intl";
import { getLocale, getMessages } from "next-intl/server";
import "./globals.css";
import { Providers } from "../lib/providers";
import { themeNoFlashScript } from "../lib/theme";

/**
 * The namespaces the app actually reads. `i18n/request.ts` loads every
 * `messages/en/*.json` by design — that is what lets a feature add its own file
 * without touching shared code — but the whole result was being serialized into
 * the RSC payload on every navigation, including the eleven namespaces that
 * belong to lesson features (L03–L08) and are imported by nothing.
 *
 * Narrowing happens HERE, at the provider, not in the loader: the unused JSON
 * files are the design reference for those lessons and must stay on disk.
 * Adding a namespace to the app means adding it to this list.
 */
const USED_NAMESPACES = [
  "addRepo",
  "agents",
  "blast",
  "brief",
  "common",
  "conventions",
  "prReview",
  "runs",
  "settings",
  "shell",
  "skills",
] as const;

/** Three lines rather than a `lodash/pick` dependency for three lines. */
function pick(messages: AbstractIntlMessages, keys: readonly string[]): AbstractIntlMessages {
  return Object.fromEntries(
    keys.filter((k) => k in messages).map((k) => [k, messages[k]!])
  ) as AbstractIntlMessages;
}

export const metadata: Metadata = {
  title: "DevDigest",
  description: "Local-first AI PR review tool",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const locale = await getLocale();
  const messages = await getMessages();
  return (
    <html lang={locale} data-theme="dark" data-density="regular" suppressHydrationWarning>
      <head>
        {/* set theme before paint to avoid FOUC */}
        <script dangerouslySetInnerHTML={{ __html: themeNoFlashScript }} />
      </head>
      {/* suppressHydrationWarning: browser extensions (Grammarly, translators, …)
          inject attributes like data-gr-ext-installed onto <body> before React
          hydrates. This suppresses ONLY this element's own attribute mismatch
          (one level deep) — real mismatches in descendants are still reported. */}
      <body suppressHydrationWarning>
        <NextIntlClientProvider locale={locale} messages={pick(messages, USED_NAMESPACES)}>
          <Suspense fallback={null}>
            <Providers>{children}</Providers>
          </Suspense>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
