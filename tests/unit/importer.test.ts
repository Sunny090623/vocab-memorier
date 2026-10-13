import { describe, it, expect } from 'vitest';
import { extractAndNormalizeWord } from '../../src/core/importer/normalizer.ts';
import { parseTextContent } from '../../src/core/importer/textParser.ts';
import { parseCsvContent } from '../../src/core/importer/csvParser.ts';

describe('Importer Normalizer', () => {
  it('extracts word and optional notes', () => {
    expect(extractAndNormalizeWord('convert（已认识）')).toEqual({
      word: 'convert',
      note: '（已认识）',
    });
    expect(extractAndNormalizeWord('apple, 苹果')).toEqual({
      word: 'apple',
      note: '苹果',
    });
    expect(extractAndNormalizeWord('look up - 查阅')).toEqual({
      word: 'look up',
      note: '查阅',
    });
    expect(extractAndNormalizeWord('  Apple  ')).toEqual({
      word: 'apple',
      note: '',
    });
  });

  it('filters empty lines and comments', () => {
    expect(extractAndNormalizeWord('')).toBeNull();
    expect(extractAndNormalizeWord('   ')).toBeNull();
    expect(extractAndNormalizeWord('# 注释内容')).toBeNull();
    expect(extractAndNormalizeWord('// 注释内容')).toBeNull();
  });
});

describe('Text and CSV Parsers', () => {
  it('parses multiline text with deduplication', () => {
    const raw = `
convert（已认识）
conversion
convertible
convert（重复）
# 忽略注释
criticize
`;
    const res = parseTextContent(raw);
    expect(res.uniqueWords).toEqual(['convert', 'conversion', 'convertible', 'criticize']);
    expect(res.duplicateWords).toEqual(['convert']);
    expect(res.validItems.length).toBe(4);
  });

  it('parses CSV with header', () => {
    const csv = `word,meaning,level
apple,苹果,A1
banana,香蕉,A1
apple,苹果重复,A1
`;
    const res = parseCsvContent(csv);
    expect(res.uniqueWords).toEqual(['apple', 'banana']);
    expect(res.duplicateWords).toEqual(['apple']);
  });

  it('parses CSV without header', () => {
    const csv = `apple,苹果
banana,香蕉
cherry,樱桃`;
    const res = parseCsvContent(csv);
    expect(res.uniqueWords).toEqual(['apple', 'banana', 'cherry']);
  });

  it('supports additive merging with duplicate elimination', () => {
    const existingText = 'apple\nbanana (香蕉)';
    const newFileContent = 'banana\norange 橙子\napple\npear';

    const existingParsed = parseTextContent(existingText);
    const seenWords = new Set<string>(existingParsed.uniqueWords.map((w) => w.toLowerCase()));

    const newParsed = parseTextContent(newFileContent);
    const linesToAppend: string[] = [];
    let dupCount = 0;

    for (const item of newParsed.validItems) {
      const lower = item.word.toLowerCase();
      if (seenWords.has(lower)) {
        dupCount++;
      } else {
        seenWords.add(lower);
        linesToAppend.push(item.customNote ? `${item.word} ${item.customNote}` : item.word);
      }
    }

    expect(dupCount).toBe(2); // banana and apple
    expect(linesToAppend).toEqual(['orange 橙子', 'pear']);

    const merged = existingText + '\n' + linesToAppend.join('\n');
    const finalParsed = parseTextContent(merged);
    expect(finalParsed.uniqueWords).toEqual(['apple', 'banana', 'orange', 'pear']);
  });
});