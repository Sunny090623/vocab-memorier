import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { parseMdx } from '../../src/core/dict/mdxParser.ts';

describe('mdxParser', () => {
  const mdxPath = path.resolve('牛津高阶第9版英汉双解（推荐）', '牛津高阶双解(第9版)_V3.0版.mdx');
  const exists = fs.existsSync(mdxPath);

  it.skipIf(!exists)('should successfully parse real Oxford MDX file', async () => {
    const buffer = fs.readFileSync(mdxPath);
    const result = await parseMdx(buffer, (pct, status) => {
      // progress test
    });

    expect(result.entriesCount).toBeGreaterThan(50000);
    expect(result.linksCount).toBeGreaterThan(100000);

    const convertEntry = result.entries.find((e) => e.word === 'convert');
    expect(convertEntry).toBeDefined();
    expect(convertEntry?.displayWord).toBe('convert');
    expect(convertEntry?.phonetic).toBeTruthy();
    expect(convertEntry?.definitions.length).toBeGreaterThan(0);

    // Verify inflections
    const childrenLink = result.links.find((l) => l.word === 'children');
    expect(childrenLink?.target).toBe('child');

    const convertedLink = result.links.find((l) => l.word === 'converted');
    expect(convertedLink?.target).toBe('convert');
  }, 30000);
});
