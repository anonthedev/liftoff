import type { AthleteProfile, Workout } from "@/lib/db/schema";

export const liftNames = ["Squat", "Bench", "Deadlift"] as const;

export type LiftName = (typeof liftNames)[number];

export type SerializedWorkout = Omit<Workout, "createdAt"> & {
  createdAt: string;
};

export type SerializedAthleteProfile = Omit<AthleteProfile, "updatedAt"> & {
  updatedAt: string;
};

export function calculateEstimated1rm(weight: number, reps: number) {
  return Math.round(weight * (1 + 0.0333 * reps) * 10) / 10;
}

export function serializeWorkout(workout: Workout): SerializedWorkout {
  return {
    ...workout,
    createdAt: workout.createdAt.toISOString(),
  };
}

export function serializeProfile(
  profile: AthleteProfile,
): SerializedAthleteProfile {
  return {
    ...profile,
    updatedAt: profile.updatedAt.toISOString(),
  };
}

export function parseExerciseOrder(order?: string | null): LiftName[] {
  const ordered = (order ?? "")
    .split(",")
    .filter((lift): lift is LiftName =>
      liftNames.includes(lift as LiftName),
    );

  return [
    ...ordered,
    ...liftNames.filter((lift) => !ordered.includes(lift)),
  ];
}

export function getProfileLift(profile: SerializedAthleteProfile, lift: LiftName) {
  if (lift === "Squat") return profile.squat1rm;
  if (lift === "Bench") return profile.bench1rm;
  return profile.deadlift1rm;
}

export function getStrengthBenchmarks(
  profile: SerializedAthleteProfile | null,
  lift: LiftName,
) {
  const gender = profile?.gender?.toLowerCase() ?? "";
  const isFemale =
    gender.includes("female") ||
    gender.includes("woman") ||
    gender.includes("women");
  const bodyweight = profile?.bodyweight ?? (isFemale ? 62 : 82);
  const age = profile?.age ?? 30;
  const ageFactor =
    age < 18
      ? 0.8
      : age < 40
        ? 1
        : age < 50
          ? 0.9
          : age < 60
            ? 0.78
            : 0.65;

  const targetRatios = {
    Squat: isFemale
      ? { baseline: 0.45, recreational: 0.85 }
      : { baseline: 0.65, recreational: 1.25 },
    Bench: isFemale
      ? { baseline: 0.25, recreational: 0.55 }
      : { baseline: 0.45, recreational: 0.9 },
    Deadlift: isFemale
      ? { baseline: 0.6, recreational: 1.1 }
      : { baseline: 0.85, recreational: 1.55 },
  } satisfies Record<LiftName, Record<string, number>>;

  return [
    {
      label: "Baseline bodyweight target",
      value: Math.round(bodyweight * targetRatios[lift].baseline * ageFactor),
    },
    {
      label: "Recreational target",
      value: Math.round(
        bodyweight * targetRatios[lift].recreational * ageFactor,
      ),
    },
  ];
}

export function exerciseColor(exercise: string) {
  if (exercise === "Squat") return "bg-sky-500";
  if (exercise === "Bench") return "bg-emerald-500";
  return "bg-orange-500";
}
