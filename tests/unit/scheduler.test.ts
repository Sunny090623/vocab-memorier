import { describe, it, expect } from 'vitest';
import { CardState, UserRating, CardProgress } from '../../src/core/scheduler/types.ts';
import { isIndependentTest, calculateRequeueIndex } from '../../src/core/scheduler/spacingRules.ts';
import { transitionCard } from '../../src/core/scheduler/stateMachine.ts';
import { splitIntoStudyGroups, getGroupPhase } from '../../src/core/scheduler/groupManager.ts';

describe('Scheduler Spacing & Independence Rules', () => {
  it('should strictly use OR condition for test independence', () => {
    // Condition 1: otherCards >= 8 even if elapsedMs < 90s -> TRUE
    expect(isIndependentTest(8, 5000)).toBe(true);
    expect(isIndependentTest(10, 20000)).toBe(true);

    // Condition 2: elapsedMs >= 90,000 even if otherCards < 8 -> TRUE
    expect(isIndependentTest(2, 91000)).toBe(true);
    expect(isIndependentTest(0, 100000)).toBe(true);

    // Neither satisfied -> FALSE
    expect(isIndependentTest(5, 45000)).toBe(false);
    expect(isIndependentTest(0, 0)).toBe(false);
  });

  it('should calculate requeue offset to avoid immediate repetition', () => {
    expect(calculateRequeueIndex(10, UserRating.AGAIN)).toBe(3);
    expect(calculateRequeueIndex(10, UserRating.HARD)).toBe(5);

    // When queue is shorter than offset, place at end (never 0 if length > 0)
    expect(calculateRequeueIndex(2, UserRating.AGAIN)).toBe(2);
    expect(calculateRequeueIndex(1, UserRating.AGAIN)).toBe(1);
    expect(calculateRequeueIndex(0, UserRating.AGAIN)).toBe(0);
  });
});

describe('Scheduler State Machine', () => {
  const baseCard: CardProgress = {
    word: 'apple',
    state: CardState.NEW,
    step: 0,
    consecutiveSuccess: 0,
    lapseCount: 0,
    reps: 0,
    lastReviewedAt: 0,
    nextDue: 0,
  };

  it('transitions NEW -> LEARNING with AGAIN or GOOD', () => {
    const resAgain = transitionCard(baseCard, UserRating.AGAIN, {
      now: 1000,
      otherCardsSinceLastReview: 0,
    });
    expect(resAgain.nextCard.state).toBe(CardState.LEARNING);
    expect(resAgain.nextCard.step).toBe(0);

    const resGood = transitionCard(baseCard, UserRating.GOOD, {
      now: 1000,
      otherCardsSinceLastReview: 0,
    });
    expect(resGood.nextCard.state).toBe(CardState.LEARNING);
    expect(resGood.nextCard.step).toBe(1);
  });

  it('graduates LEARNING (step 1) -> TESTING on GOOD', () => {
    const learningCard: CardProgress = {
      ...baseCard,
      state: CardState.LEARNING,
      step: 1,
      lastReviewedAt: 1000,
    };

    const res = transitionCard(learningCard, UserRating.GOOD, {
      now: 2000,
      otherCardsSinceLastReview: 0,
    });
    expect(res.nextCard.state).toBe(CardState.TESTING);
    expect(res.nextCard.consecutiveSuccess).toBe(0);
  });

  it('handles early test (not independent): updates time but DOES NOT increment pass streak', () => {
    const testingCard: CardProgress = {
      ...baseCard,
      state: CardState.TESTING,
      consecutiveSuccess: 0,
      lastReviewedAt: 10000,
    };

    // Early test: only 3 intervening cards and only 20 seconds elapsed
    const res = transitionCard(testingCard, UserRating.GOOD, {
      now: 30000,
      otherCardsSinceLastReview: 3,
    });

    expect(res.isIndependent).toBe(false);
    expect(res.nextCard.consecutiveSuccess).toBe(0); // MUST NOT increment
    expect(res.nextCard.state).toBe(CardState.TESTING); // MUST NOT master
    expect(res.nextCard.lastReviewedAt).toBe(30000); // Updated review time
  });

  it('handles independent test: increments streak and masters on consecutive independent passes', () => {
    const testingCard: CardProgress = {
      ...baseCard,
      state: CardState.TESTING,
      consecutiveSuccess: 0,
      lastReviewedAt: 10000,
    };

    // First independent test pass: 8 intervening cards
    const res1 = transitionCard(testingCard, UserRating.GOOD, {
      now: 20000,
      otherCardsSinceLastReview: 8,
    });
    expect(res1.isIndependent).toBe(true);
    expect(res1.nextCard.consecutiveSuccess).toBe(1);
    expect(res1.nextCard.state).toBe(CardState.TESTING);

    // Second independent test pass: 95 seconds elapsed
    const res2 = transitionCard(res1.nextCard, UserRating.GOOD, {
      now: 120000,
      otherCardsSinceLastReview: 2,
    });
    expect(res2.isIndependent).toBe(true);
    expect(res2.nextCard.consecutiveSuccess).toBe(2);
    expect(res2.nextCard.state).toBe(CardState.MASTERED);
    expect(res2.nextCard.masteredAt).toBe(120000);
  });

  it('resets streak and lapses back to LEARNING if answered AGAIN in TESTING', () => {
    const testingCard: CardProgress = {
      ...baseCard,
      state: CardState.TESTING,
      consecutiveSuccess: 1,
      lapseCount: 0,
      lastReviewedAt: 10000,
    };

    const res = transitionCard(testingCard, UserRating.AGAIN, {
      now: 20000,
      otherCardsSinceLastReview: 10,
    });

    expect(res.nextCard.state).toBe(CardState.LEARNING);
    expect(res.nextCard.step).toBe(0);
    expect(res.nextCard.consecutiveSuccess).toBe(0);
    expect(res.nextCard.lapseCount).toBe(1);
  });
});

