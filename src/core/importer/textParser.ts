import { ParseResult, ImportItem } from './types.ts';
import { extractAndNormalizeWord } from './normalizer.ts';

export function parseTextContent(text: string): ParseResult {
  const lines = text.split(/\r?\n/);
  const validItems: ImportItem[] = [];
  const seen = new Set<string>();
  const duplicateWords: string[] = [];

  for (const line of lines) {
    const extracted = extractAndNormalizeWord(line);
    if (!extracted) {
      continue;
    }

    const { word, note } = extracted;
    if (seen.has(word)) {
      duplicateWords.push(word);
    } else {
      seen.add(word);
      validItems.push({
        word,
        rawLine: line,
        customNote: note || undefined,
      });
    }
  }

  return {
    totalLines: lines.length,
    validItems,
    duplicateWords,
    uniqueWords: Array.from(seen),
  };
}