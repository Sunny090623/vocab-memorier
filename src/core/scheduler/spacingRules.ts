import { SchedulerConfig, DEFAULT_SCHEDULER_CONFIG, UserRating } from './types.ts';

/**
 * 检验测试是否满足独立性条件（严格 OR 条件）
 * 1. 两次展示之间间隔了至少 8 张其他卡片
 * 2. 或者两次展示之间经过了至少 90 秒
 */
export function isIndependentTest(
  otherCardsSinceLastReview: number,
  elapsedMs: number,
  config: SchedulerConfig = DEFAULT_SCHEDULER_CONFIG
): boolean {
  return otherCardsSinceLastReview >= config.minTestInterveningCards || elapsedMs >= config.minTestSpacingMs;
}

/**
 * 计算错词/模糊词重新插入队列的目标索引，防止连续重现
 */
export function calculateRequeueIndex(
  currentQueueLength: number,
  rating: UserRating,
  config: SchedulerConfig = DEFAULT_SCHEDULER_CONFIG
): number {
  const minOffset = rating === UserRating.AGAIN ? config.minAgainOffset : config.minHardOffset;

  if (currentQueueLength === 0) {
    return 0;
  }

  // 保证至少间隔 minOffset 张，若当前队列总长较短，则插入队尾，绝不放回队首 (index 0)
  const targetIndex = Math.min(minOffset, currentQueueLength);
  return targetIndex;
}