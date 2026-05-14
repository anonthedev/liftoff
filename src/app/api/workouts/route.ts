import { and, desc, eq, gte } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";

import { authOptions } from "@/auth";
import { db } from "@/lib/db";
import { workouts } from "@/lib/db/schema";
import { calculateEstimated1rm, serializeWorkout } from "@/lib/workouts";

export const runtime = "nodejs";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Sign in to view workouts." }, { status: 401 });
  }

  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);

  const rows = await db
    .select()
    .from(workouts)
    .where(
      and(
        eq(workouts.userId, session.user.id),
        gte(workouts.createdAt, startOfToday),
      ),
    )
    .orderBy(desc(workouts.createdAt));

  return NextResponse.json(rows.map(serializeWorkout));
}

export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Sign in to log workouts." }, { status: 401 });
  }

  const payload = (await request.json()) as {
    exercise?: string;
    weight?: number | string;
    reps?: number | string;
    rpe?: number | string | null;
  };

  const exercise =
    payload.exercise === "Squat" ||
    payload.exercise === "Bench" ||
    payload.exercise === "Deadlift"
      ? payload.exercise
      : null;
  const weight = Number(payload.weight);
  const reps = Number(payload.reps);
  const rpe =
    payload.rpe === "" || payload.rpe === undefined || payload.rpe === null
      ? null
      : Number(payload.rpe);

  if (!exercise || !Number.isFinite(weight) || weight <= 0) {
    return NextResponse.json(
      { error: "Choose an exercise and enter a valid weight." },
      { status: 400 },
    );
  }

  if (!Number.isInteger(reps) || reps <= 0) {
    return NextResponse.json(
      { error: "Enter a valid whole-number rep count." },
      { status: 400 },
    );
  }

  if (rpe !== null && (!Number.isFinite(rpe) || rpe < 1 || rpe > 10)) {
    return NextResponse.json(
      { error: "RPE must be between 1 and 10." },
      { status: 400 },
    );
  }

  const [saved] = await db
    .insert(workouts)
    .values({
      exercise,
      weight,
      reps,
      rpe,
      estimated1rm: calculateEstimated1rm(weight, reps),
      userId: session.user.id,
    })
    .returning();

  return NextResponse.json(serializeWorkout(saved));
}
