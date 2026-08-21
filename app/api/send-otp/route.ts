import { NextRequest, NextResponse } from "next/server";
import { Resend } from "resend";
import { isRateLimited, generateOtp, storeOtp } from "@/lib/otp-store";
import { checkRateLimit } from "@/lib/rate-limit";

const EMAIL_REGEX = /^[a-z]+\.(\d+)@sxcce\.edu\.in$/i;

function sanitize(str: string): string {
  return str.trim().toLowerCase();
}

export async function POST(req: NextRequest) {
  const rateLimitResponse = await checkRateLimit(req);
  if (rateLimitResponse) return rateLimitResponse;

  try {
    const body = await req.json();
    const email: string = sanitize(String(body.email ?? ""));
    const rollno: string = String(body.rollno ?? "").trim();

    if (!email || !rollno) {
      return NextResponse.json({ error: "Email and roll number are required." }, { status: 400 });
    }

    if (!/^\d+$/.test(rollno)) {
      return NextResponse.json({ error: "Roll number must contain only digits." }, { status: 400 });
    }

    if (rollno.length !== 6) {
      return NextResponse.json({ error: "Roll number must be exactly 6 digits." }, { status: 400 });
    }

    const emailMatch = email.match(EMAIL_REGEX);
    if (!emailMatch) {
      return NextResponse.json(
        { error: "Email must be in the format yourname.rollnumber@sxcce.edu.in" },
        { status: 400 }
      );
    }

    if (emailMatch[1] !== rollno) {
      return NextResponse.json(
        { error: "Roll number does not match the number in your email ID." },
        { status: 400 }
      );
    }

    if (await isRateLimited(email)) {
      return NextResponse.json(
        { error: "Too many OTP requests. Please try again later." },
        { status: 429 }
      );
    }

    const apiKey = process.env.RESEND_API_KEY;
    const from = process.env.EMAIL_FROM;
    if (!apiKey || !from) {
      console.error("send-otp configuration error: RESEND_API_KEY and EMAIL_FROM are required");
      return NextResponse.json({ error: "Failed to send OTP. Please try again." }, { status: 500 });
    }

    const otp = generateOtp();
    const resend = new Resend(apiKey);
    const { error } = await resend.emails.send({
      from: `SXCCE Account Portal <${from}>`,
      to: email,
      subject: "Your OTP for Account Registration",
      html: `
        <div style="font-family:Arial,sans-serif;max-width:480px;margin:auto;padding:24px;border:1px solid #e2e8f0;border-radius:8px;">
          <h2 style="color:#1e40af;">SXCCE Account Portal</h2>
          <p>Hello,</p>
          <p>Your One-Time Password (OTP) for account registration is:</p>
          <div style="font-size:36px;font-weight:bold;letter-spacing:12px;color:#1e40af;text-align:center;padding:16px 0;">${otp}</div>
          <p>This OTP is valid for <strong>5 minutes</strong>.</p>
          <p style="color:#ef4444;">Do not share this OTP with anyone.</p>
          <hr style="border-color:#e2e8f0;" />
          <p style="font-size:12px;color:#64748b;">If you did not request this OTP, please ignore this email.</p>
        </div>
      `,
    });

    if (error) {
      console.error("send-otp provider error:", error);
      return NextResponse.json({ error: "Failed to send OTP. Please try again." }, { status: 500 });
    }

    await storeOtp(email, otp);
    return NextResponse.json({ message: "OTP sent successfully." });
  } catch (err) {
    console.error("send-otp error:", err);
    return NextResponse.json({ error: "Failed to send OTP. Please try again." }, { status: 500 });
  }
}
