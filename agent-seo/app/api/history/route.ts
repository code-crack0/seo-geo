// app/api/history/route.ts
import { getRecentAudits } from "@/lib/db";
import { NextResponse } from "next/server";

export async function GET() {
  const history = await getRecentAudits(10);
  return NextResponse.json(history);
}
