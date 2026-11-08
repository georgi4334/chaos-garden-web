import type { Metadata } from "next";
import Link from "next/link";
import "@fontsource-variable/bricolage-grotesque";
import "@fontsource-variable/jetbrains-mono";
import "./globals.css";

export const metadata: Metadata = {
  title: "Chaos Garden",
  description:
    "Make your API slow, fail, vanish or return broken data, and see how your frontend copes.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen">
        <header className="mx-auto flex max-w-6xl items-center justify-between px-5 py-5">
          <Link href="/" className="flex items-center gap-2 text-lg font-bold tracking-tight">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M12 21v-9" stroke="var(--sap-deep)" strokeWidth="2" strokeLinecap="round" />
              <path d="M12 12c0-4 3-6 7-6 0 4-3 6-7 6Z" fill="var(--sap)" />
              <path d="M12 15c0-3-2-5-6-5 0 3 2 5 6 5Z" fill="var(--sap-deep)" />
            </svg>
            Chaos Garden
          </Link>
        </header>
        <main className="mx-auto max-w-6xl px-5 pb-20">{children}</main>
      </body>
    </html>
  );
}
