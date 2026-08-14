import { NextRequest, NextResponse } from "next/server";
import nodemailer from "nodemailer";
import { isRateLimited, generateOtp, storeOtp } from "@/lib/otp-store";
import { checkRateLimit } from "@/lib/rate-limit";

// Cache the transporter at module level so the SMTP connection pool is reused
// across requests instead of opening a new TCP+TLS connection every time.
let _transporter: nodemailer.Transporter | null = null;
function getTransporter(): nodemailer.Transporter {
  if (!_transporter) {
    // EMAIL_SECURE=true  → implicit TLS on port 465 (some third-party SMTP relays)
    // EMAIL_SECURE=false → STARTTLS on port 587 (Brevo, Office 365 SMTP AUTH)
    const secure = process.env.EMAIL_SECURE === "true";
    _transporter = nodemailer.createTransport({
      host: process.env.EMAIL_HOST,
      port: Number(process.env.EMAIL_PORT ?? 587),
      secure,
      // When using implicit TLS (secure=true) the connection is already
      // encrypted from the start, so requireTLS is not needed.
      // When using STARTTLS (secure=false) requireTLS=true forces the
      // connection to upgrade; the send fails if the server won't upgrade.
      requireTLS: !secure,
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS,
      },
      tls: {
        minVersion: "TLSv1.2",
        rejectUnauthorized: true,
      },
    });
  }
  return _transporter;
}

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

    // --- Validate inputs ---
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

    const emailRollno = emailMatch[1];
    if (emailRollno !== rollno) {
      return NextResponse.json(
        { error: "Roll number does not match the number in your email ID." },
        { status: 400 }
      );
    }

    // --- Rate limiting ---
    if (await isRateLimited(email)) {
      return NextResponse.json(
        { error: "Too many OTP requests. Please try again later." },
        { status: 429 }
      );
    }

    // --- Generate OTP (not yet stored) & send email ---
    const otp = generateOtp();

    await getTransporter().sendMail({
      from: `"SXCCE Account Portal" <${process.env.EMAIL_FROM ?? process.env.EMAIL_USER}>`,
      to: email,
      subject: "Your OTP for Account Registration",
      html: `
        <div style="font-family:Arial,sans-serif;max-width:480px;margin:auto;padding:24px;border:1px solid #e2e8f0;border-radius:8px;">
          <h2 style="color:#1e40af;">🔐 SXCCE Account Portal</h2>
          <p>Hello,</p>
          <p>Your One-Time Password (OTP) for account registration is:</p>
          <div style="font-size:36px;font-weight:bold;letter-spacing:12px;color:#1e40af;text-align:center;padding:16px 0;">
            ${otp}
          </div>
          <p>This OTP is valid for <strong>5 minutes</strong>.</p>
          <p style="color:#ef4444;">⚠️ Do not share this OTP with anyone.</p>
          <hr style="border-color:#e2e8f0;" />
          <p style="font-size:12px;color:#64748b;">If you did not request this OTP, please ignore this email.</p>
        </div>
      `,
    });

    // Store the OTP session in Redis only after the email has been sent
    // successfully so that a failed SMTP call does not waste a rate-limit slot.
    await storeOtp(email, otp);

    return NextResponse.json({ message: "OTP sent successfully." });
  } catch (err) {
    console.error("send-otp error:", err);
    return NextResponse.json({ error: "Failed to send OTP. Please try again." }, { status: 500 });
  }
}
