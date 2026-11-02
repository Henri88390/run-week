export type TrainingDay = {
  day: string;
  kind: "run" | "rest";
  title: string;
  description: string;
  durationMinutes: number;
};

export type RunningProgram = {
  id: string;
  name: string;
  goal: string;
  weekNumber: number;
  days: readonly TrainingDay[];
};
