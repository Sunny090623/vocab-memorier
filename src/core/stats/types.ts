export interface DeckStats {
  totalWords: number;
  masteredWords: number;
  remainingWords: number;
  learningWords: number;
  testingWords: number;
  unseenWords: number;
  accuracyPercent: number;
  avgDurationSec: number;
  masteredWordsPerHour: number;
  lapseWords: Array<{ word: string; lapseCount: number; reps: number }>;
}