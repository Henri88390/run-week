import { RunningPlanner } from "@/features/running-programs/components/running-planner";

export default function Home() {
  return (
    <div className="mx-auto w-full max-w-6xl px-6 py-3 sm:px-10 sm:py-4">
      <header className="flex items-center justify-between gap-4 border-b border-stone-200 pb-2">
        <span className="text-xl font-bold tracking-tight">run week<span className="text-emerald-700">.</span></span>
      </header>

      <main className="pt-4 sm:pt-5">
        <RunningPlanner />
      </main>
    </div>
  );
}
