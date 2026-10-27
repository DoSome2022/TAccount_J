import Redis from "ioredis";

/**
 * Redis 整合（分散式速率限制）：
 *  - 未設定 REDIS_URL → 回傳 null（無 Redis 模式：rate-limit 自動退回記憶體）
 *  - lazyConnect + 等待連線就緒才回傳，避免第一個指令因連線未建立而失敗
 *  - 連線失敗 → 回傳 null（且下次請求重試）；連上後 Redis 掛掉 → 指令 throw，
 *    由 rate-limit 的 fail-open 策略退回記憶體，不影響登入主流程
 */
let clientPromise: Promise<Redis | null> | undefined;

export function getRedis(): Promise<Redis | null> {
  if (clientPromise === undefined) {
    clientPromise = connect();
  }
  return clientPromise;
}

async function connect(): Promise<Redis | null> {
  const url = process.env.REDIS_URL?.trim();
  if (!url) return null;

  const c = new Redis(url, {
    maxRetriesPerRequest: 2,
    enableOfflineQueue: false,
    lazyConnect: true,
    // 連線階段最多重試 3 次（避免請求無限等待）
    retryStrategy: (times) => (times > 3 ? null : Math.min(times * 200, 1000)),
  });
  c.on("error", (err) => {
    console.error("[redis] 連線錯誤（速率限制退回記憶體）:", err.message);
  });

  try {
    await c.connect();
    return c;
  } catch (err) {
    console.error("[redis] 連線失敗（速率限制退回記憶體）:", (err as Error).message);
    clientPromise = undefined; // 下次請求重試連線（自我修復）
    try {
      c.disconnect();
    } catch {
      // 忽略
    }
    return null;
  }
}
