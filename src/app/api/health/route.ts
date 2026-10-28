/**
 * 健康檢查（Docker healthcheck / NPM 監控用）
 * - DB 是硬依賴：掛掉回 503
 * - Redis 只是速率限制加速層，app 會 fail-open → 掛掉回 200 "degraded"
 */
import { connection, NextResponse } from "next/server";
import { prisma } from "@/server/db";
import { getRedis } from "@/server/redis";

// cacheComponents：健康檢查必須每個請求即時執行，不能在 build 時 prerender。
// 本專案不可用 runtime = "nodejs" 或 dynamic = "force-dynamic"。
export const instant = false;

type CheckState = "up" | "down" | "skipped";

export async function GET() {
  await connection(); // 明確阻止 build-time prerender

  let database: CheckState = "down";
  try {
    await prisma.$queryRaw`SELECT 1`;
    database = "up";
  } catch (e) {
    console.error("[health] database check failed:", (e as Error).message);
  }

  let redis: CheckState = "skipped";
  if (process.env.REDIS_URL) {
    redis = "down";
    try {
      const client = await getRedis();
      if (client && (await client.ping()) === "PONG") redis = "up";
    } catch (e) {
      console.error("[health] redis check failed:", (e as Error).message);
    }
  }

  const healthy = database === "up";
  const status = !healthy ? "unhealthy" : redis === "down" ? "degraded" : "ok";

  return NextResponse.json(
    { status, checks: { database, redis } },
    {
      status: healthy ? 200 : 503,
      headers: { "cache-control": "no-store" },
    },
  );
}
