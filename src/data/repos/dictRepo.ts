import { dictDb } from '../db/dictDb.ts';
import { DictEntryRecord } from '../db/schema.ts';

export interface DictSearchResult {
  word: string;
  displayWord: string;
  phonetic: string;
  pos: string[];
  definitions: string[];
  isMatched: boolean;
  linkedFrom?: string;
}

const dictCache = new Map<string, DictSearchResult>();

export const dictRepo = {
  /**
   * 单词单条查询（支持 @@@LINK 屈折跳转，带内存极速缓存）
   */
  async lookup(word: string): Promise<DictSearchResult> {
    const lower = word.trim().toLowerCase();
    if (!lower) {
      return {
        word,
        displayWord: word,
        phonetic: '',
        pos: [],
        definitions: [],
        isMatched: false,
      };
    }

    if (dictCache.has(lower)) {
      return dictCache.get(lower)!;
    }

    // 1. 直查实体词条
    const directEntry = await dictDb.entries.get(lower);
    if (directEntry) {
      const res: DictSearchResult = {
        ...directEntry,
        isMatched: true,
      };
      dictCache.set(lower, res);
      return res;
    }

    // 2. 检查屈折/别名跳转
    const link = await dictDb.links.get(lower);
    if (link) {
      const targetEntry = await dictDb.entries.get(link.target);
      if (targetEntry) {
        const res: DictSearchResult = {
          ...targetEntry,
          word: lower,
          displayWord: word, // 保留用户输入的原始拼写形式
          linkedFrom: link.target,
          isMatched: true,
        };
        dictCache.set(lower, res);
        return res;
      }
    }

    // 3. 未收录
    const res: DictSearchResult = {
      word: lower,
      displayWord: word,
      phonetic: '',
      pos: [],
      definitions: [],
      isMatched: false,
    };
    dictCache.set(lower, res);
    return res;
  },

  /**
   * 批量查询单词（导入时高速批处理）
   */
  async lookupBatch(words: string[]): Promise<Map<string, DictSearchResult>> {
    const results = new Map<string, DictSearchResult>();
    const uniqueLowers = Array.from(new Set(words.map((w) => w.trim().toLowerCase()))).filter(Boolean);

    // 1. 先从内存缓存中检索已命中的词条
    const toQuery: string[] = [];
    for (const w of uniqueLowers) {
      if (dictCache.has(w)) {
        results.set(w, dictCache.get(w)!);
      } else {
        toQuery.push(w);
      }
    }

    if (toQuery.length > 0) {
      // 2. 分块批量拉取 entries（每块 500 个，兼顾 IndexedDB 事务并发与单次查询效率）
      const CHUNK_SIZE = 500;
      for (let i = 0; i < toQuery.length; i += CHUNK_SIZE) {
        const chunk = toQuery.slice(i, i + CHUNK_SIZE);
        const entries = await dictDb.entries.where('word').anyOf(chunk).toArray();
        for (const e of entries) {
          const res: DictSearchResult = { ...e, isMatched: true };
          results.set(e.word, res);
          dictCache.set(e.word, res);
        }
      }

      // 3. 对未命中的查 links (屈折跳转)
      const misses = toQuery.filter((w) => !results.has(w));
      if (misses.length > 0) {
        for (let i = 0; i < misses.length; i += CHUNK_SIZE) {
          const missChunk = misses.slice(i, i + CHUNK_SIZE);
          const links = await dictDb.links.where('word').anyOf(missChunk).toArray();
          if (links.length > 0) {
            const targetWords = Array.from(new Set(links.map((l) => l.target)));
            const targetEntries = await dictDb.entries.where('word').anyOf(targetWords).toArray();
            const targetMap = new Map<string, DictEntryRecord>();
            for (const te of targetEntries) {
              targetMap.set(te.word, te);
            }

            for (const l of links) {
              const te = targetMap.get(l.target);
              if (te) {
                const res: DictSearchResult = {
                  ...te,
                  word: l.word,
                  linkedFrom: l.target,
                  isMatched: true,
                };
                results.set(l.word, res);
                dictCache.set(l.word, res);
              }
            }
          }
        }
      }
    }

    // 4. 对依然未收录的词汇生成默认结果并写入缓存
    for (const w of words) {
      const lower = w.trim().toLowerCase();
      if (!results.has(lower)) {
        const fallback: DictSearchResult = {
          word: lower,
          displayWord: w,
          phonetic: '',
          pos: [],
          definitions: [],
          isMatched: false,
        };
        results.set(lower, fallback);
        dictCache.set(lower, fallback);
      }
    }

    return results;
  },
};