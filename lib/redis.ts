import Redis from "ioredis";

declare global {
  var redisClient: Redis | undefined;
}

/**
 * Returns a singleton Redis client.
 * Uses the global cache so the connection is reused across hot-reloads in
 * development and across serverless invocations in the same process.
 *
 * The REDIS_URL is parsed with the WHATWG URL API (not the deprecated
 * `url.parse()`) and the individual connection options are passed to ioredis
 * so that ioredis never calls `url.parse()` internally.
 */
export function getRedisClient(): Redis {
  if (global.redisClient) return global.redisClient;

  const rawUrl = process.env.REDIS_URL;
  if (!rawUrl) {
    throw new Error("Please define the REDIS_URL environment variable in .env.local");
  }

  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new Error(
      `Invalid REDIS_URL: "${rawUrl}". Expected a valid redis:// or rediss:// URL.`
    );
  }

  const rawPort = parseInt(parsed.port, 10);
  const port = rawPort >= 1 && rawPort <= 65535 ? rawPort : 6379;

  global.redisClient = new Redis({
    host: parsed.hostname,
    port,
    username: parsed.username || undefined,
    password: parsed.password ? decodeURIComponent(parsed.password) : undefined,
    tls: parsed.protocol === "rediss:" ? {} : undefined,
    maxRetriesPerRequest: 3,
    enableReadyCheck: false,
    lazyConnect: false,
  });

  return global.redisClient;
}
