import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { connectDB } from "@/lib/mongodb";
import User from "@/models/User";
import { isOtpVerified, consumeOtpVerification } from "@/lib/otp-store";
import { checkRateLimit } from "@/lib/rate-limit";

const BCRYPT_ROUNDS = 10;
const EMAIL_REGEX = /^[a-z]+\.(\d+)@sxcce\.edu\.in$/i;
const MIN_PASSWORD_LENGTH = 8;
const MAX_PASSWORD_LENGTH = 128;

export async function POST(req: NextRequest) {
  const rateLimitResponse = await checkRateLimit(req);
  if (rateLimitResponse) return rateLimitResponse;

  try {
    const body = await req.json();
    const email: string = String(body.email ?? "").trim().toLowerCase();
    const rollno: string = String(body.rollno ?? "").trim();
    const password: string = String(body.password ?? "");

    // --- Validate ---
    if (!email || !rollno || !password) {
      return NextResponse.json({ error: "Email, roll number, and password are required." }, { status: 400 });
    }

    if (!/^\d+$/.test(rollno) || rollno.length !== 6) {
      return NextResponse.json({ error: "Invalid roll number." }, { status: 400 });
    }

    const emailMatch = email.match(EMAIL_REGEX);
    if (!emailMatch) {
      return NextResponse.json({ error: "Invalid email format." }, { status: 400 });
    }

    const emailRollno = emailMatch[1];
    if (emailRollno !== rollno) {
      return NextResponse.json({ error: "Email and roll number do not match." }, { status: 400 });
    }

    if (password.length < MIN_PASSWORD_LENGTH) {
      return NextResponse.json(
        { error: `Password must be at least ${MIN_PASSWORD_LENGTH} characters.` },
        { status: 400 }
      );
    }

    if (password.length > MAX_PASSWORD_LENGTH) {
      return NextResponse.json(
        { error: `Password must be at most ${MAX_PASSWORD_LENGTH} characters.` },
        { status: 400 }
      );
    }

    // --- Verify OTP was completed ---
    if (!await isOtpVerified(email)) {
      return NextResponse.json(
        { error: "OTP verification required before setting a password." },
        { status: 403 }
      );
    }

    // --- Hash & store ---
    await connectDB();

    const existing = await User.findOne({ rollno });
    if (existing && existing.email !== email) {
      await consumeOtpVerification(email); // don't leave stale verified state
      return NextResponse.json(
        { error: "This roll number is already registered with a different email." },
        { status: 409 }
      );
    }

    const hash = await bcrypt.hash(password, BCRYPT_ROUNDS);

    if (existing) {
      await User.updateOne({ rollno }, { $set: { password: hash } });
    } else {
      await User.create({ rollno, email, password: hash });
    }

    await consumeOtpVerification(email); // single-use

    return NextResponse.json({ message: "Password set successfully." });
  } catch (err: unknown) {
    console.error("set-password error:", err);
    if (
      typeof err === "object" &&
      err !== null &&
      "code" in err &&
      (err as { code: unknown }).code === 11000
    ) {
      return NextResponse.json(
        { error: "A password has already been set for this account." },
        { status: 409 }
      );
    }
    return NextResponse.json({ error: "Failed to save password. Please try again." }, { status: 500 });
  }
}
