/* Route-level error boundary for everything under `app/`. Next renders this in
   place of the segment when a render throws, so a component error is a styled
   page instead of the blank document the app produced before.

   NOTE: this does NOT catch a throw inside `app/layout.tsx` itself — that needs
   `global-error.tsx`, which has to render its own <html>/<body> and is
   deliberately not added here. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { ErrorState } from "@devdigest/ui";
import { AppShell } from "@/components/app-shell";

export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const t = useTranslations("common");

  // The boundary swallows the throw, so without this the stack never reaches
  // the console and the error is invisible in development.
  React.useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <AppShell>
      <ErrorState
        fullScreen
        title={t("boundary.title")}
        // `reset` re-renders the segment — the same thing `onRetry` means on
        // every other ErrorState in the app.
        body={error.message || t("boundary.body")}
        onRetry={reset}
      />
    </AppShell>
  );
}
