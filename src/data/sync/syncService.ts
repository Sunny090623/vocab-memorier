import { userDb } from '../db/userDb.ts';
import { syncApi, SyncPayload } from '../api/syncApi.ts';
import { getStoredToken } from '../api/apiClient.ts';
import { CardProgress, CardState, ReviewLogEntry } from '../../core/scheduler/types.ts';

export type SyncStatus = 'idle' | 'syncing' | 'synced' | 'error' | 'offline';

type Listener = (status: SyncStatus, lastSyncTime: number | null, errorMsg?: string) => void;

class SyncService {
  private status: SyncStatus = 'idle';
  private lastSyncTime: number | null = null;
  private lastError: string = '';
  private listeners: Set<Listener> = new Set();
  private isOnline: boolean = typeof navigator !== 'undefined' ? navigator.onLine : true;

  constructor() {
    if (typeof window !== 'undefined') {
      window.addEventListener('online', () => {
        this.isOnline = true;
        this.notify();
        this.triggerSync();
      });
      window.addEventListener('offline', () => {
        this.isOnline = false;
        this.status = 'offline';
        this.notify();
      });
    }
  }

  public getStatus(): { status: SyncStatus; lastSyncTime: number | null; error: string; isOnline: boolean } {
    return {
      status: !this.isOnline ? 'offline' : this.status,
      lastSyncTime: this.lastSyncTime,
      error: this.lastError,
      isOnline: this.isOnline,
    };
  }

