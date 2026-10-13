import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { CardProgress, CardState, UserRating, ReviewLogEntry, DEFAULT_SCHEDULER_CONFIG, StudyMode } from '../core/scheduler/types.ts';
import { transitionCard } from '../core/scheduler/stateMachine.ts';
import { splitIntoStudyGroups, getGroupPhase, shuffleArray } from '../core/scheduler/groupManager.ts';
import { calculateRequeueIndex } from '../core/scheduler/spacingRules.ts';
import { cardRepo } from '../data/repos/cardRepo.ts';
import { logRepo } from '../data/repos/logRepo.ts';
import { deckRepo } from '../data/repos/deckRepo.ts';
import { dictRepo, DictSearchResult } from '../data/repos/dictRepo.ts';
import { syncService } from '../data/sync/syncService.ts';

export interface StudySessionState {
  deckId: string;
  deckName: string;
  studyMode: StudyMode;
  totalCardsCount: number;
  allCards: CardProgress[];
  currentGroupIndex: number;
  totalGroupsCount: number;
  groupPhase: 'INITIAL_LEARNING' | 'INTENSIVE_TESTING' | 'GROUP_COMPLETED' | 'DECK_COMPLETED';
  currentCard: CardProgress | null;
  currentDict: DictSearchResult | null;
  isAnswerRevealed: boolean;
  isLocked: boolean;
  canUndo: boolean;
  groupProgress: {
    total: number;
    mastered: number;
    learning: number;
    testing: number;
  };
  overallProgress: {
    total: number;
    mastered: number;
  };
}

