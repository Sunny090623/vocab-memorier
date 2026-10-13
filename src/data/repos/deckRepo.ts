import { userDb } from '../db/userDb.ts';
import { DeckRecord, DeckMemberRecord, StudyMode } from '../db/schema.ts';
import { CardState, CardProgress } from '../../core/scheduler/types.ts';

export const deckRepo = {
  async getAll(): Promise<DeckRecord[]> {
    return userDb.decks.orderBy('createdAt').reverse().toArray();
  },

  async getById(id: string): Promise<DeckRecord | undefined> {
    return userDb.decks.get(id);
  },

  async create(name: string, description?: string, studyMode: StudyMode = 'BATCH_CYCLE'): Promise<DeckRecord> {
    const now = Date.now();
    const deck: DeckRecord = {
      id: crypto.randomUUID(),
      name: name.trim(),
      description: description?.trim(),
      studyMode,
      wordCount: 0,
      masteredCount: 0,
      createdAt: now,
      updatedAt: now,
    };
    await userDb.decks.add(deck);
    return deck;
  },

  async rename(id: string, newName: string): Promise<void> {
    await userDb.decks.update(id, {
      name: newName.trim(),
      updatedAt: Date.now(),
    });
  },

  async updateStudyMode(id: string, studyMode: StudyMode): Promise<void> {
    await userDb.decks.update(id, {
      studyMode,
      updatedAt: Date.now(),
    });
  },

  async delete(id: string): Promise<void> {
    await userDb.transaction('rw', [userDb.decks, userDb.deckMembers, userDb.cards, userDb.logs], async () => {
      await userDb.decks.delete(id);
      await userDb.deckMembers.where('deckId').equals(id).delete();
      await userDb.cards.where('deckId').equals(id).delete();
      await userDb.logs.where('deckId').equals(id).delete();
    });
  },

  /**
   * 将单词批量添加进指定单词本
   * 自动去重、建立归属关联、对新词初始化学习进度（不重置本单词本已有的有效进度）
   */
  async addWordsToDeck(deckId: string, words: string[]): Promise<{ addedCount: number; duplicateCount: number }> {
    return userDb.transaction('rw', [userDb.decks, userDb.deckMembers, userDb.cards], async () => {
      const [existingMembers, existingCards] = await Promise.all([
        userDb.deckMembers.where('deckId').equals(deckId).toArray(),
        userDb.cards.where('deckId').equals(deckId).toArray(),
      ]);

      const existingWordSet = new Set(existingMembers.map((m) => m.word));
      const existingCardIdSet = new Set(existingCards.map((c) => c.id));

      let currentOrder = existingMembers.length;
      const newMembers: DeckMemberRecord[] = [];
      const newCards: CardProgress[] = [];
      let duplicateCount = 0;
      const now = Date.now();

      for (const w of words) {
        const lower = w.trim().toLowerCase();
        if (!lower) continue;

        if (existingWordSet.has(lower)) {
          duplicateCount++;
          continue;
        }

        existingWordSet.add(lower);
        const cardId = `${deckId}:${lower}`;
        newMembers.push({
          id: cardId,
          deckId,
          word: lower,
          sortOrder: currentOrder++,
          addedAt: now,
        });

        // 内存集合 O(1) 检查，避免单条循环查询 IndexedDB
        if (!existingCardIdSet.has(cardId)) {
          existingCardIdSet.add(cardId);
          newCards.push({
            id: cardId,
            deckId,
            word: lower,
            state: CardState.NEW,
            step: 0,
            consecutiveSuccess: 0,
            lapseCount: 0,
            reps: 0,
            lastReviewedAt: 0,
            nextDue: 0,
          });
        }
      }

      if (newMembers.length > 0) {
        await userDb.deckMembers.bulkAdd(newMembers);
      }
      if (newCards.length > 0) {
        await userDb.cards.bulkAdd(newCards);
      }

      // 计算已通关数与总词数并更新
      const totalCount = existingMembers.length + newMembers.length;
      const masteredCount = existingCards.filter((c) => c.state === CardState.MASTERED).length;

      await userDb.decks.update(deckId, {
        wordCount: totalCount,
        masteredCount,
        updatedAt: now,
      });

      return {
        addedCount: newMembers.length,
        duplicateCount,
      };
    });
  },

  /**
   * 刷新单词本的统计计数 (wordCount, masteredCount)
   */
  async refreshCounts(deckId: string): Promise<void> {
    const cards = await userDb.cards.where('deckId').equals(deckId).toArray();
    const masteredCount = cards.filter((c) => c.state === CardState.MASTERED).length;

    await userDb.decks.update(deckId, {
      wordCount: cards.length,
      masteredCount,
      updatedAt: Date.now(),
    });
  },

  /**
   * 高性能更新计数（调用方已有内存卡片数据时直接更新，避免扫表）
   */
  async updateCounts(deckId: string, wordCount: number, masteredCount: number): Promise<void> {
    await userDb.decks.update(deckId, {
      wordCount,
      masteredCount,
      updatedAt: Date.now(),
    });
  },
};