import type {
  AdjustmentLevel, PlannerState, PreferredDays, Profile, Schedule, TrainingWeek, Workout, WorkoutChoices, WorkoutType,
} from "./types";

export const NO_PREFERRED_DAYS: PreferredDays = { vo2max: null, threshold: null, long: null };
export const DEFAULT_WORKOUT_CHOICES: WorkoutChoices = { vo2max: "vo2max", threshold: "threshold", long: "long" };
export const KEY_WORKOUT_TYPES = ["vo2max", "threshold", "repetition", "long", "easy"] as const;
export type PreferredSession = keyof PreferredDays;
export type PreferredDay = { type: PreferredSession; day: number };

export const WEEKDAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
export type NamedDistance = "mile" | "halfMarathon" | "marathon";
export const DISTANCES: { meters: number; label: string; name?: NamedDistance }[] = [
  { meters: 1500, label: "1500 m" },
  { meters: 1609.344, label: "1 mile", name: "mile" },
  { meters: 3000, label: "3000 m" },
  { meters: 5000, label: "5 km" },
  { meters: 10000, label: "10 km" },
  { meters: 21097.5, label: "Half marathon", name: "halfMarathon" },
  { meters: 42195, label: "Marathon", name: "marathon" },
];

export function distanceLabel(meters: number, names?: Record<NamedDistance, string>): string {
  const distance = DISTANCES.find((entry) => entry.meters === meters);
  if (!distance) return `${meters} m`;
  return distance.name && names ? names[distance.name] : distance.label;
}

/** Daniels–Gilbert race-performance equations: distance in metres, time in minutes. */
export function calculateVdot(distanceMeters: number, raceSeconds: number): number {
  const minutes = raceSeconds / 60;
  const velocity = distanceMeters / minutes;
  const oxygen = -4.6 + 0.182258 * velocity + 0.000104 * velocity ** 2;
  const fraction = 0.8 + 0.1894393 * Math.exp(-0.012778 * minutes)
    + 0.2989558 * Math.exp(-0.1932605 * minutes);
  return oxygen / fraction;
}

/** Invert Daniels' oxygen-cost equation at a fraction of VDOT; returns seconds/km. */
export function paceAtFraction(vdot: number, fraction: number): number {
  const velocity = (-0.182258 + Math.sqrt(0.182258 ** 2 + 4 * 0.000104 * (4.6 + vdot * fraction)))
    / (2 * 0.000104);
  return 60000 / velocity;
}

