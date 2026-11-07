import type { Metadata } from "next";
import { AboutPage } from "@/features/about/components/about-page";

export const metadata: Metadata = { title: "About · Run Week" };

export default function Page() {
  return <AboutPage />;
}
