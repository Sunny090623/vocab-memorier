import { describe, it, expect } from 'vitest';
import { CardState, UserRating, CardProgress } from '../../src/core/scheduler/types.ts';
import { transitionCard } from '../../src/core/scheduler/stateMachine.ts';
import { getGroupPhase, shuffleArray } from '../../src/core/scheduler/groupManager.ts';
import { calculateRequeueIndex } from '../../src/core/scheduler/spacingRules.ts';

describe('15 Words Full Pass Session Simulation', () => {
  it('simulates passing 15 words with GOOD ratings all the way to MASTERED', () => {
    const words = [
      'convert', 'conversion', 'convertible', 'criticism', 'criticize',
      'cultivate', 'cultivation', 'cultivator', 'dramaturge', 'dramaturgy',
      'hydrogen', 'hydrogenated', 'ecological', 'ecologist', 'imitate'
    ];

    let allCards: CardProgress[] = words.map(w => ({
      word: w,
      state: CardState.NEW,
      step: 0,
      consecutiveSuccess: 0,
      lapseCount: 0,
      reps: 0,
      lastReviewedAt: 0,
      nextDue: 0,
    }));

    let activeQueue: CardProgress[] = [...allCards];
    let reviewOrderCounter = 0;
    const cardLastSeenOrder = new Map<string, number>();

    let steps = 0;
    const MAX_STEPS = 200;
    let now = 1000;

    while (activeQueue.length > 0 && steps < MAX_STEPS) {
      steps++;
      const currentCard = activeQueue[0];
      now += 2000; // 假设每 2 秒回答一张卡片

      const lastSeenOrder = cardLastSeenOrder.get(currentCard.word) || 0;
      const otherCardsSinceLast = Math.max(0, reviewOrderCounter - lastSeenOrder);

      const transition = transitionCard(currentCard, UserRating.GOOD, {
        now,
        otherCardsSinceLastReview: otherCardsSinceLast,
      });

      const updatedCard = transition.nextCard;
      reviewOrderCounter++;
      cardLastSeenOrder.set(currentCard.word, reviewOrderCounter);

      allCards = allCards.map(c => c.word === updatedCard.word ? updatedCard : c);

      const wasInitialLearning = currentCard.state === CardState.NEW || currentCard.state === CardState.LEARNING;
      const remainingQueue = activeQueue.slice(1);

      if (wasInitialLearning) {
        if (updatedCard.state === CardState.LEARNING) {
          const insertIdx = calculateRequeueIndex(remainingQueue.length, UserRating.GOOD);
          remainingQueue.splice(insertIdx, 0, updatedCard);
        }

        if (remainingQueue.length === 0) {
          // 初学阶段全部完成，整组转入测试阶段
          const testingCards = allCards.filter(c => c.state === CardState.TESTING);
          activeQueue = testingCards;
        } else {
          activeQueue = remainingQueue;
        }
      } else {
        // 测试阶段
        if (updatedCard.state === CardState.LEARNING) {
          const insertIdx = calculateRequeueIndex(remainingQueue.length, UserRating.GOOD);
          remainingQueue.splice(insertIdx, 0, updatedCard);
        } else if (updatedCard.state === CardState.TESTING) {
          // 放入测试队列尾部，保证一整轮其他卡片展示之后再复测
          remainingQueue.push(updatedCard);
        }

        if (remainingQueue.length === 0) {
          const unmastered = allCards.filter(c => c.state !== CardState.MASTERED);
          activeQueue = unmastered;
        } else {
          activeQueue = remainingQueue;
        }
      }

      console.log(`Step ${steps}: "${currentCard.word}" [${currentCard.state}->${updatedCard.state}] isIndep=${transition.isIndependent} streak=${updatedCard.consecutiveSuccess} remQueue=${activeQueue.length}`);

      if (allCards.every(c => c.state === CardState.MASTERED)) {
        console.log(`>>> ALL 15 CARDS MASTERED at step ${steps}!`);
        break;
      }
    }

    console.log(`Finished after ${steps} steps. Mastered: ${allCards.filter(c => c.state === CardState.MASTERED).length}/${allCards.length}`);
    expect(allCards.every(c => c.state === CardState.MASTERED)).toBe(true);
    expect(steps).toBe(60);
  });
});

