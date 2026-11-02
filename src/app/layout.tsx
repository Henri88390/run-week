import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Run Week | Running programs",
  description:
    "A home for your running goals. Build a running program, organize your week, and make room for recovery.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
