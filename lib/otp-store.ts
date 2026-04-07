/**
 * Redis-backed OTP store with TTL-based expiry.
 * Each OTP session is stored as a JSON string in Redis, keyed by email address.
 * Redis TTL handles automatic expiry — no background cleanup needed.
 *
 * Keys used:
 *  otp:session:{email}  — { hash, attempts }  — TTL = OTP_TTL_SEC
 *  otp:verified:{email} — "1"                 — TTL = OTP_VERIFIED_TTL_SEC
 *  otp:rate:{email}     — send count (int)     — TTL = RATE_WINDOW_SEC
 *
 * The HMAC secret used to hash OTPs is still sourced from the OTP_SECRET env
 * variable (or auto-generated and persisted in MongoDB on first use).
 */

import { randomInt, randomBytes, createHmac, timingSafeEqual } from "crypto";
import { getRedisClient } from "@/lib/redis";
import { connectDB } from "@/lib/mongodb";
import AppSecret from "@/models/AppSecret";

const OTP_TTL_SEC = 5 * 60;           // 5 minutes — session expires automatically
const OTP_VERIFIED_TTL_SEC = 10 * 60; // 10 minutes — grace window to set password
const MAX_REQUESTS_PER_WINDOW = 3;
const RATE_WINDOW_SEC = 60 * 60;       // 1 hour
const MAX_VERIFY_ATTEMPTS = 5;

// ── Redis key helpers ──────────────────────────────────────────────────────────
const sessionKey  = (email: string) => `otp:session:${email}`;
const verifiedKey = (email: string) => `otp:verified:${email}`;
const rateKey     = (email: string) => `otp:rate:${email}`;

interface OtpSessionData {
  hash: string;
  attempts: number;
}

// ── HMAC secret (sourced from env or MongoDB, same as before) ─────────────────
/** In-process cache so we only hit MongoDB once per warm instance. */
let _cachedSecret: string | null = null;

/**
 * Returns the HMAC secret used to hash OTPs.
 *
 * Resolution order:
 *  1. OTP_SECRET environment variable (recommended for production).
 *  2. A randomly-generated 32-byte secret that is auto-created and persisted in
 *     MongoDB on first use, so it survives serverless cold-starts without any
 *     manual configuration.
 */
async function getOtpSecret(): Promise<string> {
  if (process.env.OTP_SECRET) {
    if (process.env.OTP_SECRET.length < 32) {
      throw new Error(
        "[otp-store] OTP_SECRET must be at least 32 characters long. " +
          "Generate one with: node -e \"console.log(require('crypto').randomBytes(32).toString('hex'))\""
      );
    }
    return process.env.OTP_SECRET;
  }
  if (_cachedSecret) return _cachedSecret;

  await connectDB();
  let doc = await AppSecret.findOne({ key: "otp-secret" });
  if (!doc) {
    console.warn(
      "[otp-store] OTP_SECRET is not set. Auto-generating a secret and persisting it in " +
        "MongoDB. Set OTP_SECRET in your environment for best security."
    );
    const generated = randomBytes(32).toString("hex");
    doc = await AppSecret.findOneAndUpdate(
      { key: "otp-secret" },
      { $setOnInsert: { value: generated } },
      { upsert: true, new: true }
    );
  }
  _cachedSecret = doc?.value ?? null;
  if (!_cachedSecret) {
    throw new Error("[otp-store] Failed to retrieve OTP secret from database.");
  }
  return _cachedSecret;
}

/** HMAC-SHA256 hash of the OTP keyed by server secret. */
async function hashOtp(otp: string): Promise<string> {
  const secret = await getOtpSecret();
  return createHmac("sha256", secret).update(otp).digest("hex");
}

