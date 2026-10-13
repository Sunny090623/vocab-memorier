import { userDb } from '../db/userDb.ts';
import { ReviewLogEntry } from '../../core/scheduler/types.ts';

export const logRepo = {
  async add(log: ReviewLogEntry): Promise<void> {
    await userDb.logs.add(log);
  },

  async getLogsForDeck(deckId: string): Promise<ReviewLogEntry[]> {
    return userDb.logs.where('deckId').equals(deckId).toArray();
  },

  async deleteLastLogForWord(deckId: string, word: string): Promise<ReviewLogEntry | undefined> {
    const logs = await userDb.logs.where('deckId').equals(deckId).toArray();
    const wordLogs = logs
      .filter((l) => l.word === word)
      .sort((a, b) => b.timestamp - a.timestamp);
    if (wordLogs.length > 0) {
      const last = wordLogs[0];
      await userDb.logs.delete(last.id);
      return last;
    }
    return undefined;
  },
};