describe('Group Manager', () => {
  it('keeps lists <= 30 words in a single group (Full Deck mode)', () => {
    const words15 = Array.from({ length: 15 }, (_, i) => `w${i}`);
    const groups15 = splitIntoStudyGroups(words15);
    expect(groups15.length).toBe(1);
    expect(groups15[0].length).toBe(15);

    const words30 = Array.from({ length: 30 }, (_, i) => `w${i}`);
    const groups30 = splitIntoStudyGroups(words30);
    expect(groups30.length).toBe(1);
    expect(groups30[0].length).toBe(30);
  });

  it('splits lists > 30 words into groups of default 20 in AUTO mode', () => {
    const words55 = Array.from({ length: 55 }, (_, i) => `w${i}`);
    const groups = splitIntoStudyGroups(words55);
    expect(groups.length).toBe(3);
    expect(groups[0].length).toBe(20);
    expect(groups[1].length).toBe(20);
    expect(groups[2].length).toBe(15);
  });

  it('explicit BATCH_CYCLE mode splits 21 words into 20 + 1 batches regardless of 30-word threshold', () => {
    const words21 = Array.from({ length: 21 }, (_, i) => `w${i}`);
    const groups = splitIntoStudyGroups(words21, 'BATCH_CYCLE');
    expect(groups.length).toBe(2);
    expect(groups[0].length).toBe(20);
    expect(groups[1].length).toBe(1);
  });

  it('explicit FULL_DECK mode keeps all words in a single group even if > 30 words', () => {
    const words50 = Array.from({ length: 50 }, (_, i) => `w${i}`);
    const groups = splitIntoStudyGroups(words50, 'FULL_DECK');
    expect(groups.length).toBe(1);
    expect(groups[0].length).toBe(50);
  });

  it('correctly reports group phase', () => {
    const cards: CardProgress[] = [
      { word: 'a', state: CardState.NEW, step: 0, consecutiveSuccess: 0, lapseCount: 0, reps: 0, lastReviewedAt: 0, nextDue: 0 },
      { word: 'b', state: CardState.LEARNING, step: 1, consecutiveSuccess: 0, lapseCount: 0, reps: 0, lastReviewedAt: 0, nextDue: 0 },
    ];
    expect(getGroupPhase(cards)).toBe('INITIAL_LEARNING');

    cards[0].state = CardState.TESTING;
    cards[1].state = CardState.TESTING;
    expect(getGroupPhase(cards)).toBe('INTENSIVE_TESTING');

    cards[0].state = CardState.MASTERED;
    cards[1].state = CardState.MASTERED;
    expect(getGroupPhase(cards)).toBe('GROUP_COMPLETED');
  });
});