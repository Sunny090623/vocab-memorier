import { z } from 'zod';
import { userDb } from '../db/userDb.ts';
import { CardState, UserRating } from '../../core/scheduler/types.ts';

export const BackupSchema = z.object({
  version: z.literal(1),
  exportedAt: z.number(),
  decks: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      description: z.string().optional(),
      wordCount: z.number(),
      masteredCount: z.number(),
      createdAt: z.number(),
      updatedAt: z.number(),
    })
  ),
  deckMembers: z.array(
    z.object({
      id: z.string(),
      deckId: z.string(),
      word: z.string(),
      sortOrder: z.number(),
      addedAt: z.number(),
    })
  ),
  cards: z.array(
    z.object({
      id: z.string().optional(),
      deckId: z.string().optional(),
      word: z.string(),
      state: z.nativeEnum(CardState),
      step: z.number(),
      consecutiveSuccess: z.number(),
      lapseCount: z.number(),
      reps: z.number(),
      lastReviewedAt: z.number(),
      nextDue: z.number(),
      masteredAt: z.number().optional(),
    })
  ),
  logs: z.array(
    z.object({
      id: z.string(),
      word: z.string(),
      deckId: z.string(),
      rating: z.nativeEnum(UserRating),
      stateBefore: z.nativeEnum(CardState),
      stateAfter: z.nativeEnum(CardState),
      isIndependent: z.boolean(),
      durationMs: z.number(),
      timestamp: z.number(),
    })
  ),
});

export type BackupData = z.infer<typeof BackupSchema>;

export async function exportUserBackup(): Promise<string> {
  const decks = await userDb.decks.toArray();
  const deckMembers = await userDb.deckMembers.toArray();
  const cards = await userDb.cards.toArray();
  const logs = await userDb.logs.toArray();

  const data: BackupData = {
    version: 1,
    exportedAt: Date.now(),
    decks,
    deckMembers,
    cards,
    logs,
  };

  return JSON.stringify(data, null, 2);
}

export async function importUserBackup(jsonString: string): Promise<{ success: boolean; decksCount: number }> {
  const parsed = JSON.parse(jsonString);
  const validated = BackupSchema.parse(parsed);

  await userDb.transaction('rw', [userDb.decks, userDb.deckMembers, userDb.cards, userDb.logs], async () => {
    await userDb.decks.clear();
    await userDb.deckMembers.clear();
    await userDb.cards.clear();
    await userDb.logs.clear();

    const cardsToInsert = validated.cards.map((c) => ({
      ...c,
      id: c.id || `${c.deckId || validated.decks[0]?.id || 'default'}:${c.word}`,
      deckId: c.deckId || validated.decks[0]?.id || 'default',
    }));

    await userDb.decks.bulkAdd(validated.decks);
    await userDb.deckMembers.bulkAdd(validated.deckMembers);
    await userDb.cards.bulkAdd(cardsToInsert);
    await userDb.logs.bulkAdd(validated.logs);
  });

  return {
    success: true,
    decksCount: validated.decks.length,
  };
}