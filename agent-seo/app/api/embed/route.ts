// app/api/embed/route.ts
// Proxies embed requests to the Railway backend.
// The frontend calls this for historical audits that need embeddings built.
import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  const backendUrl = process.env.BACKEND_URL;
  if (!backendUrl) {
    return NextResponse.json({ error: "BACKEND_URL not configured" }, { status: 500 });
  }
  try {
    const body = await req.json();
    const res = await fetch(`${backendUrl}/api/embed`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
