import { DocumentLanguage } from "@/features/i18n/language-select";
import { RunningPlanner } from "@/features/running-programs/components/running-planner";

export default function Home() {
  return (
    <main className="mx-auto w-full max-w-6xl px-6 py-6 sm:px-10 sm:py-8">
      <DocumentLanguage />
      <RunningPlanner />
    </main>
  );
}
