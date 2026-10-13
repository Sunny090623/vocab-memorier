import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { loadDictionaryFromZip } from '../../src/core/dict/zipDictLoader.ts';
import { sanitizeDictTitle } from '../../src/core/dict/mdxParser.ts';

function createNodeFileBlob(filePath: string): Blob {
  const stat = fs.statSync(filePath);
  const fd = fs.openSync(filePath, 'r');

  return {
    size: stat.size,
    type: 'application/zip',
    slice(start = 0, end = stat.size): any {
      const s = Math.max(0, start);
      const e = Math.min(stat.size, end);
      const len = Math.max(0, e - s);
      const buf = Buffer.alloc(len);
      fs.readSync(fd, buf, 0, len, s);
      return {
        size: len,
        arrayBuffer: async () => buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength),
      };
    },
  } as unknown as Blob;
}

describe('Real ZIP Dictionary Compatibility', () => {
  it('should sanitize title and remove any HTML tags and CSS', () => {
    const rawHtmlDesc = `
      <div style="text-align:center; display: block; COLOR: white; background-color:#cb0111;">
        <span>《牛津高阶英汉双解词典》</span>第9版
      </div>
    `;
    const title = sanitizeDictTitle('', rawHtmlDesc, '牛津高阶双解(第9版)_V3.0版');
    expect(title).toBe('牛津高阶双解(第9版)_V3.0版');
    expect(title).not.toContain('<');
    expect(title).not.toContain('style');
    expect(title).not.toContain('display:');
  });

  it('should preserve valid clean title from Title attribute', () => {
    const title = sanitizeDictTitle('OALDPE En-Cn 精装版 V2025.02.14', '<p>desc</p>', 'oaldpe');
    expect(title).toBe('OALDPE En-Cn 精装版 V2025.02.14');
  });

  const zip1 = 'Oxford Advanced Learner’s Dictionary-20261012T164021Z-1-001.zip';
  if (fs.existsSync(zip1)) {
    it('should successfully inspect and slice 3.85GB zip archive', async () => {
      const blob = createNodeFileBlob(zip1);
      const result = await loadDictionaryFromZip(blob);
      expect(result.dictName).toBe('OALDPE En-Cn 精装版 V2025.02.14');
      expect(result.entriesCount).toBeGreaterThan(1000);
    }, 60000);
  }

  const zip2 = '牛津高阶第9版英汉双解（推荐）.zip';
  if (fs.existsSync(zip2)) {
    it('should successfully inspect and slice 1.86GB zip archive with clean title', async () => {
      const blob = createNodeFileBlob(zip2);
      const result = await loadDictionaryFromZip(blob);
      expect(result.dictName).toBe('牛津高阶双解(第9版)_V3.0版');
      expect(result.dictName).not.toContain('<');
      expect(result.dictName).not.toContain('style');
      expect(result.entriesCount).toBeGreaterThan(1000);
    }, 60000);
  }
});

