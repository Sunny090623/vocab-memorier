import { CardProgress, CardState, DEFAULT_SCHEDULER_CONFIG, StudyMode } from './types.ts';

/**
 * 将整张词表切分为学习组
 * 规则：
 * 1. 显式指定 'FULL_DECK' 模式：全表单组通刷；
 * 2. 显式指定 'BATCH_CYCLE' 模式：严格按 groupSize（默认 20 词）分批，不受 30 词阈值限制（如 21 词为 20+1）；
 * 3. 'AUTO' 自动模式（默认）：不超过 30 词直接全表通刷，超过 30 词按 groupSize 分组。
 */
export function splitIntoStudyGroups(
  words: string[],
  mode: StudyMode = 'AUTO',
  groupSize: number = DEFAULT_SCHEDULER_CONFIG.groupSize
): string[][] {
  if (words.length === 0) {
    return [];
  }

  // 全表通刷模式
  if (mode === 'FULL_DECK' || groupSize <= 0) {
    return [words];
  }

  // 自动模式：不超过 30 词采用全表通刷
  if (mode === 'AUTO' && words.length <= 30) {
    return [words];
  }

  // 组循环模式 (BATCH_CYCLE) 或 AUTO (超过 30 词)：按 groupSize 连续切分
  const groups: string[][] = [];
  for (let i = 0; i < words.length; i += groupSize) {
    groups.push(words.slice(i, i + groupSize));
  }
  return groups;
}

export type GroupPhase = 'INITIAL_LEARNING' | 'INTENSIVE_TESTING' | 'GROUP_COMPLETED';

/**
 * 分析当前组所处的学习阶段
 */
export function getGroupPhase(groupCards: CardProgress[]): GroupPhase {
  if (groupCards.length === 0) {
    return 'GROUP_COMPLETED';
  }

  const allMastered = groupCards.every((c) => c.state === CardState.MASTERED);
  if (allMastered) {
    return 'GROUP_COMPLETED';
  }

  // 若仍有 NEW 或 LEARNING 状态的卡片，处于初学强化阶段
  const hasLearningOrNew = groupCards.some(
    (c) => c.state === CardState.NEW || c.state === CardState.LEARNING
  );

  if (hasLearningOrNew) {
    return 'INITIAL_LEARNING';
  }

  // 其余都在 TESTING（或部分已 MASTERED），处于集中测试阶段
  return 'INTENSIVE_TESTING';
}

/**
 * Fisher-Yates 洗牌算法 (打乱测试卡片)
 */
export function shuffleArray<T>(items: T[]): T[] {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}