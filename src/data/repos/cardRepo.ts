import { userDb } from '../db/userDb.ts';
import { CardProgress, CardState } from '../../core/scheduler/types.ts';

export const cardRepo = {
  async getByWord(word: string, deckId?: string): Promise<CardProgress | undefined> {
    const lower = word.trim().toLowerCase();
    if (deckId) {
      return userDb.cards.get(`${deckId}:${lower}`);
    }
    return userDb.cards.where('word').equals(lower).first();
  },

  async getCardsForDeck(deckId: string): Promise<CardProgress[]> {
    const members = await userDb.deckMembers.where('deckId').equals(deckId).sortBy('sortOrder');
    const words = members.map((m) => m.word);
    if (words.length === 0) return [];

    const memberIds = words.map((w) => `${deckId}:${w}`);
    const cardMap = new Map<string, CardProgress>();
    const cards = await userDb.cards.where('id').anyOf(memberIds).toArray();
    for (const c of cards) {
      cardMap.set(c.word, c);
    }

    // 按原始 sortOrder 顺序返回
    const result: CardProgress[] = [];
    const missingCards: CardProgress[] = [];

    for (const m of members) {
      const card = cardMap.get(m.word);
      if (card) {
        result.push(card);
      } else {
        // 兜底新建
        const newCard: CardProgress = {
          id: `${deckId}:${m.word}`,
          deckId,
          word: m.word,
          state: CardState.NEW,
          step: 0,
          consecutiveSuccess: 0,
          lapseCount: 0,
          reps: 0,
          lastReviewedAt: 0,
          nextDue: 0,
        };
        result.push(newCard);
        missingCards.push(newCard);
      }
    }

    if (missingCards.length > 0) {
      await userDb.cards.bulkPut(missingCards);
    }

    return result;
  },

  async save(card: CardProgress): Promise<void> {
    if (!card.id && card.deckId) {
      card.id = `${card.deckId}:${card.word}`;
    }
    await userDb.cards.put(card);
  },

  async reset(word: string, deckId?: string): Promise<void> {
    const lower = word.trim().toLowerCase();
    if (deckId) {
      await userDb.cards.update(`${deckId}:${lower}`, {
        state: CardState.NEW,
        step: 0,
        consecutiveSuccess: 0,
        lapseCount: 0,
        reps: 0,
        lastReviewedAt: 0,
        nextDue: 0,
        masteredAt: undefined,
      });
    } else {
      const card = await userDb.cards.where('word').equals(lower).first();
      if (card && card.id) {
        await userDb.cards.update(card.id, {
          state: CardState.NEW,
          step: 0,
          consecutiveSuccess: 0,
          lapseCount: 0,
          reps: 0,
          lastReviewedAt: 0,
          nextDue: 0,
          masteredAt: undefined,
        });
      }
    }
  },

  async resetDeck(deckId: string): Promise<void> {
    const members = await userDb.deckMembers.where('deckId').equals(deckId).toArray();
    const memberIds = members.map((m) => `${deckId}:${m.word}`);
    const cards = await userDb.cards.where('id').anyOf(memberIds).toArray();
    const resetCards = cards.map((c) => ({
      ...c,
      state: CardState.NEW,
      step: 0,
      consecutiveSuccess: 0,
      lapseCount: 0,
      reps: 0,
      lastReviewedAt: 0,
      nextDue: 0,
      masteredAt: undefined,
    }));
    if (resetCards.length > 0) {
      await userDb.cards.bulkPut(resetCards);
    }
  },
};