import { describe, it, expect } from 'vitest';
import { CardState, UserRating, CardProgress, ReviewLogEntry } from '../../src/core/scheduler/types.ts';
import { calculateDeckStats } from '../../src/core/stats/calculator.ts';

describe('Deck Stats Calculator', () => {
  it('calculates mastery, remaining, accuracy and lapse words correctly', () => {
    const cards: CardProgress[] = [
      { word: 'apple', state: CardState.MASTERED, step: 0, consecutiveSuccess: 2, lapseCount: 1, reps: 5, lastReviewedAt: 0, nextDue: 0 },
      { word: 'banana', state: CardState.TESTING, step: 0, consecutiveSuccess: 1, lapseCount: 0, reps: 3, lastReviewedAt: 0, nextDue: 0 },
      { word: 'cherry', state: CardState.LEARNING, step: 1, consecutiveSuccess: 0, lapseCount: 2, reps: 4, lastReviewedAt: 0, nextDue: 0 },
      { word: 'date', state: CardState.NEW, step: 0, consecutiveSuccess: 0, lapseCount: 0, reps: 0, lastReviewedAt: 0, nextDue: 0 },
    ];

    const logs: ReviewLogEntry[] = [
      { id: '1', word: 'apple', deckId: 'd', rating: UserRating.GOOD, stateBefore: CardState.TESTING, stateAfter: CardState.TESTING, isIndependent: true, durationMs: 2000, timestamp: 1 },
      { id: '2', word: 'apple', deckId: 'd', rating: UserRating.GOOD, stateBefore: CardState.TESTING, stateAfter: CardState.MASTERED, isIndependent: true, durationMs: 3000, timestamp: 2 },
      { id: '3', word: 'cherry', deckId: 'd', rating: UserRating.AGAIN, stateBefore: CardState.TESTING, stateAfter: CardState.LEARNING, isIndependent: true, durationMs: 4000, timestamp: 3 },
    ];

    const stats = calculateDeckStats(cards, logs);
    expect(stats.totalWords).toBe(4);
    expect(stats.masteredWords).toBe(1);
    expect(stats.remainingWords).toBe(3);
    expect(stats.learningWords).toBe(1);
    expect(stats.testingWords).toBe(1);
    expect(stats.unseenWords).toBe(1);

    // Testing accuracy: 2 GOOD out of 3 = 67%
    expect(stats.accuracyPercent).toBe(67);
    expect(stats.avgDurationSec).toBe(3); // (2000 + 3000 + 4000) / 3 / 1000 = 3.0s

    // Lapse words
    expect(stats.lapseWords.length).toBe(2);
    expect(stats.lapseWords[0].word).toBe('cherry'); // lapseCount 2
    expect(stats.lapseWords[1].word).toBe('apple');  // lapseCount 1
  });
});