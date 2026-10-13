export enum CardState {
  NEW = 'NEW',             // 未学新词
  LEARNING = 'LEARNING',   // 快速初学与错词强化阶段
  TESTING = 'TESTING',     // 独立打乱测试阶段
  MASTERED = 'MASTERED',   // 本轮达成通关
}

export enum UserRating {
  AGAIN = 'AGAIN', // 0: 不认识
  HARD = 'HARD',   // 1: 模糊
  GOOD = 'GOOD',   // 2: 认识
}

export type StudyMode = 'BATCH_CYCLE' | 'FULL_DECK' | 'AUTO';

export interface SchedulerConfig {
  /** 学习组大小（每组词数），默认 20。如果词表 <= 30，直接采用全表通刷 */
  groupSize: number;
  /** 初学阶段答错 (AGAIN) 时在当前队列中插入的最小间隔卡片数，默认 3 */
  minAgainOffset: number;
  /** 初学阶段答模糊 (HARD) 时插入的间隔卡片数，默认 5 */
  minHardOffset: number;
  /** 测试阶段判定通关所需的连续独立答对次数，默认 2 */
  passConsecutiveSuccess: number;
  /** 独立测试有效判定：最小物理时间间隔（毫秒），默认 90,000 (90秒) */
  minTestSpacingMs: number;
  /** 独立测试有效判定：最小卡片干扰间隔（张），默认 8 */
  minTestInterveningCards: number;
}

export const DEFAULT_SCHEDULER_CONFIG: SchedulerConfig = {
  groupSize: 20,
  minAgainOffset: 3,
  minHardOffset: 5,
  passConsecutiveSuccess: 2,
  minTestSpacingMs: 90000,
  minTestInterveningCards: 8,
};

export interface CardProgress {
  id?: string;                  // 唯一主键 `${deckId}:${word}`
  deckId?: string;              // 所属单词本 ID
  word: string;
  state: CardState;
  step: number;                 // 0: 初学第1步, 1: 初学第2步
  consecutiveSuccess: number;   // 测试阶段累计独立答对次数
  lapseCount: number;           // 跌回初学强化次数
  reps: number;                 // 总答题次数
  lastReviewedAt: number;       // 上次答题时刻 (毫秒时间戳)
  nextDue: number;              // 建议下次出题时刻 (毫秒时间戳)
  masteredAt?: number;          // 通关时刻
}

export interface ReviewLogEntry {
  id: string;
  word: string;
  deckId: string;
  rating: UserRating;
  stateBefore: CardState;
  stateAfter: CardState;
  isIndependent: boolean;
  durationMs: number;
  timestamp: number;
}