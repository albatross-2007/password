import { NextRequest, NextResponse } from "next/server";
import { verifyOtp } from "@/lib/otp-store";
import { checkRateLimit } from "@/lib/rate-limit";

export async function POST(req: NextRequest) {
  const rateLimitResponse = await checkRateLimit(req);
  if (rateLimitResponse) return rateLimitResponse;

  try {
    const body = await req.json();
    const email: string = String(body.email ?? "").trim().toLowerCase();
    const otp: string = String(body.otp ?? "").trim();

    if (!email || !otp) {
      return NextResponse.json({ error: "Email and OTP are required." }, { status: 400 });
    }

    if (!/^\d{6}$/.test(otp)) {
      return NextResponse.json({ error: "OTP must be exactly 6 digits." }, { status: 400 });
    }

    const result = await verifyOtp(email, otp);
    if (!result.valid) {
      return NextResponse.json({ error: result.reason }, { status: 400 });
    }

    return NextResponse.json({ message: "OTP verified successfully." });
  } catch (err) {
    console.error("verify-otp error:", err);
    return NextResponse.json({ error: "Verification failed. Please try again." }, { status: 500 });
  }
}
