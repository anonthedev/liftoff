import { and, eq, gte, lte } from "drizzle-orm";
import { NextResponse } from "next/server";

import { db } from "@/lib/db";
import { powerliftingBenchmarks } from "@/lib/db/schema";
import {
  normalizeSex,
  serializePowerliftingBenchmark,
} from "@/lib/powerlifting-benchmarks";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const sex = normalizeSex(searchParams.get("gender"));
  const age = Number(searchParams.get("age"));
  const bodyweight = Number(searchParams.get("bodyweight"));

  if (!sex || !Number.isFinite(age) || !Number.isFinite(bodyweight)) {
    return NextResponse.json(
      {
        benchmarks: [],
        message: "Add gender, age, and bodyweight to use OpenPowerlifting data.",
      },
      { status: 400 },
    );
  }

  const rows = await db
    .select()
    .from(powerliftingBenchmarks)
    .where(
      and(
        eq(powerliftingBenchmarks.sex, sex),
        lte(powerliftingBenchmarks.ageMin, age),
        gte(powerliftingBenchmarks.ageMax, age),
        lte(powerliftingBenchmarks.bodyweightMin, bodyweight),
        gte(powerliftingBenchmarks.bodyweightMax, bodyweight),
      ),
    );

  return NextResponse.json({
    benchmarks: rows.map(serializePowerliftingBenchmark),
    message:
      rows.length === 0
        ? "Run `pnpm import:opl` to import OpenPowerlifting competitive percentiles."
        : null,
  });
}
