import type { AdjustmentLevel, Feedback, GenerationPreferences, PlannerState, Profile, Schedule, TrainingWeek, WorkoutType } from "./types";

export const WEEKDAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
export const DISTANCES = [
  { meters: 1500, label: "1500 m" },
  { meters: 1609.344, label: "1 mile" },
  { meters: 3000, label: "3000 m" },
  { meters: 5000, label: "5 km" },
  { meters: 10000, label: "10 km" },
  { meters: 21097.5, label: "Half marathon" },
  { meters: 42195, label: "Marathon" },
];

export function distanceLabel(meters: number): string {
  return DISTANCES.find((distance) => distance.meters === meters)?.label ?? `${meters} m`;
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
  return Math.round(15 + vdot * 0.4);
}

export function weeklyWorkoutTypes(runCount: number): WorkoutType[] {
  if (runCount === 1) return ["vo2max"];
  if (runCount === 2) return ["easy", "workout"];
  if (runCount === 3) return ["workout", "easy", "long"];
  if (runCount === 4) return ["workout", "easy", "easy", "long"];
  return ["vo2max", "easy", "threshold", "long", ...Array.from({ length: runCount - 4 }, () => "easy" as const)];
}

function spaceKeyWorkouts(days: number[], types: WorkoutType[]): WorkoutType[] {
  let best: WorkoutType[] = types;
  let bestMinimumGap = -1;
  let bestGapVariance = Number.POSITIVE_INFINITY;
  let bestLongWeekend = -1;

  function consider(candidate: WorkoutType[]) {
    const keyDays = candidate
      .map((type, index) => type === "easy" ? -1 : days[index])
      .filter((day) => day >= 0)
      .sort((a, b) => a - b);
    const gaps = keyDays.length > 1
      ? keyDays.map((day, index) => (keyDays[(index + 1) % keyDays.length] - day + 7) % 7 || 7)
      : [7];
    const minimumGap = Math.min(...gaps);
    const targetGap = 7 / gaps.length;
    const gapVariance = gaps.reduce((sum, gap) => sum + (gap - targetGap) ** 2, 0);
    const longWeekend = candidate.some((type, index) => type === "long" && days[index] >= 5) ? 1 : 0;

    if (minimumGap > bestMinimumGap ||
      (minimumGap === bestMinimumGap && gapVariance < bestGapVariance) ||
      (minimumGap === bestMinimumGap && gapVariance === bestGapVariance && longWeekend > bestLongWeekend)) {
      best = [...candidate];
      bestMinimumGap = minimumGap;
      bestGapVariance = gapVariance;
      bestLongWeekend = longWeekend;
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
  return best;
}

export function workoutLabel(type: WorkoutType): string {
  if (type === "vo2max") return "VO₂ max workout";
  if (type === "threshold") return "Threshold workout";
  if (type === "long") return "Long run";
  if (type === "workout") return "Workout";
  return "Easy run";
}

function paceRange(vdot: number, slowFraction: number, fastFraction: number): string {
  return `${formatPace(paceAtFraction(vdot, fastFraction))}-${formatPace(paceAtFraction(vdot, slowFraction))} min/km`;
}

export function workoutSessionDetails(
  type: WorkoutType,
  vdot: number,
  durationMinutes: number,
  adjustment: AdjustmentLevel | boolean = 0,
  legacyIntensityDecreased = false,
): string | null {
  const intensityAdjustment = typeof adjustment === "boolean"
    ? adjustment ? 1 : legacyIntensityDecreased ? -1 : 0
    : adjustment;
  if (type === "vo2max") {
    if (durationMinutes < 20) return "Keep this short session easy; it is too short for a structured interval set with warm-up and cool-down.";
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
    return `${warmup} min easy warm-up; ${repeats} x 3min at ${paceRange(vdot, 0.97, 1.0)}, with ${recoveryDuration} min easy jog recovery; ${cooldown} min easy cool-down.`;
  }

  if (type === "threshold") {
    if (durationMinutes < 20) return "Keep this short session easy; it is too short for a structured threshold set with warm-up and cool-down.";
    const pace = paceRange(vdot, 0.83, 0.88);
    if (durationMinutes <= 30) {
      const standardWork = durationMinutes - 10;
      const workChange = Math.sign(intensityAdjustment)
        * Math.min(Math.abs(intensityAdjustment) * 2, standardWork - 5);
      const work = standardWork + workChange;
      const easyTime = durationMinutes - work;
      const warmup = Math.floor(easyTime / 2);
      return `${warmup} min easy warm-up; ${work}min continuous at ${pace}; ${easyTime - warmup} min easy cool-down.`;
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
    return `${warmup} min easy warm-up; ${set} at ${pace}, with 2 min easy jog recoveries; ${easyTime - warmup} min easy cool-down.`;
  }

  return null;
}

function plannedWorkoutDurations(vdot: number, workoutTypes: WorkoutType[]): number[] {
  const easyMinutes = easyRunDuration(vdot);
  return workoutTypes.map((type, index) => {
    if (type === "long") return Math.round(easyMinutes * 1.5);
    if (type !== "easy") return easyMinutes;

    const adjacentSessions = [workoutTypes[index - 1], workoutTypes[index + 1]];
    const nearHardSession = adjacentSessions.some((neighbor) =>
      neighbor === "workout" || neighbor === "vo2max" || neighbor === "threshold" || neighbor === "long");
    return Math.max(10, easyMinutes - (nearHardSession ? 5 : 0));
  });
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

function adjustRunDays(days: number[], adjustment: -1 | 0 | 1): number[] {
  if (adjustment === 0 || (adjustment === -1 && days.length <= 1) || (adjustment === 1 && days.length >= 7))
    return days;
  const candidates = adjustment === 1
    ? Array.from({ length: 7 }, (_, day) => day).filter((day) => !days.includes(day)).map((day) => [...days, day])
    : days.map((removedDay) => days.filter((day) => day !== removedDay));

  function spacing(candidate: number[]) {
    const sorted = [...candidate].sort((a, b) => a - b);
    const gaps = sorted.map((day, index) => (sorted[(index + 1) % sorted.length] - day + 7) % 7 || 7);
    const target = 7 / gaps.length;
    return {
      minimum: Math.min(...gaps),
      variance: gaps.reduce((sum, gap) => sum + (gap - target) ** 2, 0),
    };
  }

  return candidates.reduce((best, candidate) => {
    const candidateScore = spacing(candidate);
    const bestScore = spacing(best);
    return candidateScore.minimum > bestScore.minimum ||
      (candidateScore.minimum === bestScore.minimum && candidateScore.variance < bestScore.variance)
      ? candidate : best;
  });
}

export function volumeIncreasePercent(currentKm: number, vdot: number): number {
  const regularIncrease = Math.min(30, Math.max(2, 30 - (currentKm - 20) * 25 / 80));
  const fitnessFactor = Math.min(1, Math.max(0, (vdot - 60) / 4));
  const lowVolumeFactor = Math.min(1, Math.max(0, (30 - currentKm) / 10));
  return Math.round(regularIncrease + (100 - regularIncrease) * fitnessFactor * lowVolumeFactor);
}

function estimatedWeekKm(week: TrainingWeek): number {
  const minutes = week.workouts.reduce((sum, workout) => sum + workout.durationMinutes, 0);
  return week.targetWeeklyVolumeKm ?? minutes * 60 / averageEasyPaceSecondsPerKm(week.profile.vdot);
}

export function validatePerformance(distanceMeters: number, raceSeconds: number): string[] {
  const errors: string[] = [];
  if (!Number.isFinite(distanceMeters) || distanceMeters < 1500 || distanceMeters > 42195)
    errors.push("Performance distance must be between 1500 and 42,195 metres.");
  if (!Number.isInteger(raceSeconds) || raceSeconds < 180 || raceSeconds > 28800)
    errors.push("Race time must be between 3 minutes and 8 hours, in whole seconds.");
  const speed = distanceMeters / (raceSeconds / 60);
  const vdot = calculateVdot(distanceMeters, raceSeconds);
  if (!Number.isFinite(vdot) || vdot < 10 || vdot > 85 || speed < 50 || speed > 450)
    errors.push("This performance is outside the supported estimate range (VDOT 10–85). Check distance and time.");
  return errors;
}

export function validateProfile(profile: Profile): string[] {
  const errors = validatePerformance(profile.distanceMeters, profile.raceSeconds);
  const vdot = calculateVdot(profile.distanceMeters, profile.raceSeconds);
  if (profile.recentWeeklyVolumeKm !== null &&
    (!Number.isInteger(profile.recentWeeklyVolumeKm) || profile.recentWeeklyVolumeKm <= 0))
    errors.push("Enter a whole-number recent average weekly volume greater than 0 km.");
  const count = profile.schedule.mode === "count" ? profile.schedule.count : profile.schedule.days.length;
  const scheduleIsValid = Number.isInteger(count) && count >= 1 && count <= 7;
  if (scheduleIsValid && profile.recentWeeklyVolumeKm !== null && profile.recentWeeklyVolumeKm > 0
    && Math.round(profile.recentWeeklyVolumeKm * averageEasyPaceSecondsPerKm(vdot) / 600) * 10 < count * 10)
    errors.push("Weekly volume is too low to assign at least 10 minutes to each scheduled run.");
  if (!["none", "maintain", "improve"].includes(profile.goal))
    errors.push("Choose a goal.");
  if (!Number.isFinite(profile.goalDistanceMeters) || profile.goalDistanceMeters < 1500 || profile.goalDistanceMeters > 42195)
    errors.push("Goal distance must be between 1500 and 42,195 metres.");
  if (!Number.isInteger(count) || count < 1 || count > 7 ||
      (profile.schedule.mode === "days" && (new Set(profile.schedule.days).size !== count ||
        profile.schedule.days.some((day) => !Number.isInteger(day) || day < 0 || day > 6))))
    errors.push("Choose at least one weekday, or between 1 and 7 runs.");
  if (!Number.isFinite(profile.vdot) || Math.abs(profile.vdot - vdot) > 0.000001)
    errors.push("VDOT must match the entered performance.");
  return errors;
}

export function feedbackNeedsReduction(feedback: Feedback): boolean {
  return feedback.readiness === "tired" || feedback.readiness === "unwell"
    || feedback.effort === "hard" || feedback.strength === "low"
    || feedback.pace === "too-fast" || feedback.outcome === "skipped";
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
  previous?: TrainingWeek,
  preferences: GenerationPreferences = { volumeAdjustment: 0, intensityAdjustment: 0, runCountAdjustment: 0 },
): TrainingWeek {
  const previousHadDifficulty = previous?.workouts.some((workout) => feedbackNeedsReduction(workout.feedback)) ?? false;
  const runCountAdjustment = previousHadDifficulty && preferences.runCountAdjustment === 1
    ? 0 : preferences.runCountAdjustment;
  const days = adjustRunDays(selectDays(profile.schedule), runCountAdjustment);
  const workoutTypes = spaceKeyWorkouts(days, weeklyWorkoutTypes(days.length));
  const durationWeights = plannedWorkoutDurations(profile.vdot, workoutTypes);
  const volumeAdjustment = previousHadDifficulty && preferences.volumeAdjustment > 0 ? 0 : preferences.volumeAdjustment;
  const intensityAdjustment = previousHadDifficulty && preferences.intensityAdjustment > 0 ? 0 : preferences.intensityAdjustment;
  const increaseVolumeApplied = volumeAdjustment > 0 && previous !== undefined;
  const decreaseVolumeApplied = volumeAdjustment < 0 && previous !== undefined && !previousHadDifficulty;
  const increaseIntensityApplied = intensityAdjustment > 0;
  const decreaseIntensityApplied = intensityAdjustment < 0;
  const baseVolumeKm = previous ? estimatedWeekKm(previous) : profile.recentWeeklyVolumeKm;
  const fullIncreasePercent = increaseVolumeApplied && baseVolumeKm !== null
    ? volumeIncreasePercent(baseVolumeKm, profile.vdot) : 0;
  const increasePercent = volumeAdjustment === 1 ? Math.max(1, Math.round(fullIncreasePercent / 2)) : fullIncreasePercent;
  const volumeReductionPercent = volumeAdjustment === -2 ? 10 : 5;
  const targetWeeklyVolumeKm = previousHadDifficulty
    ? baseVolumeKm === null ? null : baseVolumeKm * 0.95
    : increaseVolumeApplied && baseVolumeKm !== null
      ? baseVolumeKm * (1 + increasePercent / 100)
      : decreaseVolumeApplied && baseVolumeKm !== null
        ? baseVolumeKm * (1 - volumeReductionPercent / 100)
        : profile.recentWeeklyVolumeKm;
  const reduce = previousHadDifficulty;
  const targetMinutes = targetWeeklyVolumeKm === null
    ? null
    : Math.max(days.length * 10, Math.round(targetWeeklyVolumeKm * averageEasyPaceSecondsPerKm(profile.vdot) / 600) * 10);
  const durations = targetMinutes === null
    ? durationWeights.map((duration) => Math.max(10, Math.round(duration * (reduce ? 0.95 : 1) / 10) * 10))
    : allocateDuration(durationWeights, targetMinutes);
  return {
    id: startDate,
    number: (previous?.number ?? 0) + 1,
    startDate,
    profile: { ...profile, schedule: profile.schedule.mode === "days"
      ? { mode: "days", days: [...profile.schedule.days] } : { ...profile.schedule } },
    workouts: days.map((day, i) => ({
      day,
      durationMinutes: durations[i],
      type: workoutTypes[i],
      intensityAdjustment: workoutTypes[i] === "vo2max" || workoutTypes[i] === "threshold" ? intensityAdjustment : 0,
      feedback: {},
    })),
    targetWeeklyVolumeKm,
    rationale: [
      increaseVolumeApplied && baseVolumeKm !== null
        ? `Volume increased by ${increasePercent}% from the previous week’s estimated ${baseVolumeKm.toFixed(1)} km.`
        : decreaseVolumeApplied && baseVolumeKm !== null
          ? `Volume reduced by ${volumeReductionPercent}% from the previous week’s estimated ${baseVolumeKm.toFixed(1)} km.`
        : targetWeeklyVolumeKm === null
        ? "No weekly volume was entered; session durations use the VDOT-based baseline and workout type."
        : `The four-week average is ${profile.recentWeeklyVolumeKm} km/week; this plan targets ${targetWeeklyVolumeKm.toFixed(1)} km.`,
      targetWeeklyVolumeKm === null
        ? "Session durations are rounded to 10-minute increments and adjusted for workout type and nearby sessions."
        : "Target distance is converted to time using the midpoint of the VDOT easy-pace range, rounded to 10-minute session increments, and distributed by workout type and nearby sessions.",
      runCountAdjustment === 1 ? "One run was added for this week only; the saved schedule is unchanged."
        : runCountAdjustment === -1 ? "One run was removed for this week only; the saved schedule is unchanged." : "",
      increaseIntensityApplied ? `VO₂ max and threshold sessions use intensity adjustment level +${intensityAdjustment}.` : "",
      decreaseIntensityApplied ? `VO₂ max and threshold sessions use intensity adjustment level ${intensityAdjustment}.` : "",
      "Workout and long runs are spaced as evenly as the selected weekdays allow; a weekend long run is preferred when spacing is equal.",
      reduce ? "At least one tired/unwell, hard, low-strength, too-fast or skipped response: target volume reduced by 5%." :
        "No reduction signal recorded. Missing feedback is unknown; no feedback-based adjustment applied.",
      "Workout categories follow the selected weekly structure. Session details are illustrative product rules, not validated coaching advice.",
    ].filter(Boolean).join(" "),
  };
}

export function createPlanner(profile: Profile, date: Date): PlannerState {
  const week = generateWeek(profile, mondayOf(date));
  return { version: 1, profile, currentWeekId: week.id, weeks: [week] };
}

export function updateFeedback(state: PlannerState, weekId: string, day: number, feedback: Feedback): PlannerState {
  if (state.currentWeekId !== weekId) return state;
  return { ...state, weeks: state.weeks.map((week) => week.id === weekId ? {
    ...week, workouts: week.workouts.map((workout) => workout.day === day ? { ...workout, feedback } : workout),
  } : week) };
}
