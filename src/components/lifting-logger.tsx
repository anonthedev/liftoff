"use client";

import {
  Activity,
  ArrowDown,
  ArrowUp,
  Bot,
  Dumbbell,
  Loader2,
  Mic,
  Plus,
  Save,
  Sparkles,
  Trophy,
  UserRound,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

import type { SerializedPowerliftingBenchmark } from "@/lib/powerlifting-benchmarks";
import { getPowerliftingSummary } from "@/lib/powerlifting-benchmarks";
import { SignOutButton } from "@/components/auth-buttons";
import type {
  LiftName,
  SerializedAthleteProfile,
  SerializedWorkout,
} from "@/lib/workouts";
import {
  exerciseColor,
  getProfileLift,
  getStrengthBenchmarks,
  liftNames,
  parseExerciseOrder,
} from "@/lib/workouts";

type LiftingLoggerProps = {
  initialWorkouts: SerializedWorkout[];
  initialProfile: SerializedAthleteProfile | null;
  userName: string;
};

type ProfileDraft = {
  name: string;
  gender: string;
  age: string;
  bodyweight: string;
  experience: string;
  goal: string;
  squat1rm: string;
  bench1rm: string;
  deadlift1rm: string;
  exerciseOrder: string;
};

type ManualDraft = {
  exercise: LiftName;
  weight: string;
  reps: string;
  rpe: string;
};

function cx(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

function draftFromProfile(
  profile: SerializedAthleteProfile | null,
): ProfileDraft {
  return {
    name: profile?.name ?? "Lifter",
    gender: profile?.gender ?? "",
    age: profile?.age?.toString() ?? "",
    bodyweight: profile?.bodyweight?.toString() ?? "",
    experience: profile?.experience ?? "",
    goal: profile?.goal ?? "",
    squat1rm: profile?.squat1rm?.toString() ?? "",
    bench1rm: profile?.bench1rm?.toString() ?? "",
    deadlift1rm: profile?.deadlift1rm?.toString() ?? "",
    exerciseOrder: parseExerciseOrder(profile?.exerciseOrder).join(","),
  };
}

function parseError(error: unknown) {
  if (error instanceof Error) return error.message;
  return "Something went wrong.";
}

export function LiftingLogger({
  initialWorkouts,
  initialProfile,
  userName,
}: LiftingLoggerProps) {
  const [workouts, setWorkouts] = useState(initialWorkouts);
  const [profile, setProfile] = useState(initialProfile);
  const [profileDraft, setProfileDraft] = useState(() =>
    draftFromProfile(initialProfile),
  );
  const [exerciseOrder, setExerciseOrder] = useState<LiftName[]>(() =>
    parseExerciseOrder(initialProfile?.exerciseOrder),
  );
  const [manualDraft, setManualDraft] = useState<ManualDraft>({
    exercise: exerciseOrder[0],
    weight: "",
    reps: "",
    rpe: "",
  });
  const [isRecording, setIsRecording] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [isSavingManualSet, setIsSavingManualSet] = useState(false);
  const [isSavingProfile, setIsSavingProfile] = useState(false);
  const [isGeneratingAdvice, setIsGeneratingAdvice] = useState(false);
  const [lastTranscript, setLastTranscript] = useState("");
  const [error, setError] = useState("");
  const [advice, setAdvice] = useState<string[]>([]);
  const [powerliftingBenchmarks, setPowerliftingBenchmarks] = useState<
    SerializedPowerliftingBenchmark[]
  >([]);
  const [benchmarkMessage, setBenchmarkMessage] = useState("");
  const hasPowerliftingProfileFields = Boolean(
    profile?.gender && profile.age && profile.bodyweight,
  );
  const activePowerliftingBenchmarks = hasPowerliftingProfileFields
    ? powerliftingBenchmarks
    : [];
  const activeBenchmarkMessage = hasPowerliftingProfileFields
    ? benchmarkMessage
    : "Add gender, age, and bodyweight for OPL percentiles.";

  const chunksRef = useRef<Blob[]>([]);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const sessionStats = useMemo(() => {
    const bests = Object.fromEntries(liftNames.map((lift) => [lift, 0])) as Record<
      LiftName,
      number
    >;

    const volume = workouts.reduce((total, workout) => {
      if (workout.exercise in bests) {
        bests[workout.exercise as LiftName] = Math.max(
          bests[workout.exercise as LiftName],
          workout.estimated1rm,
        );
      }

      return total + workout.weight * workout.reps;
    }, 0);

    return { bests, volume };
  }, [workouts]);

  useEffect(() => {
    return () => {
      streamRef.current?.getTracks().forEach((track) => track.stop());
    };
  }, []);

  useEffect(() => {
    if (!profile?.gender || !profile.age || !profile.bodyweight) return;

    const params = new URLSearchParams({
      age: String(profile.age),
      bodyweight: String(profile.bodyweight),
      gender: profile.gender,
    });

    let cancelled = false;

    fetch(`/api/powerlifting-benchmarks?${params.toString()}`)
      .then((response) => response.json())
      .then((payload) => {
        if (cancelled) return;
        setPowerliftingBenchmarks(payload.benchmarks ?? []);
        setBenchmarkMessage(payload.message ?? "");
      })
      .catch(() => {
        if (!cancelled) {
          setPowerliftingBenchmarks([]);
          setBenchmarkMessage("Could not load OpenPowerlifting benchmarks.");
        }
      });

    return () => {
      cancelled = true;
    };
  }, [profile]);

  async function uploadAudio(blob: Blob) {
    setIsUploading(true);
    setError("");

    try {
      const formData = new FormData();
      formData.append("audio", blob, `workout-${Date.now()}.webm`);

      const response = await fetch("/api/log-workout", {
        method: "POST",
        body: formData,
      });

      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.error ?? "Could not log workout.");
      }

      setWorkouts((current) => [payload.workout, ...current]);
      setLastTranscript(payload.transcript);
    } catch (caught) {
      setError(parseError(caught));
    } finally {
      setIsUploading(false);
    }
  }

  async function startRecording() {
    if (isRecording || isUploading) return;

    try {
      setError("");
      setLastTranscript("");
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      chunksRef.current = [];

      const mimeType = MediaRecorder.isTypeSupported("audio/webm")
        ? "audio/webm"
        : "audio/mp4";
      const recorder = new MediaRecorder(stream, { mimeType });
      recorderRef.current = recorder;

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunksRef.current.push(event.data);
      };

      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: mimeType });
        stream.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
        void uploadAudio(blob);
      };

      recorder.start();
      setIsRecording(true);
    } catch (caught) {
      setError(
        caught instanceof DOMException
          ? "Microphone access is required to record a set."
          : parseError(caught),
      );
    }
  }

  function stopRecording() {
    if (!isRecording) return;
    setIsRecording(false);
    recorderRef.current?.stop();
  }

  function updateExerciseOrder(nextOrder: LiftName[]) {
    setExerciseOrder(nextOrder);
    setProfileDraft((current) => ({
      ...current,
      exerciseOrder: nextOrder.join(","),
    }));
  }

  function moveLift(lift: LiftName, direction: -1 | 1) {
    const currentIndex = exerciseOrder.indexOf(lift);
    const nextIndex = currentIndex + direction;
    if (nextIndex < 0 || nextIndex >= exerciseOrder.length) return;

    const nextOrder = [...exerciseOrder];
    [nextOrder[currentIndex], nextOrder[nextIndex]] = [
      nextOrder[nextIndex],
      nextOrder[currentIndex],
    ];
    updateExerciseOrder(nextOrder);
  }

  function moveWorkout(workoutId: number, direction: -1 | 1) {
    setWorkouts((current) => {
      const currentIndex = current.findIndex((workout) => workout.id === workoutId);
      const nextIndex = currentIndex + direction;
      if (currentIndex < 0 || nextIndex < 0 || nextIndex >= current.length) {
        return current;
      }

      const next = [...current];
      [next[currentIndex], next[nextIndex]] = [next[nextIndex], next[currentIndex]];
      return next;
    });
  }

  function sortWorkoutsByExercise() {
    const exerciseRank = new Map(
      exerciseOrder.map((exercise, index) => [exercise, index]),
    );

    setWorkouts((current) =>
      [...current].sort((a, b) => {
        const rankDiff =
          (exerciseRank.get(a.exercise as LiftName) ?? 99) -
          (exerciseRank.get(b.exercise as LiftName) ?? 99);

        if (rankDiff !== 0) return rankDiff;
        return (
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
        );
      }),
    );
  }

  async function saveManualSet() {
    setIsSavingManualSet(true);
    setError("");

    try {
      const response = await fetch("/api/workouts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(manualDraft),
      });

      const saved = await response.json();
      if (!response.ok) {
        throw new Error(saved.error ?? "Could not save manual set.");
      }

      setWorkouts((current) => [saved, ...current]);
      setManualDraft((current) => ({
        exercise: current.exercise,
        weight: "",
        reps: "",
        rpe: "",
      }));
    } catch (caught) {
      setError(parseError(caught));
    } finally {
      setIsSavingManualSet(false);
    }
  }

  async function saveProfile() {
    setIsSavingProfile(true);
    setError("");

    try {
      const response = await fetch("/api/profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(profileDraft),
      });

      const saved = await response.json();
      if (!response.ok) {
        throw new Error(saved.error ?? "Could not save profile.");
      }

      setProfile(saved);
      setProfileDraft(draftFromProfile(saved));
      updateExerciseOrder(parseExerciseOrder(saved.exerciseOrder));
    } catch (caught) {
      setError(parseError(caught));
    } finally {
      setIsSavingProfile(false);
    }
  }

  async function generateAdvice() {
    setIsGeneratingAdvice(true);
    setError("");

    try {
      const response = await fetch("/api/advice", { method: "POST" });
      const payload = await response.json();

      if (!response.ok) {
        throw new Error(payload.error ?? "Could not generate advice.");
      }

      setAdvice(payload.advice ?? []);
    } catch (caught) {
      setError(parseError(caught));
    } finally {
      setIsGeneratingAdvice(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-5xl flex-col gap-6 px-4 py-5 sm:px-6 lg:px-8">
      <header className="flex items-center justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.3em] text-sky-300">
            Voice-to-SQL
          </p>
          <h1 className="mt-2 text-3xl font-black tracking-tight sm:text-5xl">
            Lifting Logger
          </h1>
        </div>
        <div className="flex items-center gap-3">
          <div className="hidden text-right sm:block">
            <p className="text-xs uppercase tracking-[0.2em] text-slate-500">
              Signed in
            </p>
            <p className="text-sm font-bold text-slate-200">{userName}</p>
          </div>
          <SignOutButton />
          <div className="rounded-full border border-white/10 bg-white/10 p-3 shadow-2xl backdrop-blur">
            <Dumbbell className="h-6 w-6" />
          </div>
        </div>
      </header>

      <section className="rounded-4xl border border-white/10 bg-white/[0.07] p-5 shadow-2xl backdrop-blur">
        <button
          className={cx(
            "group flex h-72 w-full select-none flex-col items-center justify-center rounded-[1.75rem] border text-center shadow-2xl transition active:scale-[0.99]",
            isRecording
              ? "border-red-300/60 bg-red-500/25 shadow-red-500/20"
              : "border-sky-200/20 bg-sky-400/15 shadow-sky-500/10 hover:bg-sky-400/20",
          )}
          disabled={isUploading}
          onPointerCancel={stopRecording}
          onPointerDown={(event) => {
            event.preventDefault();
            void startRecording();
          }}
          onPointerLeave={stopRecording}
          onPointerUp={stopRecording}
        >
          <span
            className={cx(
              "mb-5 grid h-24 w-24 place-items-center rounded-full transition",
              isRecording
                ? "animate-pulse bg-red-400 text-red-950"
                : "bg-white text-slate-950 group-hover:scale-105",
            )}
          >
            {isUploading ? (
              <Loader2 className="h-10 w-10 animate-spin" />
            ) : (
              <Mic className="h-10 w-10" />
            )}
          </span>
          <span className="text-4xl font-black tracking-tight sm:text-6xl">
            {isRecording
              ? "Release to Log"
              : isUploading
                ? "Parsing Set"
                : "Hold to Record"}
          </span>
          <span className="mt-4 max-w-lg text-sm text-slate-300">
            Try: “Squat one hundred eighty kilos for five at RPE eight.”
          </span>
        </button>

        {(lastTranscript || error) && (
          <div className="mt-4 rounded-2xl border border-white/10 bg-black/20 p-4 text-sm">
            {lastTranscript && (
              <p className="text-slate-300">
                <span className="font-semibold text-white">Transcript:</span>{" "}
                {lastTranscript}
              </p>
            )}
            {error && <p className="text-red-300">{error}</p>}
          </div>
        )}
      </section>

      <section className="rounded-4xl border border-white/10 bg-white/6 p-5">
        <div className="mb-4 flex items-center justify-between gap-3">
          <div>
            <h2 className="text-xl font-black">Manual Log</h2>
            <p className="text-sm text-slate-400">
              Add sets directly when voice is awkward or noisy.
            </p>
          </div>
          <Plus className="h-5 w-5 text-emerald-300" />
        </div>

        <div className="grid gap-3 sm:grid-cols-[1fr_1fr_1fr_1fr_auto]">
          <label className="block">
            <span className="mb-1 block text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
              Exercise
            </span>
            <select
              className="w-full rounded-2xl border border-white/10 bg-black/25 px-3 py-3 text-sm text-white outline-none transition focus:border-sky-300/60"
              onChange={(event) =>
                setManualDraft((current) => ({
                  ...current,
                  exercise: event.target.value as LiftName,
                }))
              }
              value={manualDraft.exercise}
            >
              {exerciseOrder.map((lift) => (
                <option key={lift} value={lift}>
                  {lift}
                </option>
              ))}
            </select>
          </label>
          <Input
            label="Weight kg"
            type="number"
            value={manualDraft.weight}
            onChange={(value) =>
              setManualDraft((current) => ({ ...current, weight: value }))
            }
          />
          <Input
            label="Reps"
            type="number"
            value={manualDraft.reps}
            onChange={(value) =>
              setManualDraft((current) => ({ ...current, reps: value }))
            }
          />
          <Input
            label="RPE"
            type="number"
            value={manualDraft.rpe}
            onChange={(value) =>
              setManualDraft((current) => ({ ...current, rpe: value }))
            }
          />
          <button
            className="self-end rounded-2xl bg-emerald-300 px-5 py-3 font-bold text-emerald-950 transition hover:bg-emerald-200 disabled:cursor-not-allowed disabled:opacity-60"
            disabled={isSavingManualSet}
            onClick={saveManualSet}
          >
            {isSavingManualSet ? (
              <Loader2 className="mx-auto h-5 w-5 animate-spin" />
            ) : (
              "Log"
            )}
          </button>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-3">
        {exerciseOrder.map((lift, index) => {
          const profileValue = profile ? getProfileLift(profile, lift) : null;
          const benchmarks = getStrengthBenchmarks(profile, lift);
          const powerliftingSummary = getPowerliftingSummary(
            activePowerliftingBenchmarks,
            lift,
            profileValue,
          );

          return (
            <div
              className="rounded-3xl border border-white/10 bg-white/6 p-5"
              key={lift}
            >
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold text-slate-300">{lift}</p>
                <div className="flex items-center gap-1">
                  <button
                    aria-label={`Move ${lift} earlier`}
                    className="rounded-full border border-white/10 p-1 text-slate-300 transition hover:bg-white/10 disabled:opacity-30"
                    disabled={index === 0}
                    onClick={() => moveLift(lift, -1)}
                  >
                    <ArrowUp className="h-3 w-3" />
                  </button>
                  <button
                    aria-label={`Move ${lift} later`}
                    className="rounded-full border border-white/10 p-1 text-slate-300 transition hover:bg-white/10 disabled:opacity-30"
                    disabled={index === exerciseOrder.length - 1}
                    onClick={() => moveLift(lift, 1)}
                  >
                    <ArrowDown className="h-3 w-3" />
                  </button>
                  <span
                    className={cx("ml-2 h-3 w-3 rounded-full", exerciseColor(lift))}
                  />
                </div>
              </div>
              <p className="mt-3 text-4xl font-black">
                {profileValue ? `${profileValue}kg` : "--"}
              </p>
              {powerliftingSummary ? (
                <p className="mt-1 text-sm text-emerald-200">
                  Top {100 - powerliftingSummary.percentile}% among matching raw
                  SBD OpenPowerlifting results
                </p>
              ) : (
                <p className="mt-1 text-sm text-slate-500">
                  {activeBenchmarkMessage ||
                    "Import OPL data for powerlifting percentiles."}
                </p>
              )}
              <p className="mt-1 text-sm text-slate-400">
                Today best e1RM:{" "}
                <span className="text-white">
                  {sessionStats.bests[lift]
                    ? `${sessionStats.bests[lift].toFixed(1)}kg`
                    : "none"}
                </span>
              </p>
              {profile && (
                <div className="mt-4 space-y-2">
                  {benchmarks.map((benchmark) => {
                    const diff = profileValue
                      ? Math.round(profileValue - benchmark.value)
                      : null;

                    return (
                      <div
                        className="flex items-center justify-between rounded-2xl bg-black/20 px-3 py-2 text-xs"
                        key={benchmark.label}
                      >
                        <span className="text-slate-300">{benchmark.label}</span>
                        <span className="font-bold text-white">
                          {benchmark.value}kg
                          {diff !== null
                            ? ` · ${diff >= 0 ? "+" : ""}${diff}kg`
                            : ""}
                        </span>
                      </div>
                    );
                  })}
                  {powerliftingSummary && (
                    <div className="rounded-2xl border border-emerald-300/20 bg-emerald-300/10 px-3 py-2 text-xs">
                      <div className="flex items-center justify-between">
                        <span className="text-emerald-100">
                          OPL raw SBD percentile
                        </span>
                        <span className="font-bold text-white">
                          P{powerliftingSummary.percentile}
                        </span>
                      </div>
                      <p className="mt-1 text-slate-300">
                        P50 {powerliftingSummary.benchmark.p50}kg · P75{" "}
                        {powerliftingSummary.benchmark.p75}kg · P90{" "}
                        {powerliftingSummary.benchmark.p90}kg · n=
                        {powerliftingSummary.benchmark.sampleSize}
                      </p>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </section>

      <section className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
        <div className="rounded-4xl border border-white/10 bg-white/6 p-5">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h2 className="text-xl font-black">Today’s Sets</h2>
              <p className="text-sm text-slate-400">
                {workouts.length} sets · {Math.round(sessionStats.volume)}kg
                volume
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                className="rounded-full border border-white/10 px-3 py-2 text-xs font-bold text-slate-200 transition hover:bg-white/10"
                onClick={() =>
                  setWorkouts((current) =>
                    [...current].sort(
                      (a, b) =>
                        new Date(b.createdAt).getTime() -
                        new Date(a.createdAt).getTime(),
                    ),
                  )
                }
              >
                Latest
              </button>
              <button
                className="rounded-full border border-white/10 px-3 py-2 text-xs font-bold text-slate-200 transition hover:bg-white/10"
                onClick={sortWorkoutsByExercise}
              >
                Exercise
              </button>
              <Activity className="h-5 w-5 text-sky-300" />
            </div>
          </div>

          <div className="space-y-3">
            {workouts.length === 0 ? (
              <div className="rounded-3xl border border-dashed border-white/15 p-8 text-center text-slate-400">
                No sets logged today. Hold the record button to add your first
                set.
              </div>
            ) : (
              workouts.map((workout, index) => (
                <article
                  className="flex items-center justify-between gap-4 rounded-3xl border border-white/10 bg-black/20 p-4"
                  key={workout.id}
                >
                  <div className="flex items-center gap-3">
                    <div className="flex flex-col gap-1">
                      <button
                        aria-label={`Move ${workout.exercise} set earlier`}
                        className="rounded-full border border-white/10 p-1 text-slate-300 transition hover:bg-white/10 disabled:opacity-30"
                        disabled={index === 0}
                        onClick={() => moveWorkout(workout.id, -1)}
                      >
                        <ArrowUp className="h-3 w-3" />
                      </button>
                      <button
                        aria-label={`Move ${workout.exercise} set later`}
                        className="rounded-full border border-white/10 p-1 text-slate-300 transition hover:bg-white/10 disabled:opacity-30"
                        disabled={index === workouts.length - 1}
                        onClick={() => moveWorkout(workout.id, 1)}
                      >
                        <ArrowDown className="h-3 w-3" />
                      </button>
                    </div>
                    <span
                      className={cx(
                        "h-12 w-2 rounded-full",
                        exerciseColor(workout.exercise),
                      )}
                    />
                    <div>
                      <h3 className="font-bold">{workout.exercise}</h3>
                      <p className="text-sm text-slate-400">
                        {new Date(workout.createdAt).toLocaleTimeString([], {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                        {workout.rpe ? ` · RPE ${workout.rpe}` : ""}
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-xl font-black">
                      {workout.weight} × {workout.reps}
                    </p>
                    <p className="text-sm text-sky-200">
                      e1RM {workout.estimated1rm.toFixed(1)}kg
                    </p>
                  </div>
                </article>
              ))
            )}
          </div>
        </div>

        <aside className="space-y-6">
          <div className="rounded-4xl border border-white/10 bg-white/6 p-5">
            <div className="mb-4 flex items-center gap-2">
              <UserRound className="h-5 w-5 text-sky-300" />
              <h2 className="text-xl font-black">Lifter Profile</h2>
            </div>

            <div className="grid gap-3">
              <Input
                label="Name"
                value={profileDraft.name}
                onChange={(value) =>
                  setProfileDraft((current) => ({ ...current, name: value }))
                }
              />
              <div className="grid grid-cols-2 gap-3">
                <Input
                  label="Gender"
                  value={profileDraft.gender}
                  onChange={(value) =>
                    setProfileDraft((current) => ({
                      ...current,
                      gender: value,
                    }))
                  }
                />
                <Input
                  label="Age"
                  type="number"
                  value={profileDraft.age}
                  onChange={(value) =>
                    setProfileDraft((current) => ({ ...current, age: value }))
                  }
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Input
                  label="Bodyweight kg"
                  type="number"
                  value={profileDraft.bodyweight}
                  onChange={(value) =>
                    setProfileDraft((current) => ({
                      ...current,
                      bodyweight: value,
                    }))
                  }
                />
                <Input
                  label="Experience"
                  value={profileDraft.experience}
                  onChange={(value) =>
                    setProfileDraft((current) => ({
                      ...current,
                      experience: value,
                    }))
                  }
                />
              </div>
              <Input
                label="Goal"
                value={profileDraft.goal}
                onChange={(value) =>
                  setProfileDraft((current) => ({ ...current, goal: value }))
                }
              />
              <div className="grid grid-cols-3 gap-3">
                <Input
                  label="Squat 1RM"
                  type="number"
                  value={profileDraft.squat1rm}
                  onChange={(value) =>
                    setProfileDraft((current) => ({
                      ...current,
                      squat1rm: value,
                    }))
                  }
                />
                <Input
                  label="Bench 1RM"
                  type="number"
                  value={profileDraft.bench1rm}
                  onChange={(value) =>
                    setProfileDraft((current) => ({
                      ...current,
                      bench1rm: value,
                    }))
                  }
                />
                <Input
                  label="Deadlift 1RM"
                  type="number"
                  value={profileDraft.deadlift1rm}
                  onChange={(value) =>
                    setProfileDraft((current) => ({
                      ...current,
                      deadlift1rm: value,
                    }))
                  }
                />
              </div>
            </div>

            <button
              className="mt-4 flex w-full items-center justify-center gap-2 rounded-2xl bg-white px-4 py-3 font-bold text-slate-950 transition hover:bg-sky-100"
              disabled={isSavingProfile}
              onClick={saveProfile}
            >
              {isSavingProfile ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Save className="h-4 w-4" />
              )}
              Save Profile
            </button>
          </div>

          <div className="rounded-4xl border border-white/10 bg-white/6 p-5">
            <div className="flex items-center justify-between gap-4">
              <div>
                <div className="flex items-center gap-2">
                  <Bot className="h-5 w-5 text-orange-300" />
                  <h2 className="text-xl font-black">Coach Notes</h2>
                </div>
                <p className="mt-1 text-sm text-slate-400">
                  Based on profile and recent logged sets.
                </p>
              </div>
              <Trophy className="h-5 w-5 text-yellow-300" />
            </div>

            <button
              className="mt-4 flex w-full items-center justify-center gap-2 rounded-2xl border border-white/10 bg-black/30 px-4 py-3 font-bold transition hover:bg-black/40"
              disabled={isGeneratingAdvice}
              onClick={generateAdvice}
            >
              {isGeneratingAdvice ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Sparkles className="h-4 w-4" />
              )}
              Generate Advice
            </button>

            <div className="mt-4 space-y-3">
              {advice.length === 0 ? (
                <p className="rounded-2xl bg-black/20 p-4 text-sm text-slate-400">
                  Save your profile, log a few sets, then generate advice.
                </p>
              ) : (
                advice.map((item) => (
                  <p
                    className="rounded-2xl bg-black/20 p-4 text-sm text-slate-200"
                    key={item}
                  >
                    {item}
                  </p>
                ))
              )}
            </div>
          </div>
        </aside>
      </section>
    </main>
  );
}

function Input({
  label,
  value,
  onChange,
  type = "text",
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: "text" | "number";
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
        {label}
      </span>
      <input
        className="w-full rounded-2xl border border-white/10 bg-black/25 px-3 py-3 text-sm text-white outline-none transition placeholder:text-slate-600 focus:border-sky-300/60"
        inputMode={type === "number" ? "decimal" : undefined}
        min={type === "number" ? 0 : undefined}
        onChange={(event) => onChange(event.target.value)}
        type={type}
        value={value}
      />
    </label>
  );
}
