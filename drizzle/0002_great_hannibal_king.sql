CREATE TABLE `powerlifting_benchmarks` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`sex` text NOT NULL,
	`age_min` integer NOT NULL,
	`age_max` integer NOT NULL,
	`bodyweight_min` real NOT NULL,
	`bodyweight_max` real NOT NULL,
	`exercise` text NOT NULL,
	`p25` real NOT NULL,
	`p50` real NOT NULL,
	`p75` real NOT NULL,
	`p90` real NOT NULL,
	`sample_size` integer NOT NULL,
	`source` text DEFAULT 'openpowerlifting-raw-sbd' NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL
);
