CREATE TABLE `athlete_profiles` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text DEFAULT 'Lifter' NOT NULL,
	`gender` text,
	`age` integer,
	`bodyweight` real,
	`experience` text,
	`goal` text,
	`squat_1rm` real,
	`bench_1rm` real,
	`deadlift_1rm` real,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `workouts` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`exercise` text NOT NULL,
	`weight` real NOT NULL,
	`reps` integer NOT NULL,
	`rpe` real,
	`estimated_1rm` real NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL
);
