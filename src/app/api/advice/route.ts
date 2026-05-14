import { asc, desc, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";

import { authOptions } from "@/auth";
import { db } from "@/lib/db";
import { athleteProfiles, workouts } from "@/lib/db/schema";
import { getOpenAIClient } from "@/lib/openai";

export const runtime = "nodejs";

function fallbackAdvice() {
  return [
    "Log at least one set for each competition lift before making big programming changes.",
    "Keep top sets near RPE 7-9, then use back-off work to build volume without grinding.",
    "If estimated 1RM drops for two sessions in a row, reduce load by 5-10% and prioritize recovery.",
  ];
}

export async function POST() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Sign in to generate advice." }, { status: 401 });
  }

  const recentWorkouts = await db
    .select()
    .from(workouts)
    .where(eq(workouts.userId, session.user.id))
    .orderBy(desc(workouts.createdAt))
    .limit(25);

  const [profile] = await db
    .select()
    .from(athleteProfiles)
    .where(eq(athleteProfiles.userId, session.user.id))
    .orderBy(asc(athleteProfiles.id))
    .limit(1);

  if (!process.env.OPENAI_API_KEY) {
    return NextResponse.json({
      advice: fallbackAdvice(),
      note: "Set OPENAI_API_KEY to generate personalized coaching advice.",
    });
  }

  const openai = getOpenAIClient();
  const response = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    response_format: { type: "json_object" },
    temperature: 0.4,
    messages: [
      {
        role: "system",
        content:
          "You are a concise powerlifting coach. Return ONLY JSON shaped as {\"advice\":[\"...\",\"...\",\"...\"]}. Give 3 practical recommendations based on the lifter profile and logged sets.",
      },
      {
        role: "user",
        content: JSON.stringify({
          profile,
          recentWorkouts,
        }),
      },
    ],
  });

  const content = response.choices[0]?.message.content;
  if (!content) {
    return NextResponse.json({ advice: fallbackAdvice() });
  }

  try {
    const parsed = JSON.parse(content) as { advice?: string[] };
    return NextResponse.json({
      advice:
        Array.isArray(parsed.advice) && parsed.advice.length > 0
          ? parsed.advice.slice(0, 3)
          : fallbackAdvice(),
    });
  } catch {
    return NextResponse.json({ advice: fallbackAdvice() });
  }
}
