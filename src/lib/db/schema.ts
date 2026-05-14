import { sql } from "drizzle-orm";
import { integer, primaryKey, real, sqliteTable, text } from "drizzle-orm/sqlite-core";
import type { AdapterAccount } from "next-auth/adapters";

export const users = sqliteTable("user", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  name: text("name"),
  email: text("email").unique(),
  emailVerified: integer("emailVerified", { mode: "timestamp_ms" }),
  image: text("image"),
});

export const accounts = sqliteTable(
  "account",
  {
    userId: text("userId")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    type: text("type").$type<AdapterAccount["type"]>().notNull(),
    provider: text("provider").notNull(),
    providerAccountId: text("providerAccountId").notNull(),
    refresh_token: text("refresh_token"),
    access_token: text("access_token"),
    expires_at: integer("expires_at"),
    token_type: text("token_type"),
    scope: text("scope"),
    id_token: text("id_token"),
    session_state: text("session_state"),
  },
  (account) => [
    primaryKey({
      columns: [account.provider, account.providerAccountId],
    }),
  ],
);

export const sessions = sqliteTable("session", {
  sessionToken: text("sessionToken").primaryKey(),
  userId: text("userId")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  expires: integer("expires", { mode: "timestamp_ms" }).notNull(),
});

export const verificationTokens = sqliteTable(
  "verificationToken",
  {
    identifier: text("identifier").notNull(),
    token: text("token").notNull(),
    expires: integer("expires", { mode: "timestamp_ms" }).notNull(),
  },
  (verificationToken) => [
    primaryKey({
      columns: [verificationToken.identifier, verificationToken.token],
    }),
  ],
);

export const workouts = sqliteTable("workouts", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: text("user_id").references(() => users.id, { onDelete: "cascade" }),
  exercise: text("exercise", { enum: ["Squat", "Bench", "Deadlift"] }).notNull(),
  weight: real("weight").notNull(),
  reps: integer("reps").notNull(),
  rpe: real("rpe"),
  estimated1rm: real("estimated_1rm").notNull(),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .default(sql`(unixepoch())`),
});

export const athleteProfiles = sqliteTable("athlete_profiles", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: text("user_id").references(() => users.id, { onDelete: "cascade" }),
  name: text("name").notNull().default("Lifter"),
  gender: text("gender"),
  age: integer("age"),
  bodyweight: real("bodyweight"),
  experience: text("experience"),
  goal: text("goal"),
  squat1rm: real("squat_1rm"),
  bench1rm: real("bench_1rm"),
  deadlift1rm: real("deadlift_1rm"),
  exerciseOrder: text("exercise_order").notNull().default("Squat,Bench,Deadlift"),
  updatedAt: integer("updated_at", { mode: "timestamp" })
    .notNull()
    .default(sql`(unixepoch())`),
});

export const powerliftingBenchmarks = sqliteTable("powerlifting_benchmarks", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  sex: text("sex", { enum: ["M", "F"] }).notNull(),
  ageMin: integer("age_min").notNull(),
  ageMax: integer("age_max").notNull(),
  bodyweightMin: real("bodyweight_min").notNull(),
  bodyweightMax: real("bodyweight_max").notNull(),
  exercise: text("exercise", { enum: ["Squat", "Bench", "Deadlift"] }).notNull(),
  p25: real("p25").notNull(),
  p50: real("p50").notNull(),
  p75: real("p75").notNull(),
  p90: real("p90").notNull(),
  sampleSize: integer("sample_size").notNull(),
  source: text("source").notNull().default("openpowerlifting-raw-sbd"),
  updatedAt: integer("updated_at", { mode: "timestamp" })
    .notNull()
    .default(sql`(unixepoch())`),
});

export type Workout = typeof workouts.$inferSelect;
export type NewWorkout = typeof workouts.$inferInsert;
export type AthleteProfile = typeof athleteProfiles.$inferSelect;
export type PowerliftingBenchmark = typeof powerliftingBenchmarks.$inferSelect;