/** Constant-time comparison of two HMAC hex strings. */
async function otpHashEquals(otp: string, storedHex: string): Promise<boolean> {
  const expected = await hashOtp(otp);
  const a = Buffer.from(expected, "hex");
  const b = Buffer.from(storedHex, "hex");
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

// ── Public API ─────────────────────────────────────────────────────────────────

/**
 * Returns true if the email has exceeded the OTP send rate limit.
 * Uses a Redis counter with a 1-hour TTL as the sliding window.
 */
export async function isRateLimited(email: string): Promise<boolean> {
  const redis = getRedisClient();
  const key = rateKey(email);
  const count = await redis.incr(key);
  if (count === 1) {
    // First request in this window — set the expiry
    await redis.expire(key, RATE_WINDOW_SEC);
  }
  return count > MAX_REQUESTS_PER_WINDOW;
}

/**
 * Stores a hashed OTP for the given email in Redis with a 5-minute TTL.
 * Any previous OTP session and verified flag are invalidated.
 * Returns the plain OTP.
 */
/**
 * Generates a cryptographically secure 6-digit OTP string.
 * Call this before attempting the email send; call {@link storeOtp} only after
 * the email is confirmed sent so that a failed SMTP call does not waste a
 * rate-limit slot with a session the user can never use.
 */
export function generateOtp(): string {
  return String(randomInt(100000, 1000000));
}

/**
 * Persists the hashed OTP for `email` in Redis (TTL = OTP_TTL_SEC) and
 * invalidates any previous verified flag.  Call this only after the email
 * carrying the plain OTP has been successfully sent.
 */
export async function storeOtp(email: string, otp: string): Promise<void> {
  const redis = getRedisClient();
  const hash = await hashOtp(otp);
  const data: OtpSessionData = { hash, attempts: 0 };
  await Promise.all([
    redis.set(sessionKey(email), JSON.stringify(data), "EX", OTP_TTL_SEC),
    redis.del(verifiedKey(email)), // invalidate any previous verification
  ]);
}

/**
 * Convenience wrapper: generates a fresh OTP, stores it in Redis, and returns
 * the plaintext.  Use {@link generateOtp} + {@link storeOtp} separately when
 * you need to send the email before committing the session to Redis.
 */
export async function createOtp(email: string): Promise<string> {
  const otp = generateOtp();
  await storeOtp(email, otp);
  return otp;
}

/**
 * Verifies the OTP for a given email.
 * Invalidates the session on first successful use; sets a verified flag.
 * Deletes the session after too many wrong guesses.
 */
export async function verifyOtp(
  email: string,
  otp: string
): Promise<{ valid: boolean; reason?: string }> {
  const redis = getRedisClient();
  const key = sessionKey(email);

  const raw = await redis.get(key);
  if (!raw) return { valid: false, reason: "No OTP found. Please request a new one." };

  let session: OtpSessionData;
  try {
    session = JSON.parse(raw) as OtpSessionData;
  } catch {
    await redis.del(key);
    return { valid: false, reason: "No OTP found. Please request a new one." };
  }

  // Check attempt limit before incrementing
  if (session.attempts >= MAX_VERIFY_ATTEMPTS) {
    await redis.del(key);
    return { valid: false, reason: "Too many incorrect attempts. Please request a new OTP." };
  }

  // Increment attempt counter and persist (keeping the existing TTL)
  session.attempts += 1;
  await redis.set(key, JSON.stringify(session), "KEEPTTL");

  const match = await otpHashEquals(otp, session.hash);
  if (!match) {
    // Delete session if attempts are now exhausted
    if (session.attempts >= MAX_VERIFY_ATTEMPTS) {
      await redis.del(key);
    }
    return { valid: false, reason: "Incorrect OTP." };
  }

  // Single-use: delete the session and mark the email as verified
  await Promise.all([
    redis.del(key),
    redis.set(verifiedKey(email), "1", "EX", OTP_VERIFIED_TTL_SEC),
  ]);
  return { valid: true };
}

/** Returns true if the email has a valid (unconsumed) OTP verification. */
export async function isOtpVerified(email: string): Promise<boolean> {
  const redis = getRedisClient();
  const v = await redis.get(verifiedKey(email));
  return v === "1";
}

/** Consumes the OTP verification for an email (call after password is saved). */
export async function consumeOtpVerification(email: string): Promise<void> {
  const redis = getRedisClient();
  await redis.del(verifiedKey(email));
}
