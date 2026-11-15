import type { ReactNode } from "react";

type Kind = "running" | "cycling" | "swimming" | "walking" | "hiking" | "strength" | "workout" | "elliptical" | "yoga" | "rowing"
  | "skiing" | "skating" | "climbing" | "racket" | "other";

const KINDS: Record<string, Kind> = {
  Run: "running", TrailRun: "running", VirtualRun: "running",
  Ride: "cycling", VirtualRide: "cycling", EBikeRide: "cycling", MountainBikeRide: "cycling", EMountainBikeRide: "cycling",
  GravelRide: "cycling", Velomobile: "cycling", Handcycle: "cycling",
  Swim: "swimming",
  Walk: "walking", Wheelchair: "walking",
  Hike: "hiking", Snowshoe: "hiking",
  WeightTraining: "strength", Crossfit: "strength",
  Workout: "workout", HighIntensityIntervalTraining: "workout", StairStepper: "workout",
  Elliptical: "elliptical",
  Yoga: "yoga", Pilates: "yoga",
  Rowing: "rowing", VirtualRow: "rowing", Kayaking: "rowing", Canoeing: "rowing", StandUpPaddling: "rowing",
  AlpineSki: "skiing", BackcountrySki: "skiing", NordicSki: "skiing", Snowboard: "skiing",
  IceSkate: "skating", InlineSkate: "skating", RollerSki: "skating", Skateboard: "skating",
  RockClimbing: "climbing",
  Tennis: "racket", Badminton: "racket", Squash: "racket", TableTennis: "racket", Pickleball: "racket", Racquetball: "racket",
};

const PATHS: Record<Kind, ReactNode> = {
  running: <path d="M3 17.5v-5c0-2.6 1.1-5 3-5.8l2.2 2.1c.9.8 2.4.6 3-.5l.9-1.6 3 4.3 4.6 1.4c1.4.4 2.3 1.6 2.3 3v2.1ZM3 15h19M11.5 9.6l-1.8 1M13.1 11.5l-1.8 1" />,
  cycling: <><circle cx="5.5" cy="16.5" r="3.5" /><circle cx="18.5" cy="16.5" r="3.5" /><path d="M5.5 16.5 9 9h6l3.5 7.5M9 9l3 7.5L15 9M8 6h3" /></>,
  swimming: <path d="M2 7c1.7-1.3 3.3-1.3 5 0s3.3 1.3 5 0 3.3-1.3 5 0 3.3 1.3 5 0M2 12c1.7-1.3 3.3-1.3 5 0s3.3 1.3 5 0 3.3-1.3 5 0 3.3 1.3 5 0M2 17c1.7-1.3 3.3-1.3 5 0s3.3 1.3 5 0 3.3-1.3 5 0 3.3 1.3 5 0" />,
  walking: <><circle cx="13" cy="4" r="2" /><path d="m9 21 2-6 3 3v3M11 15l1-6-3 2-1 3M12 9l2 3 3 1" /></>,
  hiking: <path d="m2 20 7-12 4 6 3-4 6 10Z" />,
  strength: <path d="M6 7v10M3 9v6M18 7v10M21 9v6M6 12h12" />,
  workout: <path d="M13 2 4 14h7l-1 8 9-12h-7Z" />,
  elliptical: <><ellipse cx="12" cy="12" rx="9" ry="5" /><path d="m17 5 3 2-3 2" /></>,
  yoga: <><circle cx="12" cy="5" r="2" /><path d="M12 8v6M5 11l7 3 7-3M5 20l7-3 7 3" /></>,
  rowing: <path d="M3 14h18l-3 4H6ZM9 14 16 4M2 21c2-1 4-1 6 0s4 1 6 0 4-1 6 0" />,
  skiing: <path d="M12 2v20M3.5 7l17 10M20.5 7l-17 10M9 3.5 12 6l3-2.5M9 20.5l3-2.5 3 2.5" />,
  skating: <><path d="M5 4h6v8l8 3v3H5ZM4 21h16" /></>,
  climbing: <><rect x="7" y="3" width="10" height="18" rx="5" /><path d="M17 9h-3v6" /></>,
  racket: <><circle cx="12" cy="12" r="9" /><path d="M5.6 5.6c3.5 3.5 3.5 9.3 0 12.8M18.4 5.6c-3.5 3.5-3.5 9.3 0 12.8" /></>,
  other: <path d="M2 12h4l3-8 6 16 3-8h4" />,
};

/** The icon/color family of a Strava sport type. */
export function sportKind(sport: string): Kind {
  return KINDS[sport] ?? "other";
}

/** A decorative icon; callers supply the accessible sport name. */
export function SportIcon({ sport, className = "size-3" }: { sport: string; className?: string }) {
  return <svg aria-hidden="true" data-sport-icon={sportKind(sport)} viewBox="0 0 24 24" fill="none" stroke="currentColor"
    strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={`shrink-0 ${className}`}>
    {PATHS[sportKind(sport)]}
  </svg>;
}

/** A decorative icon for combined cross-training; callers supply the accessible label. */
export function CrossTrainingIcon({ className = "size-3" }: { className?: string }) {
  return <svg aria-hidden="true" data-cross-training-icon viewBox="0 0 24 24" fill="none" stroke="currentColor"
    strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={`shrink-0 ${className}`}>
    <path d="m12 3 9 5-9 5-9-5ZM3 12.5l9 5 9-5M3 17l9 5 9-5" />
  </svg>;
}
