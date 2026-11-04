import { redirect } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { currentUserId } from "@/features/account/server/auth";

async function HomeRedirect() {
  await connection();
  const userId = await currentUserId();
  return redirect(userId ? "/activities" : "/planner");
}

export default function Home() {
  return <Suspense fallback={null}><HomeRedirect /></Suspense>;
}
