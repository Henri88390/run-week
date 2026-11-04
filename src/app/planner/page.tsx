import type { Metadata } from "next";
import { RunningPlanner } from "@/features/running-programs/components/running-planner";

export const metadata: Metadata = { title: "Workout planner · Run Week" };

export default function PlannerPage() {
  return <main className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6">
    <RunningPlanner />
  </main>;
}
