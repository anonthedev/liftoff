import { and, asc, desc, eq, gte } from "drizzle-orm";
import { getServerSession } from "next-auth";

import { authOptions } from "@/auth";
import { SignInButton } from "@/components/auth-buttons";
import { LiftingLogger } from "@/components/lifting-logger";
import { db } from "@/lib/db";
import { athleteProfiles, workouts } from "@/lib/db/schema";
import { serializeProfile, serializeWorkout } from "@/lib/workouts";

export const dynamic = "force-dynamic";

export default async function Home() {
  const session = await getServerSession(authOptions);

  if (!session?.user?.id) {
    return (
      <main className="mx-auto grid min-h-screen w-full max-w-3xl place-items-center px-4">
        <section className="rounded-4xl border border-white/10 bg-white/6 p-8 text-center shadow-2xl backdrop-blur">
          <p className="text-xs font-semibold uppercase tracking-[0.3em] text-sky-300">
            Voice-to-SQL
          </p>
          <h1 className="mt-3 text-4xl font-black tracking-tight sm:text-6xl">
            Lifting Logger
          </h1>
          <p className="mx-auto mt-4 max-w-xl text-slate-300">
            Sign in with Google to keep your profile, workouts, and coaching
            notes separate from other lifters on this device.
          </p>
          <div className="mt-6">
            <SignInButton />
          </div>
        </section>
      </main>
    );
  }

  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);

  const [todayWorkouts, profileRows] = await Promise.all([
    db
      .select()
      .from(workouts)
      .where(
        and(
          eq(workouts.userId, session.user.id),
          gte(workouts.createdAt, startOfToday),
        ),
      )
      .orderBy(desc(workouts.createdAt)),
    db
      .select()
      .from(athleteProfiles)
      .where(eq(athleteProfiles.userId, session.user.id))
      .orderBy(asc(athleteProfiles.id))
      .limit(1),
  ]);

  return (
    <LiftingLogger
      initialProfile={
        profileRows[0] ? serializeProfile(profileRows[0]) : null
      }
      initialWorkouts={todayWorkouts.map(serializeWorkout)}
      userName={session.user.name ?? session.user.email ?? "Lifter"}
    />
  );
}
