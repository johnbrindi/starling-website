import type { Metadata } from "next";
import { WifiIcon } from "@/components/ui/icons";

export const metadata: Metadata = { title: "Offline" };

/** Generic offline fallback (precached by the service worker). Contains no customer data. */
export default function OfflinePage() {
  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col items-center justify-center px-6 py-16 text-center">
      <span className="flex h-12 w-12 items-center justify-center rounded-full bg-brand-50 text-brand-700">
        <WifiIcon className="h-6 w-6" />
      </span>
      <h1 className="mt-4 text-xl font-semibold">You are offline</h1>
      <p className="mt-2 text-sm text-muted">
        Connect to the <strong className="text-ink">Juthelink</strong> network or turn on mobile data, then try again. Buying a pass and checking your
        remaining time need a live connection.
      </p>
      {/* A full page load (not client navigation) is the right way to retry the network here. */}
      {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
      <a href="/" className="mt-6 inline-flex h-10 items-center rounded-md bg-brand-600 px-4 text-sm font-medium text-white">
        Try again
      </a>
    </main>
  );
}
