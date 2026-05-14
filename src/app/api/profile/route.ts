import { asc, eq, sql } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";

import { authOptions } from "@/auth";
import { db } from "@/lib/db";
import { athleteProfiles } from "@/lib/db/schema";
import { serializeProfile } from "@/lib/workouts";

export const runtime = "nodejs";

type ProfilePayload = {
  name?: string;
  gender?: string;
  age?: number | null;
  bodyweight?: number | null;
  experience?: string;
  goal?: string;
  squat1rm?: number | null;
  bench1rm?: number | null;
  deadlift1rm?: number | null;
  exerciseOrder?: string;
};

function numberOrNull(value: unknown) {
  if (value === "" || value === null || value === undefined) return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function normalizePayload(payload: ProfilePayload) {
  return {
    name: payload.name?.trim() || "Lifter",
    gender: payload.gender?.trim() || null,
    age: numberOrNull(payload.age),
    bodyweight: numberOrNull(payload.bodyweight),
    experience: payload.experience?.trim() || null,
    goal: payload.goal?.trim() || null,
    squat1rm: numberOrNull(payload.squat1rm),
    bench1rm: numberOrNull(payload.bench1rm),
    deadlift1rm: numberOrNull(payload.deadlift1rm),
    exerciseOrder: payload.exerciseOrder ?? "Squat,Bench,Deadlift",
    updatedAt: sql`unixepoch()`,
  };
}

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Sign in to view your profile." }, { status: 401 });
  }

  const [profile] = await db
    .select()
    .from(athleteProfiles)
    .where(eq(athleteProfiles.userId, session.user.id))
    .orderBy(asc(athleteProfiles.id))
    .limit(1);

  return NextResponse.json(profile ? serializeProfile(profile) : null);
}

export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Sign in to save your profile." }, { status: 401 });
  }

  const payload = (await request.json()) as ProfilePayload;
  const values = {
    ...normalizePayload(payload),
    userId: session.user.id,
  };

  const [existing] = await db
    .select({ id: athleteProfiles.id })
    .from(athleteProfiles)
    .where(eq(athleteProfiles.userId, session.user.id))
    .orderBy(asc(athleteProfiles.id))
    .limit(1);

  const [profile] = existing
    ? await db
        .update(athleteProfiles)
        .set(values)
        .where(eq(athleteProfiles.id, existing.id))
        .returning()
    : await db.insert(athleteProfiles).values(values).returning();

  return NextResponse.json(serializeProfile(profile));
}