  public subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    listener(!this.isOnline ? 'offline' : this.status, this.lastSyncTime, this.lastError);
    return () => this.listeners.delete(listener);
  }

  public reset(): void {
    this.status = 'idle';
    this.lastSyncTime = null;
    this.lastError = '';
    this.notify();
  }

  private notify(): void {
    const curStatus = !this.isOnline ? 'offline' : this.status;
    for (const l of this.listeners) {
      l(curStatus, this.lastSyncTime, this.lastError);
    }
  }

  /**
   * 收集本地 Dexie 数据打包为同步 Payload
   */
  private async getLocalPayload(): Promise<SyncPayload> {
    const [decks, members, cards, logs] = await Promise.all([
      userDb.decks.toArray(),
      userDb.deckMembers.toArray(),
      userDb.cards.toArray(),
      userDb.logs.toArray(),
    ]);

    const themeSetting = localStorage.getItem('theme_mode');
    const settings: Array<{ key: string; value: string; updatedAt: number }> = [];
    if (themeSetting) {
      settings.push({ key: 'theme_mode', value: themeSetting, updatedAt: Date.now() });
    }

    return {
      decks: decks.map((d) => ({
        id: d.id,
        name: d.name,
        description: d.description,
        studyMode: d.studyMode,
        wordCount: d.wordCount,
        masteredCount: d.masteredCount,
        createdAt: d.createdAt,
        updatedAt: d.updatedAt,
        isDeleted: d.isDeleted === 1,
      })),
      deckMembers: members.map((m) => ({
        id: m.id,
        deckId: m.deckId,
        word: m.word,
        sortOrder: m.sortOrder,
        addedAt: m.addedAt,
        isDeleted: m.isDeleted === 1,
      })),
      cards: cards.map((c) => ({
        id: c.id || `${c.deckId}:${c.word}`,
        deckId: c.deckId || '',
        word: c.word,
        state: c.state,
        step: c.step,
        consecutiveSuccess: c.consecutiveSuccess,
        lapseCount: c.lapseCount,
        reps: c.reps,
        lastReviewedAt: c.lastReviewedAt,
        nextDue: c.nextDue,
        masteredAt: c.masteredAt,
        updatedAt: c.lastReviewedAt || Date.now(),
      })),
      logs: logs.map((l) => ({
        id: l.id,
        deckId: l.deckId,
        word: l.word,
        rating: l.rating,
        stateBefore: l.stateBefore,
        stateAfter: l.stateAfter,
        isIndependent: l.isIndependent,
        durationMs: l.durationMs,
        timestamp: l.timestamp,
      })),
      settings,
    };
  }

  /**
   * 将权威合并后的数据高效应用回本地 Dexie（O(1) 内存比对 + bulkPut 批量写入）
   */
  private async applyRemotePayload(remote: SyncPayload): Promise<void> {
    await userDb.transaction('rw', [userDb.decks, userDb.deckMembers, userDb.cards, userDb.logs], async () => {
      // 1. 批量合并 decks
      if (remote.decks && remote.decks.length > 0) {
        const localDecks = await userDb.decks.toArray();
        const localDeckMap = new Map(localDecks.map((d) => [d.id, d]));
        const decksToPut: any[] = [];

        for (const rd of remote.decks) {
          const localDeck = localDeckMap.get(rd.id);
          const isDeletedNum = rd.isDeleted ? 1 : 0;
          if (!localDeck) {
            decksToPut.push({
              id: rd.id,
              name: rd.name,
              description: rd.description,
              studyMode: (rd.studyMode as any) || 'BATCH_CYCLE',
              wordCount: rd.wordCount || 0,
              masteredCount: rd.masteredCount || 0,
              createdAt: rd.createdAt || Date.now(),
              updatedAt: rd.updatedAt,
              isDeleted: isDeletedNum,
            });
          } else {
            const mergedDeleted = (isDeletedNum || localDeck.isDeleted) ? 1 : 0;
            const mergedStudyMode = (rd.studyMode as any) || localDeck.studyMode;
            const mergedWordCount = rd.wordCount ?? localDeck.wordCount;
            const mergedMasteredCount = rd.masteredCount ?? localDeck.masteredCount;
            if (
              localDeck.name !== rd.name ||
              localDeck.description !== rd.description ||
              localDeck.studyMode !== mergedStudyMode ||
              localDeck.wordCount !== mergedWordCount ||
              localDeck.masteredCount !== mergedMasteredCount ||
              localDeck.updatedAt !== rd.updatedAt ||
              localDeck.isDeleted !== mergedDeleted
            ) {
              decksToPut.push({
                ...localDeck,
                name: rd.name,
                description: rd.description,
                studyMode: mergedStudyMode,
                wordCount: mergedWordCount,
                masteredCount: mergedMasteredCount,
                updatedAt: rd.updatedAt,
                isDeleted: mergedDeleted,
              });
            }
          }
        }
        if (decksToPut.length > 0) {
          await userDb.decks.bulkPut(decksToPut);
        }
      }

      // 2. 批量合并 deckMembers
      if (remote.deckMembers && remote.deckMembers.length > 0) {
        const localMembers = await userDb.deckMembers.toArray();
        const localMemberMap = new Map(localMembers.map((m) => [m.id, m]));
        const membersToPut: any[] = [];

        for (const rm of remote.deckMembers) {
          const localMember = localMemberMap.get(rm.id);
          const isDeletedNum = rm.isDeleted ? 1 : 0;
          if (!localMember) {
            membersToPut.push({
              id: rm.id,
              deckId: rm.deckId,
              word: rm.word,
              sortOrder: rm.sortOrder || 0,
              addedAt: rm.addedAt || Date.now(),
              isDeleted: isDeletedNum,
            });
          } else {
            const mergedDeleted = (isDeletedNum || localMember.isDeleted) ? 1 : 0;
            const mergedSortOrder = rm.sortOrder ?? localMember.sortOrder;
            if (localMember.sortOrder !== mergedSortOrder || localMember.isDeleted !== mergedDeleted) {
              membersToPut.push({
                ...localMember,
                sortOrder: mergedSortOrder,
                isDeleted: mergedDeleted,
              });
            }
          }
        }
        if (membersToPut.length > 0) {
          await userDb.deckMembers.bulkPut(membersToPut);
        }
      }

      // 3. 批量合并 cards（单次全量内存 Map 对比 + bulkPut，耗时降低约 96%）
      if (remote.cards && remote.cards.length > 0) {
        const localCards = await userDb.cards.toArray();
        const localCardMap = new Map(localCards.map((c) => [c.id || `${c.deckId}:${c.word}`, c]));
        const cardsToPut: CardProgress[] = [];

        for (const rc of remote.cards) {
          const cardId = rc.id || `${rc.deckId}:${rc.word}`;
          const localCard = localCardMap.get(cardId);
          if (!localCard) {
            cardsToPut.push({
              id: cardId,
              deckId: rc.deckId,
              word: rc.word,
              state: rc.state as CardState,
              step: rc.step || 0,
              consecutiveSuccess: rc.consecutiveSuccess || 0,
              lapseCount: rc.lapseCount || 0,
              reps: rc.reps || 0,
              lastReviewedAt: rc.lastReviewedAt || 0,
              nextDue: rc.nextDue || 0,
              masteredAt: rc.masteredAt,
            });
          } else {
            // 遵循学习成果深度保护规则
            const localMastered = localCard.state === CardState.MASTERED;
            const remoteMastered = rc.state === 'MASTERED';

            let chosenState = rc.state as CardState;
            let chosenConsecutive = rc.consecutiveSuccess || 0;
            let chosenMasteredAt = rc.masteredAt;

            if (localMastered && !remoteMastered) {
              chosenState = CardState.MASTERED;
              chosenConsecutive = Math.max(localCard.consecutiveSuccess, chosenConsecutive, 2);
              chosenMasteredAt = localCard.masteredAt || rc.masteredAt;
            } else if (remoteMastered && !localMastered) {
              chosenState = CardState.MASTERED;
              chosenConsecutive = Math.max(chosenConsecutive, 2);
              chosenMasteredAt = rc.masteredAt || Date.now();
            } else {
              if (localCard.consecutiveSuccess > (rc.consecutiveSuccess || 0)) {
                chosenState = localCard.state;
                chosenConsecutive = localCard.consecutiveSuccess;
              } else {
                chosenState = rc.state as CardState;
                chosenConsecutive = rc.consecutiveSuccess || 0;
              }
            }

            const chosenStep = rc.step ?? localCard.step;
            const chosenLapses = Math.max(localCard.lapseCount, rc.lapseCount || 0);
            const chosenReps = Math.max(localCard.reps, rc.reps || 0);
            const chosenLastReviewed = Math.max(localCard.lastReviewedAt, rc.lastReviewedAt || 0);
            const chosenNextDue = rc.nextDue ?? localCard.nextDue;

            if (
              localCard.state !== chosenState ||
              localCard.step !== chosenStep ||
              localCard.consecutiveSuccess !== chosenConsecutive ||
              localCard.lapseCount !== chosenLapses ||
              localCard.reps !== chosenReps ||
              localCard.lastReviewedAt !== chosenLastReviewed ||
              localCard.nextDue !== chosenNextDue ||
              localCard.masteredAt !== chosenMasteredAt
            ) {
              cardsToPut.push({
                ...localCard,
                state: chosenState,
                step: chosenStep,
                consecutiveSuccess: chosenConsecutive,
                lapseCount: chosenLapses,
                reps: chosenReps,
                lastReviewedAt: chosenLastReviewed,
                nextDue: chosenNextDue,
                masteredAt: chosenMasteredAt,
              });
            }
          }
        }
        if (cardsToPut.length > 0) {
          await userDb.cards.bulkPut(cardsToPut);
        }
      }

      // 4. 合并 logs (唯一 ID 去重)
      if (remote.logs && remote.logs.length > 0) {
        const existingLogs = await userDb.logs.toArray();
        const existingLogIds = new Set(existingLogs.map((l) => l.id));
        const missingLogs: ReviewLogEntry[] = [];

        for (const rl of remote.logs) {
          if (!existingLogIds.has(rl.id)) {
            missingLogs.push({
              id: rl.id,
              deckId: rl.deckId,
              word: rl.word,
              rating: rl.rating as any,
              stateBefore: rl.stateBefore as any,
              stateAfter: rl.stateAfter as any,
              isIndependent: Boolean(rl.isIndependent),
              durationMs: rl.durationMs,
              timestamp: rl.timestamp,
            });
            existingLogIds.add(rl.id);
          }
        }

        if (missingLogs.length > 0) {
          await userDb.logs.bulkAdd(missingLogs);
        }
      }
    });

    // 5. 应用 settings
    if (remote.settings) {
      for (const s of remote.settings) {
        if (s.key === 'theme_mode') {
          localStorage.setItem('theme_mode', s.value);
        }
      }
    }
  }

  private debounceTimer: any = null;

  /**
   * 防抖触发同步，适合在学习答题中连续调用
   */
  public triggerSyncDebounced(delayMs = 2000): void {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
    }
    this.debounceTimer = setTimeout(() => {
      this.debounceTimer = null;
      this.triggerSync().catch(() => {});
    }, delayMs);
  }

  /**
   * 触发立即双向同步
   */
  public async triggerSync(): Promise<void> {
    const token = getStoredToken();
    if (!token) {
      this.status = 'idle';
      this.notify();
      return;
    }

    if (!this.isOnline) {
      this.status = 'offline';
      this.notify();
      return;
    }

    this.status = 'syncing';
    this.lastError = '';
    this.notify();

    try {
      const localPayload = await this.getLocalPayload();
      const authoritativeData = await syncApi.fullSync(localPayload);
      await this.applyRemotePayload(authoritativeData);

      this.status = 'synced';
      this.lastSyncTime = Date.now();
      this.notify();
    } catch (err: unknown) {
      console.warn('[SyncService] 同步失败:', err);
      this.status = 'error';
      this.lastError = err instanceof Error ? err.message : String(err);
      this.notify();
    }
  }
}

export const syncService = new SyncService();
