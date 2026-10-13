export interface ImportItem {
  word: string;
  rawLine: string;
  customNote?: string;
}

export interface ParseResult {
  totalLines: number;
  validItems: ImportItem[];
  duplicateWords: string[];
  uniqueWords: string[];
}

export interface WordMatchStatus {
  word: string;
  displayWord: string;
  phonetic: string;
  pos: string[];
  definitions: string[];
  isMatched: boolean;
}