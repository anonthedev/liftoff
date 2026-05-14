import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";

import { authOptions } from "@/auth";
import { db } from "@/lib/db";
import { workouts } from "@/lib/db/schema";
import { getOpenAIClient } from "@/lib/openai";
import { calculateEstimated1rm, serializeWorkout } from "@/lib/workouts";

export const runtime = "nodejs";

type ParsedWorkout = {
  exercise: "Squat" | "Bench" | "Deadlift";
  weight: number;
  reps: number;
  rpe?: number | null;
};

const SYSTEM_PROMPT =
  "You are a powerlifting data parser. The user will provide a spoken workout log. Extract the exercise name (normalize to Squat, Bench, or Deadlift), the weight in kg, the number of reps, and the RPE. Return ONLY valid JSON.";

function normalizeParsedWorkout(value: unknown): ParsedWorkout {
  if (!value || typeof value !== "object") {
    throw new Error("Parser returned an empty result.");
  }

  const parsed = value as Partial<ParsedWorkout>;
  const exercise =
    typeof parsed.exercise === "string"
      ? parsed.exercise.toLowerCase()
      : undefined;

  const normalizedExercise =
    exercise?.includes("squat")
      ? "Squat"
      : exercise?.includes("bench")
        ? "Bench"
        : exercise?.includes("dead")
          ? "Deadlift"
          : undefined;

  const weight = Number(parsed.weight);
  const reps = Number(parsed.reps);
  const rpe =
    parsed.rpe === undefined || parsed.rpe === null || parsed.rpe === 0
      ? null
      : Number(parsed.rpe);

  if (!normalizedExercise || !Number.isFinite(weight) || weight <= 0) {
    throw new Error("Could not extract a valid exercise and weight.");
  }

  if (!Number.isInteger(reps) || reps <= 0) {
    throw new Error("Could not extract a valid rep count.");
  }

  if (rpe !== null && (!Number.isFinite(rpe) || rpe < 1 || rpe > 10)) {
    throw new Error("RPE must be between 1 and 10.");
  }

  return {
    exercise: normalizedExercise,
    weight,
    reps,
    rpe,
  };
}

export async function POST(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Sign in to log workouts." }, { status: 401 });
    }

    const formData = await request.formData();
    const audio = formData.get("audio");

    if (!(audio instanceof File)) {
      return NextResponse.json(
        { error: "Upload an audio file as the 'audio' form field." },
        { status: 400 },
      );
    }

    const openai = getOpenAIClient();
    const transcript = await openai.audio.transcriptions.create({
      file: audio,
      model: "whisper-1",
    });

    const text = transcript.text?.trim();
    if (!text) {
      return NextResponse.json(
        { error: "Whisper did not return a transcript." },
        { status: 422 },
      );
    }

    const extraction = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        {
          role: "user",
          content: `Transcript: ${text}\nReturn JSON with keys: exercise, weight, reps, rpe.`,
        },
      ],
      temperature: 0,
    });

    const rawJson = extraction.choices[0]?.message.content;
    if (!rawJson) {
      return NextResponse.json(
        { error: "Workout parser did not return JSON." },
        { status: 422 },
      );
    }

    const parsedWorkout = normalizeParsedWorkout(JSON.parse(rawJson));
    const estimated1rm = calculateEstimated1rm(
      parsedWorkout.weight,
      parsedWorkout.reps,
    );

    const [saved] = await db
      .insert(workouts)
      .values({
        exercise: parsedWorkout.exercise,
        weight: parsedWorkout.weight,
        reps: parsedWorkout.reps,
        rpe: parsedWorkout.rpe,
        estimated1rm,
        userId: session.user.id,
      })
      .returning();

    return NextResponse.json({
      transcript: text,
      workout: serializeWorkout(saved),
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to log workout.";

    return NextResponse.json({ error: message }, { status: 500 });
  }
}
