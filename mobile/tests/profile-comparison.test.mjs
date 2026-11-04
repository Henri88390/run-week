import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import ts from "typescript";

function load(file, imports = {}) {
  const module = { exports: {} };
  const compiled = ts.transpileModule(readFileSync(new URL(file, import.meta.url), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  new Function("module", "exports", "require", compiled)(module, module.exports, (name) => {
    assert.ok(Object.hasOwn(imports, name), `Unexpected import: ${name}`);
    return imports[name];
  });
  return module.exports;
}

const domain = load("../../src/features/running-programs/domain.ts");
const { profilesMatch } = load("../../src/features/running-programs/profile-comparison.ts", { "./domain": domain });
const saved = {
  distanceMeters: 5000, raceSeconds: 1500, vdot: domain.calculateVdot(5000, 1500),
  goal: "none", goalDistanceMeters: 5000, schedule: { mode: "count", count: 3 },
  recentWeeklyVolumeKm: null, desiredWeeklyDurationMinutes: null,
  preferredDays: { vo2max: null, threshold: null, long: null },
};

test("unchanged or equivalent setup does not require regenerating", () => {
  assert.equal(profilesMatch(saved, structuredClone(saved)), true);
  for (const distanceMeters of [...domain.DISTANCES.map((item) => item.meters), 12345]) {
    assert.equal(profilesMatch(saved, {
      ...saved, distanceMeters, raceSeconds: domain.equivalentRaceSeconds(saved.vdot, distanceMeters),
    }), true);
  }
  const weekdays = { ...saved, schedule: { mode: "days", days: [1, 3, 5] } };
  assert.equal(profilesMatch(weekdays, { ...weekdays, schedule: { mode: "days", days: [5, 1, 3] } }), true);
});

test("changed parameters require regenerating until reverted", () => {
  for (const change of [
    { raceSeconds: 1499 }, { schedule: { mode: "count", count: 4 } },
    { recentWeeklyVolumeKm: 30 }, { desiredWeeklyDurationMinutes: 180 },
    { preferredDays: { ...saved.preferredDays, long: 5 } },
    { workoutChoices: { ...domain.DEFAULT_WORKOUT_CHOICES, vo2max: "threshold" } },
  ]) {
    assert.equal(profilesMatch(saved, { ...saved, ...change }), false);
  }
  assert.equal(profilesMatch(saved, structuredClone(saved)), true);
});
