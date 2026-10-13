import { CardProgress, CardState, ReviewLogEntry, UserRating } from '../scheduler/types.ts';
import { DeckStats } from './types.ts';

export function calculateDeckStats(
  cards: CardProgress[],
  logs: ReviewLogEntry[]
): DeckStats {
  const totalWords = cards.length;
  let masteredWords = 0;
  let learningWords = 0;
  let testingWords = 0;
  let unseenWords = 0;

  for (const c of cards) {
    if (c.state === CardState.MASTERED) {
      masteredWords++;
    } else if (c.state === CardState.LEARNING) {
      learningWords++;
    } else if (c.state === CardState.TESTING) {
      testingWords++;
    } else {
      unseenWords++;
    }
  }

  const remainingWords = totalWords - masteredWords;

  // 测试阶段正确率统计 (仅统计处于 TESTING 状态时的答题记录)
  const testLogs = logs.filter((l) => l.stateBefore === CardState.TESTING);
  let testGoodCount = 0;
  for (const l of testLogs) {
    if (l.rating === UserRating.GOOD) {
      testGoodCount++;
    }
  }
  const accuracyPercent =
    testLogs.length > 0 ? Math.round((testGoodCount / testLogs.length) * 100) : 100;

  // 平均思考耗时 (排除超过 60 秒的异常放置时间)
  let validDurationSumMs = 0;
  let validLogCount = 0;
  for (const l of logs) {
    if (l.durationMs > 0 && l.durationMs <= 60000) {
      validDurationSumMs += l.durationMs;
      validLogCount++;
    }
  }
  const avgDurationSec =
    validLogCount > 0 ? Math.round((validDurationSumMs / validLogCount / 1000) * 10) / 10 : 0;

  // 单位时间通关速率 (词/小时)
  let masteredWordsPerHour = 0;
  if (masteredWords > 0 && validDurationSumMs > 0) {
    const totalHours = validDurationSumMs / (1000 * 3600);
    masteredWordsPerHour = Math.round(masteredWords / totalHours);
  }

  // 易错词列表 (按 lapseCount 降序排序)
  const lapseWords = cards
    .filter((c) => c.lapseCount > 0)
    .sort((a, b) => b.lapseCount - a.lapseCount || b.reps - a.reps)
    .map((c) => ({
      word: c.word,
      lapseCount: c.lapseCount,
      reps: c.reps,
    }));

  return {
    totalWords,
    masteredWords,
    remainingWords,
    learningWords,
    testingWords,
    unseenWords,
    accuracyPercent,
    avgDurationSec,
    masteredWordsPerHour,
    lapseWords,
  };
}