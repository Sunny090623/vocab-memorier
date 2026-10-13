import { describe, it, expect, beforeEach } from 'vitest';
import { zipSync } from 'fflate';
import { loadDictionaryFromZip } from '../../src/core/dict/zipDictLoader.ts';
import { dictDb } from '../../src/data/db/dictDb.ts';
import 'fake-indexeddb/auto';

describe('zipDictLoader', () => {
  beforeEach(async () => {
    await dictDb.entries.clear();
    await dictDb.links.clear();
    await dictDb.meta.clear();
  });

  it('should reject zip files without any dictionary files', async () => {
    const dummyZip = zipSync({
      'readme.txt': new TextEncoder().encode('No dictionary here'),
    });

    await expect(loadDictionaryFromZip(dummyZip.buffer)).rejects.toThrow(
      /ZIP 压缩包中未找到有效的词典文件/
    );
  });

  it('should load dictionary from zip with json dictionary format', async () => {
    const mockDict = {
      name: '测试双解词典',
      entries: {
        apple: ['ˈæpl', ['n.'], ['苹果'], 'apple'],
        banana: ['bəˈnɑːnə', ['n.'], ['香蕉'], 'banana'],
      },
      links: {
        apples: 'apple',
      },
    };

    const zipBytes = zipSync({
      'dict.json': new TextEncoder().encode(JSON.stringify(mockDict)),
      'readme.txt': new TextEncoder().encode('Help file'),
    });

    const progressLogs: string[] = [];
    const result = await loadDictionaryFromZip(zipBytes.buffer, (pct, status) => {
      progressLogs.push(`${pct}%: ${status}`);
    });

    expect(result.dictName).toBe('测试双解词典');
    expect(result.entriesCount).toBe(2);
    expect(result.linksCount).toBe(1);

    const apple = await dictDb.entries.get('apple');
    expect(apple?.definitions[0]).toBe('苹果');

    const applesLink = await dictDb.links.get('apples');
    expect(applesLink?.target).toBe('apple');

    const meta = await dictDb.meta.get('loaded');
    expect(meta?.value).toBe(1);
  });
});
