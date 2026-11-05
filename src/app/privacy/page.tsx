import type { Metadata } from "next";
import { Suspense } from "react";
import { connection } from "next/server";
import { PrivacyLoading, PrivacyPolicy } from "@/features/account/components/privacy-policy";
import { hostingProvider } from "@/features/garmin/server/privacy";

export const metadata: Metadata = { title: "Privacy policy · Run Week" };

export default function PrivacyPage() {
  return <Suspense fallback={<PrivacyLoading />}><PrivacyContent /></Suspense>;
}

async function PrivacyContent() {
  await connection();
  return <PrivacyPolicy host={hostingProvider()} />;
}