export function formatPace(secondsPerKm: number): string {
  const seconds = Math.round(secondsPerKm);
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

export function easyPace(vdot: number): string {
  return `${formatPace(paceAtFraction(vdot, 0.74))}–${formatPace(paceAtFraction(vdot, 0.59))} min/km`;
}

export function averageEasyPaceSecondsPerKm(vdot: number): number {
  return (paceAtFraction(vdot, 0.59) + paceAtFraction(vdot, 0.74)) / 2;
}

export function easyRunDuration(vdot: number): number {
  return workoutRunDuration(vdot) + 10;
}

function workoutRunDuration(vdot: number): number {
  return Math.round(20 + vdot * 0.55);
}

export function weeklyWorkoutTypes(runCount: number): WorkoutType[] {
  if (runCount === 1) return ["vo2max"];
  if (runCount === 2) return ["easy", "vo2max"];
  if (runCount === 3) return ["vo2max", "easy", "long"];
  if (runCount === 4) return ["vo2max", "easy", "easy", "long"];
  return ["vo2max", "easy", "threshold", "long", ...Array.from({ length: runCount - 4 }, () => "easy" as const)];
}

/** Preferred days for the key sessions that the given run count actually schedules. */
export function activePreferredDays(
  preferredDays: PreferredDays | undefined, runCount: number, choices = DEFAULT_WORKOUT_CHOICES,
): PreferredDay[] {
  if (!preferredDays) return [];
  const types = weeklyWorkoutTypes(runCount);
  const preferred = (["vo2max", "threshold", "long"] as const)
    .filter((type) => types.includes(type) && preferredDays[type] !== null)
    .map((type) => ({ type, day: preferredDays[type] as number }));
  // A skipped slot cannot displace a real workout or require two runs on one day.
  return preferred.filter(({ type, day }) => choices[type] !== "easy"
    || !preferred.some((other) => other.type !== type && other.day === day));
}

/** Lexicographic comparison of score arrays; higher is better. */
function isBetterScore(score: number[], best: number[] | null): boolean {
  if (!best) return true;
  const index = score.findIndex((value, i) => value !== best[i]);
  return index >= 0 && score[index] > best[index];
}

function cyclicGaps(days: number[]): number[] {
  return days.length > 1 ? days.map((day, index) => (days[(index + 1) % days.length] - day + 7) % 7 || 7) : [7];
}

function gapVariance(gaps: number[]): number {
  return gaps.reduce((sum, gap) => sum + (gap - 7 / gaps.length) ** 2, 0);
}

/**
 * Assign session types to sorted run days. Score order: preferred days honoured,
 * then spacing between key sessions, then a weekend long run.
 */
function selectedWorkout(type: WorkoutType, choices: WorkoutChoices): WorkoutType {
  return type === "vo2max" || type === "threshold" || type === "long" ? choices[type] : type;
}

function spaceKeyWorkouts(
  days: number[], types: WorkoutType[], preferred: PreferredDay[] = [], choices = DEFAULT_WORKOUT_CHOICES,
) {
  let best: WorkoutType[] = types;
  let bestScore: number[] | null = null;

  function consider(candidate: WorkoutType[]) {
    const keyDays = candidate
      .map((type, index) => selectedWorkout(type, choices) === "easy" ? -1 : days[index])
      .filter((day) => day >= 0)
      .sort((a, b) => a - b);
    const gaps = cyclicGaps(keyDays);
    const longWeekend = candidate.filter((type, index) => selectedWorkout(type, choices) === "long" && days[index] >= 5).length;
    const matched = preferred.filter(({ type, day }) => candidate[days.indexOf(day)] === type).length;
    const score = [matched, gaps.length ? Math.min(...gaps) : 7, gaps.length ? -gapVariance(gaps) : 0, longWeekend];
    if (isBetterScore(score, bestScore)) {
      best = [...candidate];
      bestScore = score;
    }
  }

  function arrange(index: number, remaining: WorkoutType[], candidate: WorkoutType[]) {
    if (index === types.length) {
      consider(candidate);
      return;
    }
    const tried = new Set<WorkoutType>();
    for (let i = 0; i < remaining.length; i++) {
      const type = remaining[i];
      if (tried.has(type)) continue;
      tried.add(type);
      arrange(index + 1, [...remaining.slice(0, i), ...remaining.slice(i + 1)], [...candidate, type]);
    }
  }

  arrange(0, types, []);
  return { types: best, score: bestScore ?? [] };
}

export type WorkoutLabelKey = "easy" | "long" | "vo2max" | "threshold" | "repetition";

export function workoutLabelKey(type: WorkoutType): WorkoutLabelKey {
  if (type === "vo2max" || type === "workout") return "vo2max";
  if (type === "threshold") return "threshold";
  if (type === "repetition") return "repetition";
  if (type === "long") return "long";
  return "easy";
}

function paceRange(vdot: number, slowFraction: number, fastFraction: number): string {
  return `${formatPace(paceAtFraction(vdot, fastFraction))}-${formatPace(paceAtFraction(vdot, slowFraction))} min/km`;
}

export type WorkoutStepKind = "warmup" | "cooldown" | "vo2Interval" | "threshold" | "repetition" | "recovery" | "easyRun" | "longRun";

export type WorkoutSessionStep = {
  kind: WorkoutStepKind;
  durationMinutes: number;
  intensity: "active" | "warmup" | "recovery" | "interval" | "cooldown";
  paceFractions?: [slow: number, fast: number];
  paceSecondsPerKm?: number;
  distanceMeters?: number;
  fullRecovery?: boolean;
};

/** Continuous approximation of R pace from equivalent mile performance, not a printed-table lookup. */
export function repetitionPaceSecondsPerKm(vdot: number): number {
  return equivalentRaceSeconds(vdot, 1609.344) / 1.609344;
}

export function stepPaces(step: WorkoutSessionStep, vdot: number): [slow: number, fast: number] | null {
  if (step.paceSecondsPerKm !== undefined) return [step.paceSecondsPerKm, step.paceSecondsPerKm];
  return step.paceFractions
    ? [paceAtFraction(vdot, step.paceFractions[0]), paceAtFraction(vdot, step.paceFractions[1])]
    : null;
}

export type WorkoutSessionPlan = {
  description: string;
  steps: WorkoutSessionStep[];
};

export function workoutSessionPlan(
  type: WorkoutType,
  vdot: number,
  durationMinutes: number,
  adjustment: AdjustmentLevel | boolean = 0,
  legacyIntensityDecreased = false,
  repetitionDistanceLimitKm = durationMinutes * 60 / paceAtFraction(vdot, 0.59) * 0.05,
): WorkoutSessionPlan | null {
  const intensityAdjustment = typeof adjustment === "boolean"
    ? adjustment ? 1 : legacyIntensityDecreased ? -1 : 0
    : adjustment;
  if (type === "workout") return workoutSessionPlan("vo2max", vdot, durationMinutes, intensityAdjustment);
  if (type === "repetition") {
    const pace = repetitionPaceSecondsPerKm(vdot);
    const distanceMeters = durationMinutes >= 50 && pace * 0.4 <= 120 && repetitionDistanceLimitKm >= 0.8 ? 400 : 200;
    const repSeconds = Math.round(pace * distanceMeters / 1000);
    const recoverySeconds = repSeconds * 3;
    const maxByTime = Math.floor(((durationMinutes - 16) * 60 + recoverySeconds) / (repSeconds + recoverySeconds));
    const maxByDistance = Math.floor(Math.min(8, repetitionDistanceLimitKm) * 1000 / distanceMeters);
    const maximum = Math.min(12, maxByTime, maxByDistance);
    if (repSeconds > 120 || maximum < 2) {
      return {
        description: "Easy running only: insufficient session time or estimated weekly distance for a short R set.",
        steps: [{ kind: "easyRun", durationMinutes, intensity: "active" }],
      };
    }
    const repeats = Math.min(maximum, Math.max(2, Math.min(8, maximum) + intensityAdjustment));
    const easySeconds = durationMinutes * 60 - repeats * repSeconds - (repeats - 1) * recoverySeconds;
    const warmupSeconds = Math.floor(easySeconds / 2);
    const steps: WorkoutSessionStep[] = [{ kind: "warmup", durationMinutes: warmupSeconds / 60, intensity: "warmup" }];
    for (let index = 0; index < repeats; index++) {
      steps.push({
        kind: "repetition", durationMinutes: repSeconds / 60, distanceMeters,
        intensity: "interval", paceSecondsPerKm: pace,
      });
      if (index < repeats - 1) steps.push({
        kind: "recovery", durationMinutes: recoverySeconds / 60, intensity: "recovery", fullRecovery: true,
      });
    }
    steps.push({ kind: "cooldown", durationMinutes: (easySeconds - warmupSeconds) / 60, intensity: "cooldown" });
    return {
      description: `${repeats} x ${distanceMeters} m at estimated R pace (${formatPace(pace)} min/km), with full recovery; extend recovery if needed.`,
      steps,
    };
  }
  if (type === "vo2max") {
    if (durationMinutes < 20) {
      return {
        description: "Keep this short session easy; it is too short for a structured interval set with warm-up and cool-down.",
        steps: [{ kind: "easyRun", durationMinutes, intensity: "active" }],
      };
    }
    const standardRepeats = Math.min(5, Math.max(1, Math.floor((durationMinutes - 10) / 5)));
    const maxRepeats = Math.floor((durationMinutes - 8) / 5);
    const requestedRepeats = standardRepeats + Math.sign(intensityAdjustment) * Math.min(2, Math.abs(intensityAdjustment));
    const repeats = Math.min(maxRepeats, Math.max(1, requestedRepeats));
    const adjustmentWasCapped = repeats !== requestedRepeats;
    const recoveryDuration = adjustmentWasCapped && intensityAdjustment !== 0
      ? intensityAdjustment > 0 ? 1 : 3
      : 2;
    const intervalTime = repeats * 3 + (repeats - 1) * recoveryDuration;
    const easyTime = durationMinutes - intervalTime;
    const warmup = Math.floor(easyTime / 2);
    const cooldown = easyTime - warmup;
    const steps: WorkoutSessionStep[] = [{ kind: "warmup", durationMinutes: warmup, intensity: "warmup" }];
    for (let index = 0; index < repeats; index++) {
      steps.push({ kind: "vo2Interval", durationMinutes: 3, intensity: "interval", paceFractions: [0.97, 1] });
      if (index < repeats - 1) {
        steps.push({ kind: "recovery", durationMinutes: recoveryDuration, intensity: "recovery" });
      }
    }
    steps.push({ kind: "cooldown", durationMinutes: cooldown, intensity: "cooldown" });
    return {
      description: `${warmup} min easy warm-up; ${repeats} x 3min at ${paceRange(vdot, 0.97, 1.0)}, with ${recoveryDuration} min easy jog recovery; ${cooldown} min easy cool-down.`,
      steps,
    };
  }

  if (type === "threshold") {
    if (durationMinutes < 20) {
      return {
        description: "Keep this short session easy; it is too short for a structured threshold set with warm-up and cool-down.",
        steps: [{ kind: "easyRun", durationMinutes, intensity: "active" }],
      };
    }
    const pace = paceRange(vdot, 0.83, 0.88);
    if (durationMinutes <= 30) {
      const standardWork = durationMinutes - 10;
      const workChange = Math.sign(intensityAdjustment)
        * Math.min(Math.abs(intensityAdjustment) * 2, standardWork - 5);
      const work = standardWork + workChange;
      const easyTime = durationMinutes - work;
      const warmup = Math.floor(easyTime / 2);
      return {
        description: `${warmup} min easy warm-up; ${work}min continuous at ${pace}; ${easyTime - warmup} min easy cool-down.`,
        steps: [
          { kind: "warmup", durationMinutes: warmup, intensity: "warmup" },
          { kind: "threshold", durationMinutes: work, intensity: "active", paceFractions: [0.83, 0.88] },
          { kind: "cooldown", durationMinutes: easyTime - warmup, intensity: "cooldown" },
        ],
      };
    }

    const repeats = Math.ceil((durationMinutes - 8) / 17);
    const recoveryMinutes = 2 * (repeats - 1);
    const standardWorkMinutes = durationMinutes - 10 - recoveryMinutes;
    const easyBudget = durationMinutes - recoveryMinutes - standardWorkMinutes;
    const workChange = intensityAdjustment > 0
      ? Math.min(intensityAdjustment * 2, easyBudget - 6, repeats * 15 - standardWorkMinutes)
      : intensityAdjustment < 0
        ? -Math.min(Math.abs(intensityAdjustment) * 2, standardWorkMinutes - repeats * 5)
        : 0;
    const workMinutes = standardWorkMinutes + workChange;
    const repeatDuration = Math.floor(workMinutes / repeats);
    const longerRepeats = workMinutes % repeats;
    const repeatLengths = Array.from({ length: repeats }, (_, index) => repeatDuration + (index < longerRepeats ? 1 : 0));
    const set = repeatLengths.every((minutes) => minutes === repeatLengths[0])
      ? `${repeats} x ${repeatLengths[0]}min`
      : repeatLengths.map((minutes) => `${minutes}min`).join(" + ");
    const easyTime = durationMinutes - recoveryMinutes - workMinutes;
    const warmup = Math.floor(easyTime / 2);
    const steps: WorkoutSessionStep[] = [{ kind: "warmup", durationMinutes: warmup, intensity: "warmup" }];
    repeatLengths.forEach((minutes, index) => {
      steps.push({ kind: "threshold", durationMinutes: minutes, intensity: "active", paceFractions: [0.83, 0.88] });
      if (index < repeatLengths.length - 1) {
        steps.push({ kind: "recovery", durationMinutes: 2, intensity: "recovery" });
      }
    });
    steps.push({ kind: "cooldown", durationMinutes: easyTime - warmup, intensity: "cooldown" });
    return {
      description: `${warmup} min easy warm-up; ${set} at ${pace}, with 2 min easy jog recoveries; ${easyTime - warmup} min easy cool-down.`,
      steps,
    };
  }

  return null;
}

export function workoutSessionDetails(
  type: WorkoutType,
  vdot: number,
  durationMinutes: number,
  adjustment: AdjustmentLevel | boolean = 0,
  legacyIntensityDecreased = false,
): string | null {
  return workoutSessionPlan(type, vdot, durationMinutes, adjustment, legacyIntensityDecreased)?.description ?? null;
}

/** Share the same R budget and step plan across calendar, clipboard, distance estimates and FIT export. */
export function weekWorkoutSessionPlan(week: TrainingWeek, workout: Workout): WorkoutSessionPlan | null {
  const totalMinutes = week.workouts.reduce((sum, entry) => sum + entry.durationMinutes, 0);
  const estimatedKm = totalMinutes * 60 / paceAtFraction(week.profile.vdot, 0.59);
  const repetitionCount = week.workouts.filter((entry) => entry.type === "repetition").length;
  const budgetKm = Math.min(8, estimatedKm * 0.05) / Math.max(1, repetitionCount);
  return workoutSessionPlan(
    workout.type ?? "easy", week.profile.vdot, workout.durationMinutes,
    workout.intensityAdjustment ?? (workout.intensityIncreased ? 1 : workout.intensityDecreased ? -1 : 0),
    false, budgetKm,
  );
}

export function estimatedWorkoutDistanceKm(workout: Workout, vdot: number, week?: TrainingWeek): { min: number; max: number } {
  const type = workout.type ?? "easy";
  const plan = week ? weekWorkoutSessionPlan(week, workout) : workoutSessionPlan(
    type,
    vdot,
    workout.durationMinutes,
    workout.intensityAdjustment ?? (workout.intensityIncreased ? 1 : workout.intensityDecreased ? -1 : 0),
  );
  const steps: WorkoutSessionStep[] = plan?.steps ?? [{ kind: "easyRun", durationMinutes: workout.durationMinutes, intensity: "active" }];
  return steps.reduce((distance, step) => {
    const [slow, fast] = stepPaces(step, vdot) ?? [paceAtFraction(vdot, 0.59), paceAtFraction(vdot, 0.74)];
    return {
      min: distance.min + (step.distanceMeters !== undefined ? step.distanceMeters / 1000 : step.durationMinutes * 60 / slow),
      max: distance.max + (step.distanceMeters !== undefined ? step.distanceMeters / 1000 : step.durationMinutes * 60 / fast),
    };
  }, { min: 0, max: 0 });
}

// Each additional easy run in the week is shorter; weaker runners get a larger reduction and a lower floor.
function easyRunDurations(vdot: number, count: number): number[] {
  const longest = easyRunDuration(vdot);
  const step = Math.min(15, Math.max(0, (75 - vdot) / 3));
  const shortest = Math.min(45, Math.max(20, vdot * 0.6 - 5));
  return Array.from({ length: count }, (_, rank) => Math.max(shortest, longest - rank * step));
}

function plannedWorkoutDurations(vdot: number, workoutTypes: WorkoutType[]): number[] {
  const workoutMinutes = workoutRunDuration(vdot);
  const isHard = (type: WorkoutType | undefined) =>
    type !== undefined && type !== "easy";
  const easyIndexes = workoutTypes
    .map((type, index) => ({ type, index }))
    .filter(({ type }) => type === "easy")
    .map(({ index }) => ({
      index,
      nearHardSession: isHard(workoutTypes[index - 1]) || isHard(workoutTypes[index + 1]),
    }))
    .sort((a, b) => Number(a.nearHardSession) - Number(b.nearHardSession) || a.index - b.index);
  const easyDurations = easyRunDurations(vdot, easyIndexes.length);
  const easyByIndex = new Map(easyIndexes.map(({ index }, rank) => [index, easyDurations[rank]]));

  return workoutTypes.map((type, index) => {
    if (type === "long") return Math.round(workoutMinutes * 1.5);
    if (type !== "easy") return workoutMinutes;
    return easyByIndex.get(index) ?? easyDurations[0];
  });
}

/**
 * Makes the long run strictly longer than every easy run by moving 10-minute blocks to it, keeping the
 * weekly total. The longest easy run gives time first, then other sessions above 10 minutes. Only when
 * every run is already at 10 minutes is the long run extended beyond the total.
 */
function lengthenLongRun(durations: number[], workoutTypes: WorkoutType[]): number[] {
  const result = [...durations];
  const longIndexes = workoutTypes.flatMap((type, index) => type === "long" ? [index] : []);
  if (!longIndexes.length) return result;
  const easyIndexes = workoutTypes.flatMap((type, index) => type === "easy" ? [index] : []);
  const longestEasy = () => easyIndexes.reduce((best, index) => result[index] > result[best] ? index : best, easyIndexes[0]);
  for (const longIndex of longIndexes) {
    while (easyIndexes.length > 0 && result[longIndex] <= result[longestEasy()]) {
      const easyDonor = longestEasy();
      const donor = result[easyDonor] > 10 ? easyDonor
        : result.findIndex((duration, index) => !longIndexes.includes(index) && duration > 10);
      if (donor !== -1) result[donor] -= 10;
      result[longIndex] += 10;
    }
  }
  return result;
}

function allocateDuration(weights: number[], totalMinutes: number): number[] {
  const totalWeight = weights.reduce((sum, weight) => sum + weight, 0);
  const remainingSlots = totalMinutes / 10 - weights.length;
  const exact = weights.map((weight) => weight * remainingSlots / totalWeight);
  const slots = exact.map((value) => Math.floor(value) + 1);
  let remainder = remainingSlots - exact.reduce((sum, value) => sum + Math.floor(value), 0);
  const order = exact.map((value, index) => ({ index, fraction: value - Math.floor(value) }))
    .sort((a, b) => b.fraction - a.fraction);
  for (let i = 0; remainder > 0; i++, remainder--) slots[order[i % order.length].index]++;
  return slots.map((slot) => slot * 10);
}

export function selectDays(schedule: Schedule): number[] {
  if (schedule.mode === "days") return [...schedule.days].sort((a, b) => a - b);
  // Evenly distributed slots, starting Tuesday unless all seven days are selected.
  return Array.from({ length: schedule.count }, (_, i) =>
    (Math.floor(i * 7 / schedule.count) + (schedule.count === 7 ? 0 : 1)) % 7)
    .sort((a, b) => a - b);
}

/** Choose run days and session types, honouring preferred days for key sessions when possible. */
export function planSessions(
  schedule: Schedule, preferredDays?: PreferredDays, choices = DEFAULT_WORKOUT_CHOICES,
): { days: number[]; types: WorkoutType[] } {
  const defaultDays = selectDays(schedule);
  const preferred = activePreferredDays(preferredDays, defaultDays.length, choices);
  const sessionTypes = weeklyWorkoutTypes(defaultDays.length);
  const defaultPlan = { days: defaultDays, ...spaceKeyWorkouts(defaultDays, sessionTypes, preferred, choices) };
  if (schedule.mode === "days" || !preferred.length)
    return { days: defaultPlan.days, types: defaultPlan.types.map((type) => selectedWorkout(type, choices)) };

  // In run-count mode the days are free: search every set of days for the best arrangement.
  let best = defaultPlan;
  let bestScore: number[] | null = null;
  for (let mask = 0; mask < 128; mask++) {
    const days = [0, 1, 2, 3, 4, 5, 6].filter((day) => mask & (1 << day));
    if (days.length !== defaultDays.length) continue;
    const plan = spaceKeyWorkouts(days, sessionTypes, preferred, choices);
    const [matched, keyGap, keyVariance, longWeekend] = plan.score;
    const runGaps = cyclicGaps(days);
    const score = [
      matched, keyGap, Math.min(...runGaps), keyVariance, -gapVariance(runGaps), longWeekend,
      days.filter((day) => defaultDays.includes(day)).length,
    ];
    if (isBetterScore(score, bestScore)) {
      best = { days, ...plan };
      bestScore = score;
    }
  }
  return { days: best.days, types: best.types.map((type) => selectedWorkout(type, choices)) };
}

/** Race time (whole seconds) giving the same VDOT over another distance. */
export function equivalentRaceSeconds(vdot: number, distanceMeters: number): number {
  // VDOT decreases monotonically with race time, so bisection converges.
  let fast = 60;
  let slow = 12 * 3600;
  for (let i = 0; i < 60; i++) {
    const middle = (fast + slow) / 2;
    if (calculateVdot(distanceMeters, middle) > vdot) fast = middle;
    else slow = middle;
  }
  return Math.round((fast + slow) / 2);
}

export function isSupportedPerformance(distanceMeters: number, raceSeconds: number): boolean {
  const speed = distanceMeters / (raceSeconds / 60);
  const vdot = calculateVdot(distanceMeters, raceSeconds);
  return Number.isFinite(vdot) && vdot >= 10 && vdot <= 85 && speed >= 50 && speed <= 450;
}

export function validatePerformance(distanceMeters: number, raceSeconds: number): string[] {
  const errors: string[] = [];
  if (!Number.isFinite(distanceMeters) || distanceMeters < 1500 || distanceMeters > 42195)
    errors.push("Performance distance must be between 1500 and 42,195 metres.");
  if (!Number.isInteger(raceSeconds) || raceSeconds < 180 || raceSeconds > 28800)
    errors.push("Race time must be between 3 minutes and 8 hours, in whole seconds.");
  if (!isSupportedPerformance(distanceMeters, raceSeconds))
    errors.push("This performance is outside the supported estimate range (VDOT 10–85). Check distance and time.");
  return errors;
}

export function validateProfile(profile: Profile): string[] {
  const errors = validatePerformance(profile.distanceMeters, profile.raceSeconds);
  const vdot = calculateVdot(profile.distanceMeters, profile.raceSeconds);
  if (profile.recentWeeklyVolumeKm !== null &&
    (!Number.isInteger(profile.recentWeeklyVolumeKm) || profile.recentWeeklyVolumeKm <= 0))
    errors.push("Enter a whole-number desired weekly distance greater than 0 km.");
  if (profile.desiredWeeklyDurationMinutes !== null &&
    (!Number.isInteger(profile.desiredWeeklyDurationMinutes) || profile.desiredWeeklyDurationMinutes <= 0
      || profile.desiredWeeklyDurationMinutes > 10080))
    errors.push("Enter a desired weekly time greater than 0 and no more than 168 hours.");
  if (profile.recentWeeklyVolumeKm !== null && profile.desiredWeeklyDurationMinutes !== null)
    errors.push("Choose either desired weekly distance or desired weekly time, not both.");
  const count = profile.schedule.mode === "count" ? profile.schedule.count : profile.schedule.days.length;
  const scheduleIsValid = Number.isInteger(count) && count >= 1 && count <= 7;
  if (scheduleIsValid && profile.recentWeeklyVolumeKm !== null && profile.recentWeeklyVolumeKm > 0
    && Math.round(profile.recentWeeklyVolumeKm * averageEasyPaceSecondsPerKm(vdot) / 600) * 10 < count * 10)
    errors.push("Desired weekly distance is too low to assign at least 10 minutes to each scheduled run.");
  if (scheduleIsValid && profile.desiredWeeklyDurationMinutes !== null
    && profile.desiredWeeklyDurationMinutes < count * 10)
    errors.push("Desired weekly time must allow at least 10 minutes for each scheduled run.");
  if (!["none", "maintain", "improve"].includes(profile.goal))
    errors.push("Choose a goal.");
  if (!Number.isFinite(profile.goalDistanceMeters) || profile.goalDistanceMeters < 1500 || profile.goalDistanceMeters > 42195)
    errors.push("Goal distance must be between 1500 and 42,195 metres.");
  if (!Number.isInteger(count) || count < 1 || count > 7 ||
      (profile.schedule.mode === "days" && (new Set(profile.schedule.days).size !== count ||
        profile.schedule.days.some((day) => !Number.isInteger(day) || day < 0 || day > 6))))
    errors.push("Choose at least one weekday, or between 1 and 7 runs.");
  const preferredDays = profile.preferredDays ?? NO_PREFERRED_DAYS;
  const choices = profile.workoutChoices;
  if (choices && !(["vo2max", "threshold", "long"] as const)
    .every((slot) => KEY_WORKOUT_TYPES.includes(choices[slot])))
    errors.push("Choose a valid workout type for each key session.");
  if (Object.values(preferredDays).some((day) => day !== null && (!Number.isInteger(day) || day < 0 || day > 6)))
    errors.push("Preferred days must be weekdays.");
  else if (scheduleIsValid) {
    const active = activePreferredDays(preferredDays, count, profile.workoutChoices).map(({ day }) => day);
    if (new Set(active).size !== active.length)
      errors.push("Choose a different day for each preferred session.");
    if (profile.schedule.mode === "days" && active.some((day) => !(profile.schedule as { days: number[] }).days.includes(day)))
      errors.push("Choose preferred days among the selected weekdays.");
  }
  if (!Number.isFinite(profile.vdot) || Math.abs(profile.vdot - vdot) > 0.000001)
    errors.push("VDOT must match the entered performance.");
  return errors;
}

export function mondayOf(date: Date): string {
  const local = new Date(date.getFullYear(), date.getMonth(), date.getDate(), 12);
  local.setDate(local.getDate() - (local.getDay() + 6) % 7);
  return `${local.getFullYear()}-${String(local.getMonth() + 1).padStart(2, "0")}-${String(local.getDate()).padStart(2, "0")}`;
}

export function addDays(date: string, days: number): string {
  const value = new Date(`${date}T12:00:00`);
  value.setDate(value.getDate() + days);
  return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(value.getDate()).padStart(2, "0")}`;
}

export function goalLabel(profile: Profile): string {
  if (profile.goal === "improve") return `Improve ${distanceLabel(profile.goalDistanceMeters)}`;
  return profile.goal === "maintain" ? "Maintain current level" : "No specific goal";
}

/** Product heuristics, not a validated training prescription. No automatic progression. */
export function generateWeek(
  profile: Profile,
  startDate: string,
  weekNumber = 1,
): TrainingWeek {
  const { days, types: workoutTypes } = planSessions(profile.schedule, profile.preferredDays, profile.workoutChoices);
  const preferred = activePreferredDays(profile.preferredDays, days.length, profile.workoutChoices);
  const durationWeights = plannedWorkoutDurations(profile.vdot, workoutTypes);
  const targetMinutes = profile.desiredWeeklyDurationMinutes !== null
    ? Math.round(profile.desiredWeeklyDurationMinutes / 10) * 10
    : profile.recentWeeklyVolumeKm === null
      ? null
      : Math.round(profile.recentWeeklyVolumeKm * averageEasyPaceSecondsPerKm(profile.vdot) / 600) * 10;
  const durations = lengthenLongRun(targetMinutes === null
    ? durationWeights.map((duration) => Math.max(10, Math.round(duration / 10) * 10))
    : allocateDuration(durationWeights, targetMinutes), workoutTypes);
  const targetWeeklyVolumeKm = profile.recentWeeklyVolumeKm
    ?? (targetMinutes === null ? null : targetMinutes * 60 / averageEasyPaceSecondsPerKm(profile.vdot));
  return {
    id: startDate,
    number: weekNumber,
    startDate,
    profile: { ...profile, workoutChoices: { ...(profile.workoutChoices ?? DEFAULT_WORKOUT_CHOICES) },
      preferredDays: { ...(profile.preferredDays ?? NO_PREFERRED_DAYS) },
      schedule: profile.schedule.mode === "days"
        ? { mode: "days", days: [...profile.schedule.days] } : { ...profile.schedule } },
    workouts: days.map((day, i) => ({
      day,
      durationMinutes: durations[i],
      type: workoutTypes[i],
      intensityAdjustment: 0,
    })),
    targetWeeklyVolumeKm,
    rationale: [
      targetMinutes === null
        ? "No weekly distance or time target was entered; session durations use the VDOT-based baseline and workout type."
        : profile.desiredWeeklyDurationMinutes !== null
          ? `This plan targets ${Math.floor(targetMinutes / 60)} h ${targetMinutes % 60} min per week, distributed among the scheduled workouts.`
          : `The desired weekly distance is ${profile.recentWeeklyVolumeKm} km; this plan targets approximately ${targetWeeklyVolumeKm?.toFixed(1)} km.`,
      targetMinutes === null
        ? "Session durations are rounded to 10-minute increments and adjusted for workout type and nearby sessions."
        : "The weekly target is rounded to 10-minute session increments and distributed by workout type and nearby sessions.",
      preferred.length
        ? "Preferred days for key sessions are applied first; remaining workouts and long runs are spaced as evenly as the schedule allows."
        : "Workout and long runs are spaced as evenly as the selected weekdays allow; a weekend long run is preferred when spacing is equal.",
      "Workout categories follow the selected weekly structure. Session details are illustrative product rules, not validated coaching advice.",
    ].filter(Boolean).join(" "),
  };
}

export function createPlanner(profile: Profile, date: Date): PlannerState {
  const currentWeek = generateWeek(profile, mondayOf(date));
  return { version: 2, profile, currentWeek };
}
