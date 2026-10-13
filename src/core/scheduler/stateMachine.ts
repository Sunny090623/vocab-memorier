import { CardState, UserRating, CardProgress, SchedulerConfig, DEFAULT_SCHEDULER_CONFIG } from './types.ts';
import { isIndependentTest } from './spacingRules.ts';

export interface TransitionContext {
  now: number;
  otherCardsSinceLastReview: number;
  config?: SchedulerConfig;
  bypassCooldown?: boolean;
}

export interface TransitionResult {
  nextCard: CardProgress;
  isIndependent: boolean;
  actionDesc: string;
}

/**
 * 卡片状态转移核心纯函数
 */
export function transitionCard(
  card: CardProgress,
  rating: UserRating,
  ctx: TransitionContext
): TransitionResult {
  const config = ctx.config || DEFAULT_SCHEDULER_CONFIG;
  const now = ctx.now;
  const elapsedMs = now - card.lastReviewedAt;

  const updated: CardProgress = {
    ...card,
    reps: card.reps + 1,
    lastReviewedAt: now,
  };

  switch (card.state) {
    case CardState.NEW:
      updated.state = CardState.LEARNING;
      if (rating === UserRating.GOOD) {
        updated.step = 1;
        updated.nextDue = now + 40000;
      } else {
        updated.step = 0;
        updated.nextDue = now;
      }
      return {
        nextCard: updated,
        isIndependent: false,
        actionDesc: '新词初学建档',
      };

    case CardState.LEARNING:
      if (rating === UserRating.AGAIN) {
        updated.step = 0;
        updated.nextDue = now;
      } else if (rating === UserRating.HARD) {
        updated.step = 1;
        updated.nextDue = now + 30000;
      } else {
        // rating === GOOD
        if (card.step >= 1) {
          // 初学阶段完成，转入集中打乱测试池
          updated.state = CardState.TESTING;
          updated.step = 0;
          updated.consecutiveSuccess = 0;
          updated.nextDue = now + config.minTestSpacingMs;
        } else {
          updated.step = 1;
          updated.nextDue = now + 30000;
        }
      }
      return {
        nextCard: updated,
        isIndependent: false,
        actionDesc: '初学强化流转',
      };

    case CardState.TESTING: {
      // 严格 OR 条件判断独立性（支持显式免等待测试）
      const isIndependent =
        Boolean(ctx.bypassCooldown) ||
        isIndependentTest(ctx.otherCardsSinceLastReview, elapsedMs, config);

      if (rating === UserRating.GOOD) {
        if (isIndependent) {
          const nextStreak = card.consecutiveSuccess + 1;
          updated.consecutiveSuccess = nextStreak;

          if (nextStreak >= config.passConsecutiveSuccess) {
            // 达成连续独立答对标准，判定本轮通关
            updated.state = CardState.MASTERED;
            updated.masteredAt = now;
            return {
              nextCard: updated,
              isIndependent: true,
              actionDesc: '独立测试达标，本轮通关',
            };
          } else {
            // 独立答对 1 次，打乱等待下一轮复测
            updated.nextDue = now + config.minTestSpacingMs;
            return {
              nextCard: updated,
              isIndependent: true,
              actionDesc: '独立测试命中第1次，等待复测',
            };
          }
        } else {
          // 提前测试答对但不满足独立条件：更新最近展示时间，但保留原有的下次到期时刻，防止倒计时被反复刷新重置
          updated.nextDue = card.nextDue && card.nextDue > now ? card.nextDue : now + config.minTestSpacingMs;
          return {
            nextCard: updated,
            isIndependent: false,
            actionDesc: '提前复习答对（非独立测试，不增加通关计数）',
          };
        }
      } else {
        // 在测试阶段答错 (AGAIN) 或模糊 (HARD)：立即重置连续正确次数并退回强化池
        updated.state = CardState.LEARNING;
        updated.step = 0;
        updated.consecutiveSuccess = 0;
        updated.lapseCount = card.lapseCount + 1;
        updated.nextDue = now;
        return {
          nextCard: updated,
          isIndependent,
          actionDesc: '测试未通过，重置并退回强化池',
        };
      }
    }

    case CardState.MASTERED:
      return {
        nextCard: updated,
        isIndependent: true,
        actionDesc: '已通关状态保持',
      };
  }
}