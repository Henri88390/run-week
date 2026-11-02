import type { RunningProgram } from "../types";

export function ProgramPreview({ program }: { program: RunningProgram }) {
  const runs = program.days.filter((day) => day.kind === "run");
  const totalMinutes = runs.reduce((total, day) => total + day.durationMinutes, 0);

  return (
    <section id="weekly-plan" aria-labelledby="plan-heading" className="scroll-mt-8 rounded-3xl border border-stone-200 bg-white p-6 sm:p-8">
      <div className="flex flex-wrap items-start justify-between gap-6">
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-emerald-700">Sample program / Week {program.weekNumber}</p>
          <h2 id="plan-heading" className="mt-2 text-2xl font-semibold tracking-tight">{program.name}</h2>
          <p className="mt-2 text-stone-600">{program.goal}</p>
        </div>
        <p className="rounded-xl bg-stone-100 px-4 py-3 text-sm text-stone-700">
          <strong>{runs.length} runs</strong> <span aria-hidden="true">/</span> {totalMinutes} minutes
        </p>
      </div>
      <ol className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-7">
        {program.days.map((day) => (
          <li key={day.day} className={`flex flex-col rounded-2xl border p-4 ${day.kind === "run" ? "border-emerald-200 bg-emerald-50" : "border-stone-200 bg-stone-50"}`}>
            <p className="text-xs font-semibold uppercase tracking-wide text-stone-500">{day.day}</p>
            <h3 className="mt-4 text-sm font-semibold">{day.title}</h3>
            <p className="mt-2 flex-1 text-xs leading-5 text-stone-600">{day.description}</p>
            <p className="mt-4 text-sm font-medium text-emerald-800">
              {day.kind === "run" ? `${day.durationMinutes} min` : "Recovery"}
            </p>
          </li>
        ))}
      </ol>
    </section>
  );
}
