import type { Metadata, Viewport } from "next";
import { PwaRuntime } from "@/components/pwa";
import "./globals.css";

// Live data everywhere (payments, countdowns): never statically cache pages at build time.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: { default: "Juthelink", template: "%s · Juthelink" },
  description: "Fast Wi-Fi by the hour, day, week or month. Pay with MTN Mobile Money.",
  applicationName: "Juthelink",
  appleWebApp: { capable: true, title: "Juthelink", statusBarStyle: "default" },
  icons: { icon: "/favicon.ico", apple: "/icons/apple-touch-icon.png" },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  themeColor: "#1d5bd8",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="flex min-h-full flex-col">
        {children}
        <PwaRuntime />
      </body>
    </html>
  );
}
