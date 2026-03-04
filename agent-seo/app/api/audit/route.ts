// app/api/audit/route.ts
// PUT — fast record creation (stays on Vercel, < 1s).
// POST (streaming) has moved to the Railway backend server.
import { createAudit } from "@/lib/db";
import { nanoid } from "nanoid";
import { NextRequest, NextResponse } from "next/server";

export async function PUT(req: NextRequest) {
  let domain: string;
  try {
    const body = await req.json();
    domain = body?.domain;
  } catch {
    return NextResponse.json({ error: "Domain required" }, { status: 400 });
  }
  if (!domain) return NextResponse.json({ error: "Domain required" }, { status: 400 });

  const auditId = nanoid();
  await createAudit(auditId, domain);
  return NextResponse.json({ auditId });
}
