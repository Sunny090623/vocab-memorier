/**
 * 内存滑动窗口频次限制器 (Rate Limiter)
 * 防止爆破登录与恶意注册，开箱即用，无需 Redis 等外部缓存
 */

interface RateLimitRecord {
  timestamps: number[];
}

const store = new Map<string, RateLimitRecord>();

export class RateLimiter {
  private windowMs: number;
  private maxAttempts: number;

  constructor(windowMs = 60_000, maxAttempts = 10) {
    this.windowMs = windowMs;
    this.maxAttempts = maxAttempts;
  }

  /**
   * 检查并记录请求。若超限返回 allowed: false 及重试冷却时间
   */
  check(key: string): { allowed: boolean; retryAfterSec?: number; remaining: number } {
    const now = Date.now();
    let record = store.get(key);

    if (!record) {
      record = { timestamps: [] };
      store.set(key, record);
    }

    // 清理过期窗口时间戳
    record.timestamps = record.timestamps.filter((ts) => now - ts < this.windowMs);

    if (record.timestamps.length >= this.maxAttempts) {
      const oldest = record.timestamps[0];
      const retryAfterSec = Math.max(1, Math.ceil((this.windowMs - (now - oldest)) / 1000));
      return {
        allowed: false,
        retryAfterSec,
        remaining: 0,
      };
    }

    record.timestamps.push(now);
    return {
      allowed: true,
      remaining: this.maxAttempts - record.timestamps.length,
    };
  }

  /**
   * 重置指定 key（例如登录成功后清除计数）
   */
  reset(key: string): void {
    store.delete(key);
  }

  /**
   * 清空所有记录（测试时使用）
   */
  clearAll(): void {
    store.clear();
  }
}

export const authRateLimiter = new RateLimiter(60_000, 10);

