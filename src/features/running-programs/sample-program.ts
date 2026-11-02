import type { RunningProgram } from "./types";

export const sampleProgram: RunningProgram = {
  id: "sample-base-building",
  name: "Build your base",
  goal: "Run three times this week.",
  weekNumber: 1,
  days: [
    { day: "Monday", kind: "rest", title: "Rest day", description: "No scheduled run.", durationMinutes: 0 },
    { day: "Tuesday", kind: "run", title: "Easy run", description: "Relaxed, conversational effort.", durationMinutes: 25 },
    { day: "Wednesday", kind: "rest", title: "Rest day", description: "No scheduled run.", durationMinutes: 0 },
    { day: "Thursday", kind: "run", title: "Easy run", description: "Keep it comfortable and steady.", durationMinutes: 30 },
    { day: "Friday", kind: "rest", title: "Rest day", description: "No scheduled run.", durationMinutes: 0 },
    { day: "Saturday", kind: "run", title: "Long easy run", description: "Run at a comfortable pace.", durationMinutes: 40 },
    { day: "Sunday", kind: "rest", title: "Rest day", description: "No scheduled run.", durationMinutes: 0 },
  ],
};
