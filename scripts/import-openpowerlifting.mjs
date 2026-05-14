import Database from "better-sqlite3";
import { spawnSync, spawn } from "node:child_process";
import { createWriteStream, existsSync, mkdirSync } from "node:fs";
import { open } from "node:fs/promises";
import path from "node:path";
import readline from "node:readline";
import { Readable } from "node:stream";

const OPL_URL =
  process.env.OPL_ZIP_URL ??
  "https://openpowerlifting.gitlab.io/opl-csv/files/openpowerlifting-latest.zip";
const DATA_DIR = path.join(process.cwd(), "data");
const ZIP_PATH = path.join(DATA_DIR, "openpowerlifting-latest.zip");
const DB_PATH = path.join(DATA_DIR, "lifting.db");
const SOURCE = "openpowerlifting-raw-sbd";

const ageBuckets = [
  [14, 18],
  [19, 23],
  [24, 34],
  [35, 39],
  [40, 44],
  [45, 49],
  [50, 54],
  [55, 59],
  [60, 69],
  [70, 99],
];

const bodyweightBuckets = {
  F: [
    [0, 47],
    [47.01, 52],
    [52.01, 57],
    [57.01, 63],
    [63.01, 69],
    [69.01, 76],
    [76.01, 84],
    [84.01, 999],
  ],
  M: [
    [0, 59],
    [59.01, 66],
    [66.01, 74],
    [74.01, 83],
    [83.01, 93],
    [93.01, 105],
    [105.01, 120],
    [120.01, 999],
  ],
};

const liftColumns = {
  Squat: "Best3SquatKg",
  Bench: "Best3BenchKg",
  Deadlift: "Best3DeadliftKg",
};

mkdirSync(DATA_DIR, { recursive: true });

if (!existsSync(ZIP_PATH)) {
  console.log(`Downloading OpenPowerlifting data from ${OPL_URL}`);
  const response = await fetch(OPL_URL);
  if (!response.ok || !response.body) {
    throw new Error(`Failed to download OpenPowerlifting data: ${response.status}`);
  }

  await new Promise((resolve, reject) => {
    Readable.fromWeb(response.body)
      .pipe(createWriteStream(ZIP_PATH))
      .on("finish", resolve)
      .on("error", reject);
  });
} else {
  console.log(`Using existing ${ZIP_PATH}`);
}

const zipListing = spawnSync("unzip", ["-Z1", ZIP_PATH], { encoding: "utf8" });
if (zipListing.status !== 0) {
  throw new Error("The `unzip` command is required to read the OPL zip file.");
}

const csvName =
  zipListing.stdout
    .split("\n")
    .find((entry) => entry.endsWith(".csv") && entry.includes("openpowerlifting")) ??
  zipListing.stdout.split("\n").find((entry) => entry.endsWith(".csv"));

if (!csvName) {
  throw new Error("Could not find an OpenPowerlifting CSV inside the zip file.");
}

const unzip = spawn("unzip", ["-p", ZIP_PATH, csvName], {
  stdio: ["ignore", "pipe", "inherit"],
});

const buckets = new Map();
let header = null;
let processedRows = 0;
let acceptedRows = 0;

function parseCsvLine(line) {
  const values = [];
  let current = "";
  let quoted = false;

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    const next = line[index + 1];

    if (char === '"' && quoted && next === '"') {
      current += '"';
      index += 1;
    } else if (char === '"') {
      quoted = !quoted;
    } else if (char === "," && !quoted) {
      values.push(current);
      current = "";
    } else {
      current += char;
    }
  }

  values.push(current);
  return values;
}

function toNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function findBucket(value, ranges) {
  return ranges.find(([min, max]) => value >= min && value <= max) ?? null;
}

function percentile(sortedValues, percentileValue) {
  if (sortedValues.length === 0) return null;
  const position = (sortedValues.length - 1) * percentileValue;
  const lowerIndex = Math.floor(position);
  const upperIndex = Math.ceil(position);

  if (lowerIndex === upperIndex) return sortedValues[lowerIndex];

  const progress = position - lowerIndex;
  return (
    sortedValues[lowerIndex] +
    (sortedValues[upperIndex] - sortedValues[lowerIndex]) * progress
  );
}

