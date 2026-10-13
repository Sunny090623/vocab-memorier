import Dexie, { type EntityTable } from 'dexie';
import { DeckRecord, DeckMemberRecord } from './schema.ts';
import { CardProgress, CardState, ReviewLogEntry } from '../../core/scheduler/types.ts';

export class UserDatabase extends Dexie {
  decks!: EntityTable<DeckRecord, 'id'>;
  deckMembers!: EntityTable<DeckMemberRecord, 'id'>;
  cards!: EntityTable<CardProgress, 'id'>;
  logs!: EntityTable<ReviewLogEntry, 'id'>;

  constructor() {
    super('vocab-memorier-user');
    this.version(1).stores({
      decks: 'id, name, createdAt, updatedAt',
      deckMembers: 'id, deckId, word, sortOrder',
      cards: 'word, state, nextDue, lastReviewedAt',
      logs: 'id, deckId, word, timestamp',
    });

    this.version(2).stores({
      cards: null,
    });

    this.version(3).stores({
      decks: 'id, name, createdAt, updatedAt',
      deckMembers: 'id, deckId, word, sortOrder',
      cards: 'id, deckId, word, state, nextDue, lastReviewedAt',
      logs: 'id, deckId, word, timestamp',
    }).upgrade(async (tx) => {
      const members = await tx.table('deckMembers').toArray();
      const newCards: CardProgress[] = members.map((m) => ({
        id: `${m.deckId}:${m.word}`,
        deckId: m.deckId,
        word: m.word,
        state: CardState.NEW,
        step: 0,
        consecutiveSuccess: 0,
        lapseCount: 0,
        reps: 0,
        lastReviewedAt: 0,
        nextDue: 0,
      }));
      if (newCards.length > 0) {
        await tx.table('cards').bulkAdd(newCards);
      }
    });
  }
}

export const userDb = new UserDatabase();