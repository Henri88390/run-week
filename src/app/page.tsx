import { ProgramPreview } from "@/features/running-programs/components/program-preview";
import { sampleProgram } from "@/features/running-programs/sample-program";

export default function Home() {
  return (
    <div className="mx-auto w-full max-w-6xl px-6 py-8 sm:px-10 sm:py-12">
      <header className="flex items-center justify-between gap-4 border-b border-stone-200 pb-6">
        <span className="text-xl font-bold tracking-tight">run week<span className="text-emerald-700">.</span></span>
      </header>

      <main className="py-12 sm:py-20">
        <section className="max-w-2xl">
          <a
            href="#weekly-plan"
            className="inline-flex rounded-full bg-emerald-800 px-6 py-3 font-semibold text-white transition-colors hover:bg-emerald-900 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-emerald-800"
          >
            View sample week <span aria-hidden="true" className="ml-3">&rarr;</span>
          </a>
        </section>

        <div className="mt-16">
          <ProgramPreview program={sampleProgram} />
        </div>
      </main>
    </div>
  );
}
