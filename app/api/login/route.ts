import { cookies } from "next/headers";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// 7 days in seconds
const SEVEN_DAYS = 60 * 60 * 24 * 7;

export async function POST(req: Request) {
  const expected = process.env.BOSS_PASSWORD;
  if (!expected) {
    return NextResponse.json(
      { error: "BOSS_PASSWORD is not set on the server" },
      { status: 500 }
    );
  }

  let body: { password?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!body.password || body.password !== expected) {
    return NextResponse.json({ error: "Invalid password" }, { status: 401 });
  }

  // Store the password in an httpOnly cookie. Middleware compares it
  // to process.env.BOSS_PASSWORD on every protected request.
  cookies().set("boss_auth", body.password, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SEVEN_DAYS,
  });

  return NextResponse.json({ ok: true });
}

export async function DELETE() {
  // Logout
  cookies().delete("boss_auth");
  return NextResponse.json({ ok: true });
}