function get(row, column) {
  return row[header[column]];
}

const rl = readline.createInterface({
  crlfDelay: Infinity,
  input: unzip.stdout,
});

for await (const line of rl) {
  if (!header) {
    header = Object.fromEntries(
      parseCsvLine(line).map((column, index) => [column, index]),
    );
    continue;
  }

  processedRows += 1;
  const row = parseCsvLine(line);
  const sex = get(row, "Sex");
  const age = toNumber(get(row, "Age"));
  const bodyweight = toNumber(get(row, "BodyweightKg"));
  const equipment = get(row, "Equipment");
  const event = get(row, "Event");

  if (
    (sex !== "M" && sex !== "F") ||
    equipment !== "Raw" ||
    event !== "SBD" ||
    !age ||
    !bodyweight
  ) {
    continue;
  }

  const ageBucket = findBucket(age, ageBuckets);
  const bodyweightBucket = findBucket(bodyweight, bodyweightBuckets[sex]);
  if (!ageBucket || !bodyweightBucket) continue;

  let acceptedLift = false;
  for (const [exercise, column] of Object.entries(liftColumns)) {
    const liftKg = toNumber(get(row, column));
    if (!liftKg || liftKg <= 0) continue;

    const key = [
      sex,
      ageBucket[0],
      ageBucket[1],
      bodyweightBucket[0],
      bodyweightBucket[1],
      exercise,
    ].join("|");

    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key).push(liftKg);
    acceptedLift = true;
  }

  if (acceptedLift) acceptedRows += 1;

  if (processedRows % 250000 === 0) {
    console.log(`Processed ${processedRows.toLocaleString()} rows...`);
  }
}

await new Promise((resolve, reject) => {
  unzip.on("close", (code) => {
    if (code === 0) resolve();
    else reject(new Error(`unzip exited with code ${code}`));
  });
});

const db = new Database(DB_PATH);
db.pragma("journal_mode = WAL");
db.exec(`
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
    source TEXT NOT NULL DEFAULT '${SOURCE}',
    updated_at INTEGER NOT NULL DEFAULT (unixepoch())
  );
`);

const insert = db.prepare(`
  INSERT INTO powerlifting_benchmarks (
    sex, age_min, age_max, bodyweight_min, bodyweight_max, exercise,
    p25, p50, p75, p90, sample_size, source, updated_at
  )
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, unixepoch())
`);

const transaction = db.transaction(() => {
  db.prepare("DELETE FROM powerlifting_benchmarks WHERE source = ?").run(SOURCE);

  for (const [key, values] of buckets.entries()) {
    if (values.length < 20) continue;

    values.sort((a, b) => a - b);
    const [sex, ageMin, ageMax, bodyweightMin, bodyweightMax, exercise] =
      key.split("|");

    insert.run(
      sex,
      Number(ageMin),
      Number(ageMax),
      Number(bodyweightMin),
      Number(bodyweightMax),
      exercise,
      Math.round(percentile(values, 0.25)),
      Math.round(percentile(values, 0.5)),
      Math.round(percentile(values, 0.75)),
      Math.round(percentile(values, 0.9)),
      values.length,
      SOURCE,
    );
  }
});

transaction();

const inserted = db
  .prepare("SELECT count(*) AS count FROM powerlifting_benchmarks WHERE source = ?")
  .get(SOURCE);

await open(path.join(DATA_DIR, "OPENPOWERLIFTING_SOURCE.txt"), "w").then((file) =>
  file.writeFile(
    [
      "OpenPowerlifting raw SBD benchmark import",
      `Source URL: ${OPL_URL}`,
      "OpenPowerlifting data is public domain.",
      "Generated buckets: sex, age range, bodyweight class, lift percentiles.",
      "",
    ].join("\n"),
  ),
);

console.log(
  `Imported ${inserted.count} benchmark rows from ${acceptedRows.toLocaleString()} raw SBD meet results.`,
);
