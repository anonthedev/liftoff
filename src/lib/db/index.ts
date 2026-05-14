import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { mkdirSync } from "node:fs";
import path from "node:path";

import * as schema from "./schema";

const dataDir = path.join(process.cwd(), "data");
mkdirSync(dataDir, { recursive: true });

const sqlite = new Database(path.join(dataDir, "lifting.db"));
sqlite.pragma("journal_mode = WAL");

sqlite.exec(`
  CREATE TABLE IF NOT EXISTS user (
    id TEXT PRIMARY KEY,
    name TEXT,
    email TEXT UNIQUE,
    emailVerified INTEGER,
    image TEXT
  );

  CREATE TABLE IF NOT EXISTS account (
    userId TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
    type TEXT NOT NULL,
    provider TEXT NOT NULL,
    providerAccountId TEXT NOT NULL,
    refresh_token TEXT,
    access_token TEXT,
    expires_at INTEGER,
    token_type TEXT,
    scope TEXT,
    id_token TEXT,
    session_state TEXT,
    PRIMARY KEY (provider, providerAccountId)
  );

  CREATE TABLE IF NOT EXISTS session (
    sessionToken TEXT PRIMARY KEY,
    userId TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
    expires INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS verificationToken (
    identifier TEXT NOT NULL,
    token TEXT NOT NULL,
    expires INTEGER NOT NULL,
    PRIMARY KEY (identifier, token)
  );

  CREATE TABLE IF NOT EXISTS workouts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT REFERENCES user(id) ON DELETE CASCADE,
    exercise TEXT NOT NULL,
    weight REAL NOT NULL,
    reps INTEGER NOT NULL,
    rpe REAL,
    estimated_1rm REAL NOT NULL,
    created_at INTEGER NOT NULL DEFAULT (unixepoch())
  );

  CREATE TABLE IF NOT EXISTS athlete_profiles (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT REFERENCES user(id) ON DELETE CASCADE,
    name TEXT NOT NULL DEFAULT 'Lifter',
    gender TEXT,
    age INTEGER,
    bodyweight REAL,
    experience TEXT,
    goal TEXT,
    squat_1rm REAL,
    bench_1rm REAL,
    deadlift_1rm REAL,
    exercise_order TEXT NOT NULL DEFAULT 'Squat,Bench,Deadlift',
    updated_at INTEGER NOT NULL DEFAULT (unixepoch())
  );

  CREATE TABLE IF NOT EXISTS powerlifting_benchmarks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    sex TEXT NOT NULL,
    age_min INTEGER NOT NULL,
    age_max INTEGER NOT NULL,
    bodyweight_min REAL NOT NULL,
    bodyweight_max REAL NOT NULL,
    exercise TEXT NOT NULL,
    p25 REAL NOT NULL,
    p50 REAL NOT NULL,
    p75 REAL NOT NULL,
    p90 REAL NOT NULL,
    sample_size INTEGER NOT NULL,
    source TEXT NOT NULL DEFAULT 'openpowerlifting-raw-sbd',
    updated_at INTEGER NOT NULL DEFAULT (unixepoch())
  );

  CREATE INDEX IF NOT EXISTS powerlifting_benchmarks_lookup_idx
    ON powerlifting_benchmarks (sex, age_min, age_max, bodyweight_min, bodyweight_max, exercise);
`);

function ensureColumn(table: string, column: string, ddl: string) {
  const columns = sqlite.prepare(`PRAGMA table_info(${table})`).all() as Array<{
    name: string;
  }>;

  if (!columns.some((item) => item.name === column)) {
    sqlite.exec(`ALTER TABLE ${table} ADD COLUMN ${ddl}`);
  }
}

const profileColumns = sqlite
  .prepare("PRAGMA table_info(athlete_profiles)")
  .all() as Array<{ name: string }>;

if (!profileColumns.some((column) => column.name === "exercise_order")) {
  sqlite.exec(
    "ALTER TABLE athlete_profiles ADD COLUMN exercise_order TEXT NOT NULL DEFAULT 'Squat,Bench,Deadlift'",
  );
}

ensureColumn(
  "athlete_profiles",
  "user_id",
  "user_id TEXT REFERENCES user(id) ON DELETE CASCADE",
);
ensureColumn(
  "workouts",
  "user_id",
  "user_id TEXT REFERENCES user(id) ON DELETE CASCADE",
);

sqlite.exec(`
  CREATE INDEX IF NOT EXISTS workouts_user_created_at_idx
    ON workouts (user_id, created_at);

  CREATE UNIQUE INDEX IF NOT EXISTS athlete_profiles_user_id_idx
    ON athlete_profiles (user_id);
`);

export const db = drizzle(sqlite, { schema });
