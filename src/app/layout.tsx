import type { Metadata } from "next";
import Script from "next/script";
import { AccountProvider } from "@/features/account/components/account-provider";
import { SiteShell } from "@/components/site-shell";
import { THEME_STORAGE_KEY } from "@/features/theme/theme-store";
import "./globals.css";

export const metadata: Metadata = {
  title: "Run Week",
  description:
    "A home for your running goals. Build a running program, organize your week, and make room for recovery.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className="h-full antialiased" suppressHydrationWarning>
      <head>
        <Script id="theme-init" strategy="beforeInteractive">
          {`try {
            if (localStorage.getItem("${THEME_STORAGE_KEY}") === "dark") {
              document.documentElement.dataset.theme = "dark";
            }
          } catch {}`}
        </Script>
      </head>
      <body className="min-h-full flex flex-col"><AccountProvider><SiteShell>{children}</SiteShell></AccountProvider></body>
    </html>
  );
}
