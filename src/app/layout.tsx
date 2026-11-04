import type { Metadata } from "next";
import { AccountProvider } from "@/features/account/components/account-provider";
import { SiteShell } from "@/components/site-shell";
import "./globals.css";

export const metadata: Metadata = {
  title: "Run Week",
  description:
    "A home for your running goals. Build a running program, organize your week, and make room for recovery.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full flex flex-col"><AccountProvider><SiteShell>{children}</SiteShell></AccountProvider></body>
    </html>
  );
}
