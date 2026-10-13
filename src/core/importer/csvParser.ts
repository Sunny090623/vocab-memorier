import Papa from 'papaparse';
import { ParseResult, ImportItem } from './types.ts';
import { extractAndNormalizeWord } from './normalizer.ts';

export function parseCsvContent(csvString: string): ParseResult {
  const parsed = Papa.parse<string[]>(csvString.trim(), {
    skipEmptyLines: true,
  });

  const rows = parsed.data;
  if (rows.length === 0) {
    return {
      totalLines: 0,
      validItems: [],
      duplicateWords: [],
      uniqueWords: [],
    };
  }

  // 推断英文词所在列索引
  let wordColIdx = 0;
  let hasHeader = false;
  const firstRow = rows[0].map((c) => c.toLowerCase().trim());
  const headerCandidates = ['word', 'vocab', 'term', 'english', 'headword', '单词'];

  for (let i = 0; i < firstRow.length; i++) {
    if (headerCandidates.includes(firstRow[i])) {
      wordColIdx = i;
      hasHeader = true;
      break;
    }
  }

  const startRow = hasHeader ? 1 : 0;
  const validItems: ImportItem[] = [];
  const seen = new Set<string>();
  const duplicateWords: string[] = [];

  for (let r = startRow; r < rows.length; r++) {
    const row = rows[r];
    const cellValue = row[wordColIdx] || '';
    const extracted = extractAndNormalizeWord(cellValue);
    if (!extracted) {
      continue;
    }

    const { word } = extracted;
    // 其余列作为备注
    const otherNotes = row
      .filter((_, idx) => idx !== wordColIdx)
      .join(' ')
      .trim();

    if (seen.has(word)) {
      duplicateWords.push(word);
    } else {
      seen.add(word);
      validItems.push({
        word,
        rawLine: row.join(','),
        customNote: otherNotes || undefined,
      });
    }
  }

  return {
    totalLines: rows.length,
    validItems,
    duplicateWords,
    uniqueWords: Array.from(seen),
  };
}