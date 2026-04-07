/**
 * IP-based rate limiting with bot detection and DDoS protection.
 *
 * - Normal traffic: 30 requests/min per IP
 * - Detected bots:  10 requests/min per IP
 * - DDoS:          IP blocked for 1 hour after 10 rate-limit violations
 */

import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import IpRateLimit from "@/models/IpRateLimit";

const NORMAL_LIMIT = 30;              // req/min for normal traffic
const BOT_LIMIT = 10;                 // req/min for detected bots
const RATE_WINDOW_MS = 60 * 1000;    // 1-minute sliding window
const MAX_VIOLATIONS = 10;            // violations before IP block
const BLOCK_DURATION_MS = 60 * 60 * 1000; // 1-hour block

/** User-agent patterns that indicate automated/bot traffic. */
const BOT_PATTERNS = [
  /bot/i,
  /spider/i,
  /crawler/i,
  /scraper/i,
  /curl\//i,
  /wget\//i,
  /python-requests/i,
  /python\//i,
  /go-http-client/i,
  /java\//i,
  /libwww-perl/i,
  /httpunit/i,
  /nutch/i,
  /phpcrawl/i,
  /postman/i,
  /insomnia/i,
  /httpie/i,
  /node-fetch/i,
  /got\//i,
];

/** Returns true if the User-Agent looks like a bot or scraper. */
function detectBot(userAgent: string | null | undefined): boolean {
  if (!userAgent) return true; // no user agent is treated as a bot
  return BOT_PATTERNS.some((pattern) => pattern.test(userAgent));
}

/** Extracts the real client IP from common proxy headers. */
function getClientIp(req: NextRequest): string {
  const realIp = req.headers.get("x-real-ip");
  if (realIp) return realIp.trim();
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  return "unknown";
}

/**
 * Checks IP-based rate limiting for the incoming request.
 * Returns a NextResponse (429 or 403) if the request should be blocked,
 * or null if it should proceed.
 */
export async function checkRateLimit(req: NextRequest): Promise<NextResponse | null> {
  await connectDB();

  const ip = getClientIp(req);
  const userAgent = req.headers.get("user-agent");
  const bot = detectBot(userAgent);
  const limit = bot ? BOT_LIMIT : NORMAL_LIMIT;
  const now = Date.now();

  const record = await IpRateLimit.findOne({ ip });

  // ── DDoS protection: check if IP is currently blocked ──────────────────────
  if (record?.blocked) {
    const blockedUntil = record.blockedUntil?.getTime() ?? 0;
    if (now < blockedUntil) {
      return NextResponse.json(
        { error: "Your IP has been temporarily blocked due to excessive requests." },
        { status: 403 }
      );
    }
    // Block has expired — reset the record and allow the request
    await IpRateLimit.updateOne(
      { ip },
      {
        $set: {
          blocked: false,
          blockedUntil: null,
          requestCount: 1,
          windowStart: new Date(now),
          violations: 0,
        },
      }
    );
    return null;
  }

  // ── Start or continue the rate-limit window ─────────────────────────────────
  if (!record || now - record.windowStart.getTime() > RATE_WINDOW_MS) {
    // New window: create or reset the record with count = 1
    await IpRateLimit.findOneAndUpdate(
      { ip },
      {
        $set: {
          requestCount: 1,
          windowStart: new Date(now),
          violations: record?.violations ?? 0,
        },
      },
      { upsert: true }
    );
    return null;
  }

  // ── Rate limit exceeded ─────────────────────────────────────────────────────
  if (record.requestCount >= limit) {
    const newViolations = (record.violations ?? 0) + 1;

    if (newViolations >= MAX_VIOLATIONS) {
      // Block the IP for BLOCK_DURATION_MS
      await IpRateLimit.updateOne(
        { ip },
        {
          $set: {
            violations: newViolations,
            blocked: true,
            blockedUntil: new Date(now + BLOCK_DURATION_MS),
          },
        }
      );
      return NextResponse.json(
        { error: "Your IP has been temporarily blocked due to excessive requests." },
        { status: 403 }
      );
    }

    await IpRateLimit.updateOne({ ip }, { $set: { violations: newViolations } });

    return NextResponse.json(
      {
        error: bot
          ? "Rate limit exceeded for automated traffic. Please slow down."
          : "Too many requests. Please slow down and try again.",
      },
      { status: 429 }
    );
  }

  // ── Request is within limits — increment counter ────────────────────────────
  await IpRateLimit.updateOne({ ip }, { $inc: { requestCount: 1 } });
  return null;
}
