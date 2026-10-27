import { getRedis } from "@/server/redis";

/**
 * 共用速率限制（登入／忘記密碼／重設密碼／setup）：
 *  - Redis 模式：Lua 原子 INCR + 首次 EXPIRE（多 instance 全域一致）
 *  - 無 Redis／Redis 故障：fail-open 退回記憶體 Map（單 process，行為與舊版一致）
 *  - 語意：窗內第 max+1 次請求被擋（成功登入／完成操作後呼叫 rateLimitReset 清空）
 */

const RATE_LIMIT_PREFIX = "rl:";
const WINDOW_MS_FALLBACK = 15 * 60 * 1000;

type RateLimitResult = { ok: boolean; retryAfterSec?: number };

// 記憶體 fallback（無 Redis 模式）
const memory = new Map<string, { count: number; firstAt: number }>();

const INCR_SCRIPT = `
local c = redis.call('INCR', KEYS[1])
if c == 1 then
  redis.call('EXPIRE', KEYS[1], ARGV[1])
end
local ttl = redis.call('TTL', KEYS[1])
return {c, ttl}
`;

function memoryLimit(key: string, max: number, windowSec: number): RateLimitResult {
  const now = Date.now();
  const rec = memory.get(key) ?? { count: 0, firstAt: now };
  if (now - rec.firstAt > (windowSec * 1000 || WINDOW_MS_FALLBACK)) {
    rec.count = 0;
    rec.firstAt = now;
  }
  rec.count++;
  memory.set(key, rec);
  if (rec.count > max) {
    const retryAfterSec = Math.max(1, Math.ceil((rec.firstAt + windowSec * 1000 - now) / 1000));
    return { ok: false, retryAfterSec };
  }
  return { ok: true };
}

export async function rateLimit(
  key: string,
  max: number,
  windowSec: number,
): Promise<RateLimitResult> {
  const redis = await getRedis();
  if (!redis) return memoryLimit(key, max, windowSec);

  try {
    const fullKey = `${RATE_LIMIT_PREFIX}${key}`;
    const res = (await redis.eval(INCR_SCRIPT, 1, fullKey, String(windowSec))) as [number, number];
    const count = Number(res[0]);
    if (count > max) {
      return { ok: false, retryAfterSec: Math.max(1, Number(res[1])) };
    }
    return { ok: true };
  } catch {
    // fail-open：Redis 故障時退回記憶體，寧可限制降級也不擋住主流程
    return memoryLimit(key, max, windowSec);
  }
}

/** 成功後清空該 key 的計數（登入成功、setup 完成等） */
export async function rateLimitReset(key: string): Promise<void> {
  const redis = await getRedis();
  if (redis) {
    try {
      await redis.del(`${RATE_LIMIT_PREFIX}${key}`);
    } catch {
      // 忽略：最差情況只是計數多留一個視窗
    }
  }
  memory.delete(key);
}
