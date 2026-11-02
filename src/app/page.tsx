import { RunningPlanner } from "@/features/running-programs/components/running-planner";

export default function Home() {
  return (
    <div className="mx-auto w-full max-w-6xl px-6 py-3 sm:px-10 sm:py-4">
      <main className="pt-3 sm:pt-4">
        <RunningPlanner />
      </main>
    </div>
  );
}