export function useStudySession(deckId: string) {
  const [deckName, setDeckName] = useState<string>('');
  const [studyMode, setStudyMode] = useState<StudyMode>('BATCH_CYCLE');
  const [allCards, setAllCards] = useState<CardProgress[]>([]);
  const [groups, setGroups] = useState<string[][]>([]);
  const [activeGroupIndex, setActiveGroupIndex] = useState<number>(0);
  const [activeQueue, setActiveQueue] = useState<CardProgress[]>([]);
  const [currentCard, setCurrentCard] = useState<CardProgress | null>(null);
  const [currentDict, setCurrentDict] = useState<DictSearchResult | null>(null);
  const [isAnswerRevealed, setIsAnswerRevealed] = useState<boolean>(false);
  const [isLocked, setIsLocked] = useState<boolean>(false);
  const [canUndo, setCanUndo] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(true);

  // 记录每个单词上次展示后，经历的“其他卡片数量”
  const reviewOrderCounterRef = useRef<number>(0);
  const cardLastSeenOrderRef = useRef<Map<string, number>>(new Map());

  // 记录用于撤销的历史快照
  const lastActionRef = useRef<{
    cardBefore: CardProgress;
    cardAfter: CardProgress;
    queueBefore: CardProgress[];
  } | null>(null);

  // 答题计时
  const questionStartTimeRef = useRef<number>(Date.now());

  // 防连续重复点击提交锁 (避免 setTimeout 触发不必要的二次渲染)
  const isSubmittingRef = useRef<boolean>(false);

  // 1. 初始化会话
  const initSession = useCallback(async () => {
    setLoading(true);
    const deck = await deckRepo.getById(deckId);
    if (!deck) {
      setLoading(false);
      return;
    }
    setDeckName(deck.name);
    const mode = deck.studyMode || 'BATCH_CYCLE';
    setStudyMode(mode);

    const cards = await cardRepo.getCardsForDeck(deckId);
    setAllCards(cards);

    const words = cards.map((c) => c.word);
    const chunkedGroups = splitIntoStudyGroups(words, mode, DEFAULT_SCHEDULER_CONFIG.groupSize);
    setGroups(chunkedGroups);

    // 找到第一个未完全通关的组
    let groupIdx = 0;
    for (let i = 0; i < chunkedGroups.length; i++) {
      const gWords = new Set(chunkedGroups[i]);
      const gCards = cards.filter((c) => gWords.has(c.word));
      if (!gCards.every((c) => c.state === CardState.MASTERED)) {
        groupIdx = i;
        break;
      }
      groupIdx = chunkedGroups.length;
    }
    setActiveGroupIndex(groupIdx);

    if (groupIdx < chunkedGroups.length) {
      setupGroupQueue(groupIdx, cards, chunkedGroups);
    }
    setLoading(false);
  }, [deckId]);

  // 辅助函数：根据间隔规则挑选并重排下一张待测卡片（纯函数，不原地变异数组）
  const pickNextCard = (
    queue: CardProgress[]
  ): { nextCard: CardProgress | null; reorderedQueue: CardProgress[] } => {
    if (queue.length === 0) {
      return { nextCard: null, reorderedQueue: [] };
    }
    if (queue.length === 1) {
      return { nextCard: queue[0], reorderedQueue: [queue[0]] };
    }

    const now = Date.now();
    const eligibleIdx = queue.findIndex((c) => {
      if (c.state !== CardState.TESTING) return true;
      if ((c.consecutiveSuccess ?? 0) === 0) return true;
      const lastOrder = cardLastSeenOrderRef.current.get(c.word) || 0;
      const otherCards = Math.max(0, reviewOrderCounterRef.current - lastOrder);
      const elapsed = now - c.lastReviewedAt;
      return (
        otherCards >= DEFAULT_SCHEDULER_CONFIG.minTestInterveningCards ||
        elapsed >= DEFAULT_SCHEDULER_CONFIG.minTestSpacingMs
      );
    });

    const pickedIndex = eligibleIdx >= 0 ? eligibleIdx : 0;
    const next = queue[pickedIndex];
    const reordered = [next, ...queue.slice(0, pickedIndex), ...queue.slice(pickedIndex + 1)];
    return { nextCard: next, reorderedQueue: reordered };
  };

  // 为指定组建立待学队列
  const setupGroupQueue = async (
    groupIdx: number,
    cards: CardProgress[],
    chunkedGroups: string[][]
  ) => {
    const groupWords = new Set(chunkedGroups[groupIdx] || []);
    const groupCards = cards.filter((c) => groupWords.has(c.word));
    const phase = getGroupPhase(groupCards);

    let queue: CardProgress[] = [];
    if (phase === 'INITIAL_LEARNING') {
      queue = groupCards.filter(
        (c) => c.state === CardState.NEW || c.state === CardState.LEARNING
      );
    } else if (phase === 'INTENSIVE_TESTING') {
      const testingCards = groupCards.filter((c) => c.state === CardState.TESTING);
      queue = shuffleArray(testingCards);
    }

    if (queue.length > 0) {
      const { nextCard, reorderedQueue } = pickNextCard(queue);
      const dict = nextCard ? await dictRepo.lookup(nextCard.word) : null;
      setActiveQueue(reorderedQueue);
      setCurrentCard(nextCard);
      setCurrentDict(dict);
      setIsAnswerRevealed(false);
      questionStartTimeRef.current = Date.now();
    } else {
      setActiveQueue([]);
      setCurrentCard(null);
      setCurrentDict(null);
      setIsAnswerRevealed(false);
    }
  };

  useEffect(() => {
    initSession();
  }, [initSession]);

  // 揭示答案
  const revealAnswer = useCallback(() => {
    if (!currentCard || isAnswerRevealed || isLocked) return;
    setIsAnswerRevealed(true);
  }, [currentCard, isAnswerRevealed, isLocked]);

  // 提交评分
  const rateCard = useCallback(
    async (rating: UserRating, options?: { bypassCooldown?: boolean }) => {
      // 若处于冷却期且用户点击了免等待，即使答案未揭示也允许作答；其他情况要求必须已翻牌
      if (
        isSubmittingRef.current ||
        !currentCard ||
        (!isAnswerRevealed && !options?.bypassCooldown) ||
        isLocked
      )
        return;

      isSubmittingRef.current = true;
      setIsLocked(true);

      try {
        const now = Date.now();
        const durationMs = Math.min(now - questionStartTimeRef.current, 60000);

        const lastSeenOrder = cardLastSeenOrderRef.current.get(currentCard.word) || 0;
        const otherCardsSinceLast = Math.max(0, reviewOrderCounterRef.current - lastSeenOrder);

        const isFirstTestInPhase2 =
          currentCard.state === CardState.TESTING && (currentCard.consecutiveSuccess ?? 0) === 0;
        const effectiveBypass = Boolean(options?.bypassCooldown || isFirstTestInPhase2);

        const transition = transitionCard(currentCard, rating, {
          now,
          otherCardsSinceLastReview: otherCardsSinceLast,
          bypassCooldown: effectiveBypass,
        });

        const updatedCard = {
          ...transition.nextCard,
          deckId,
          id: transition.nextCard.id || `${deckId}:${transition.nextCard.word}`,
        };

        if (transition.isIndependent || updatedCard.state === CardState.LEARNING) {
          reviewOrderCounterRef.current += 1;
          cardLastSeenOrderRef.current.set(currentCard.word, reviewOrderCounterRef.current);
        }

      const logEntry: ReviewLogEntry = {
        id: crypto.randomUUID(),
        word: currentCard.word,
        deckId,
        rating,
        stateBefore: currentCard.state,
        stateAfter: updatedCard.state,
        isIndependent: transition.isIndependent,
        durationMs,
        timestamp: now,
      };

      lastActionRef.current = {
        cardBefore: currentCard,
        cardAfter: updatedCard,
        queueBefore: [...activeQueue],
      };
      setCanUndo(true);

      const newAllCards = allCards.map((c) => (c.word === updatedCard.word ? updatedCard : c));

      const remainingQueue = activeQueue.slice(1);
      const groupWords = new Set(groups[activeGroupIndex] || []);
      const currentGroupCards = newAllCards.filter((c) => groupWords.has(c.word));

      // 判断本次答题前的卡片是否处于初学识记阶段 (NEW / LEARNING)
      const wasInitialLearning =
        currentCard.state === CardState.NEW || currentCard.state === CardState.LEARNING;

      let targetQueue: CardProgress[] = [];

      if (wasInitialLearning) {
        if (updatedCard.state === CardState.LEARNING) {
          const insertIdx = calculateRequeueIndex(remainingQueue.length, rating);
          remainingQueue.splice(insertIdx, 0, updatedCard);
        }

        if (remainingQueue.length === 0) {
          // 当前组初学识记队列已全部完成，全组统一进入阶段二：集中打乱独立测试
          const testingCards = currentGroupCards.filter((c) => c.state === CardState.TESTING);
          const shuffled = shuffleArray(testingCards);
          // 确保刚刚完成识记的最后一张卡片排在队尾，优先复测较早识记的卡片
          const notJustReviewed = shuffled.filter((c) => c.word !== updatedCard.word);
          targetQueue = notJustReviewed.length > 0 ? [...notJustReviewed, updatedCard] : shuffled;
        } else {
          targetQueue = remainingQueue;
        }
      } else {
        // 集中测试阶段 (INTENSIVE_TESTING)
        if (updatedCard.state === CardState.LEARNING) {
          // 答错/模糊退回初学强化池
          const insertIdx = calculateRequeueIndex(remainingQueue.length, rating);
          remainingQueue.splice(insertIdx, 0, updatedCard);
        } else if (updatedCard.state === CardState.TESTING) {
          // 仍需复测卡片排入队尾，保证其他卡片间隔
          remainingQueue.push(updatedCard);
        }
        // 若状态为 MASTERED，则自动移出活跃测试队列

        if (remainingQueue.length === 0) {
          const allMastered = currentGroupCards.every((c) => c.state === CardState.MASTERED);
          if (allMastered) {
            targetQueue = [];
          } else {
            // 仍有未通关词汇，补充下一轮测试
            const unmastered = currentGroupCards.filter((c) => c.state !== CardState.MASTERED);
            targetQueue = shuffleArray(unmastered);
          }
        } else {
          targetQueue = remainingQueue;
        }
      }

      const { nextCard, reorderedQueue } = pickNextCard(targetQueue);

      // 计算通关数（直接利用内存中已有卡片数组，毫秒级得出结果，无需遍历 IndexedDB）
      const masteredCount = newAllCards.filter((c) => c.state === CardState.MASTERED).length;

      // 并行完成持久化与下一个卡片的词典加载，保证状态切换时数据完全就绪
      const [nextDict] = await Promise.all([
        nextCard ? dictRepo.lookup(nextCard.word) : Promise.resolve(null),
        cardRepo.save(updatedCard),
        logRepo.add(logEntry),
        deckRepo.updateCounts(deckId, newAllCards.length, masteredCount),
      ]);

      // 触发后台轻量防抖同步
      syncService.triggerSyncDebounced();

      // 一次性同步更新所有 React 状态，卡片直接切换到下一张（默认未揭示），无任何中间折叠/闪屏！
      setAllCards(newAllCards);
      setActiveQueue(reorderedQueue);
      setCurrentCard(nextCard);
      setCurrentDict(nextDict);
      setIsAnswerRevealed(false);
      questionStartTimeRef.current = Date.now();
    } catch (err) {
      console.error('[useStudySession rateCard error]', err);
    } finally {
      isSubmittingRef.current = false;
      setIsLocked(false);
    }
  },
  [currentCard, isAnswerRevealed, isLocked, activeQueue, allCards, deckId, groups, activeGroupIndex]
);

  // 撤销上一步
  const undoLastAction = useCallback(async () => {
    if (!lastActionRef.current || !canUndo || isLocked) return;

    setIsLocked(true);
    const { cardBefore, queueBefore } = lastActionRef.current;
    const revertedCards = allCards.map((c) => (c.word === cardBefore.word ? cardBefore : c));
    const masteredCount = revertedCards.filter((c) => c.state === CardState.MASTERED).length;

    const [dict] = await Promise.all([
      dictRepo.lookup(cardBefore.word),
      cardRepo.save(cardBefore),
      logRepo.deleteLastLogForWord(deckId, cardBefore.word),
      deckRepo.updateCounts(deckId, revertedCards.length, masteredCount),
    ]);

    setAllCards(revertedCards);
    setActiveQueue(queueBefore);
    setCurrentCard(cardBefore);
    setCurrentDict(dict);
    setIsAnswerRevealed(true);

    lastActionRef.current = null;
    setCanUndo(false);
    setIsLocked(false);
  }, [canUndo, isLocked, deckId]);

  // 进入下一组
  const proceedToNextGroup = useCallback(() => {
    // 强校验：当前组必须所有卡片均为 MASTERED，才允许推进至下一组
    const currentWords = new Set(groups[activeGroupIndex] || []);
    const currentCards = allCards.filter((c) => currentWords.has(c.word));
    const isCurrentMastered =
      currentCards.length > 0 && currentCards.every((c) => c.state === CardState.MASTERED);

    if (!isCurrentMastered) {
      console.warn('Cannot proceed to next group: current group words are not all mastered yet.');
      return;
    }

    const nextGroupIdx = activeGroupIndex + 1;
    if (nextGroupIdx < groups.length) {
      setActiveGroupIndex(nextGroupIdx);
      setupGroupQueue(nextGroupIdx, allCards, groups);
    }
  }, [activeGroupIndex, groups, allCards]);

  // 重新复习本词表 (重置所有卡片进度并从第 1 组重新开始)
  const restartSession = useCallback(async () => {
    setLoading(true);
    await cardRepo.resetDeck(deckId);
    await deckRepo.refreshCounts(deckId);
    reviewOrderCounterRef.current = 0;
    cardLastSeenOrderRef.current.clear();
    lastActionRef.current = null;
    await initSession();
  }, [deckId, initSession]);

  const currentGroupWords = new Set(groups[activeGroupIndex] || []);
  const currentGroupCards = allCards.filter((c) => currentGroupWords.has(c.word));
  const isDeckCompleted =
    allCards.length > 0 && allCards.every((c) => c.state === CardState.MASTERED);

  const currentGroupPhase = isDeckCompleted
    ? 'DECK_COMPLETED'
    : activeGroupIndex >= groups.length
    ? 'DECK_COMPLETED'
    : getGroupPhase(currentGroupCards);

  const groupProgress = {
    total: currentGroupCards.length,
    mastered: currentGroupCards.filter((c) => c.state === CardState.MASTERED).length,
    learning: currentGroupCards.filter((c) => c.state === CardState.LEARNING || c.state === CardState.NEW).length,
    testing: currentGroupCards.filter((c) => c.state === CardState.TESTING).length,
  };

  const overallProgress = {
    total: allCards.length,
    mastered: allCards.filter((c) => c.state === CardState.MASTERED).length,
  };

  const currentCardCooldown = useMemo(() => {
    if (
      !currentCard ||
      currentCard.state !== CardState.TESTING ||
      (currentCard.consecutiveSuccess ?? 0) === 0
    ) {
      return { isCooling: false, remainingMs: 0, otherCards: 0, targetDue: 0 };
    }
    const lastSeenOrder = cardLastSeenOrderRef.current.get(currentCard.word) || 0;
    const otherCards = Math.max(0, reviewOrderCounterRef.current - lastSeenOrder);
    if (otherCards >= DEFAULT_SCHEDULER_CONFIG.minTestInterveningCards) {
      return { isCooling: false, remainingMs: 0, otherCards, targetDue: 0 };
    }
    const targetDue =
      currentCard.nextDue && currentCard.nextDue > currentCard.lastReviewedAt
        ? currentCard.nextDue
        : currentCard.lastReviewedAt + DEFAULT_SCHEDULER_CONFIG.minTestSpacingMs;
    const remainingMs = Math.max(0, targetDue - Date.now());
    return {
      isCooling: remainingMs > 0,
      remainingMs,
      otherCards,
      targetDue,
    };
  }, [currentCard, reviewOrderCounterRef.current]);

  return {
    loading,
    deckName,
    studyMode,
    totalCardsCount: allCards.length,
    allCards,
    currentGroupIndex: activeGroupIndex,
    totalGroupsCount: groups.length,
    groupPhase: currentGroupPhase,
    currentCard,
    currentDict,
    currentCardCooldown,
    isAnswerRevealed,
    isLocked,
    canUndo,
    groupProgress,
    overallProgress,
    revealAnswer,
    rateCard,
    undoLastAction,
    proceedToNextGroup,
    restartSession,
  };
}