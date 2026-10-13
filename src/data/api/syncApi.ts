import { request } from './apiClient.ts';

export interface SyncPayload {
  decks?: Array<{
    id: string;
    name: string;
    description?: string;
    studyMode?: string;
    wordCount?: number;
    masteredCount?: number;
    createdAt?: number;
    updatedAt: number;
    isDeleted?: boolean | number;
  }>;
  deckMembers?: Array<{
    id: string;
    deckId: string;
    word: string;
    sortOrder?: number;
    addedAt?: number;
    isDeleted?: boolean | number;
  }>;
  cards?: Array<{
    id: string;
    deckId: string;
    word: string;
    state: string;
    step?: number;
    consecutiveSuccess?: number;
    lapseCount?: number;
    reps?: number;
    lastReviewedAt?: number;
    nextDue?: number;
    masteredAt?: number;
    updatedAt?: number;
  }>;
  logs?: Array<{
    id: string;
    deckId: string;
    word: string;
    rating: string;
    stateBefore: string;
    stateAfter: string;
    isIndependent: boolean | number;
    durationMs: number;
    timestamp: number;
  }>;
  settings?: Array<{
    key: string;
    value: string;
    updatedAt: number;
  }>;
}

export const syncApi = {
  async pull(): Promise<SyncPayload> {
    return request('/api/sync/pull', { method: 'POST' });
  },

  async push(payload: SyncPayload): Promise<{ success: boolean; timestamp: number }> {
    return request('/api/sync/push', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  async fullSync(payload: SyncPayload): Promise<SyncPayload> {
    return request('/api/sync/full', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },
};

