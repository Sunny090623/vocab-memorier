export type StudyMode = 'BATCH_CYCLE' | 'FULL_DECK' | 'AUTO';

export interface DeckRecord {
  id: string;
  name: string;
  description?: string;
  studyMode?: StudyMode;
  wordCount: number;
  masteredCount: number;
  createdAt: number;
  updatedAt: number;
}

export interface DeckMemberRecord {
  id: string; // `${deckId}:${word}`
  deckId: string;
  word: string;
  sortOrder: number;
  addedAt: number;
}

export interface DictEntryRecord {
  word: string;
  displayWord: string;
  phonetic: string;
  pos: string[];
  definitions: string[];
}

export interface DictLinkRecord {
  word: string;
  target: string;
}

export interface DictMetaRecord {
  key: string;
  value: string | number;
}