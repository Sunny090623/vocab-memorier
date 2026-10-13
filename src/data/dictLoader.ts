import { dictDb } from './db/dictDb.ts';
import type { DictEntryRecord, DictLinkRecord } from './db/schema.ts';

export type LoadProgressCallback = (percent: number, statusText: string) => void;

let activeLoadingPromise: Promise<void> | null = null;

/**
 * 离线词典装载器
 * 支持透明 HTTP Gzip 解压与客户端 DecompressionStream 双模兼容，
 * 流式解压并分批写入 IndexedDB，支持防并发与进度反馈。
 */
export async function ensureDictionaryLoaded(
  onProgress?: LoadProgressCallback,
  force: boolean = false
): Promise<void> {
  if (activeLoadingPromise) {
    return activeLoadingPromise;
  }

  activeLoadingPromise = doLoadDictionary(onProgress, force).finally(() => {
    activeLoadingPromise = null;
  });

  return activeLoadingPromise;
}

async function doLoadDictionary(
  onProgress?: LoadProgressCallback,
  force: boolean = false
): Promise<void> {
  const meta = await dictDb.meta.get('loaded');
  if (!force && meta && meta.value === 1) {
    onProgress?.(100, '词典已就绪');
    return;
  }

  onProgress?.(5, '正在拉取词典数据包...');

  let response: Response;
  try {
    response = await fetch('/dict/oald9.v1.json.gz');
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
  } catch (err) {
    console.warn('获取 oald9.v1.json.gz 失败，尝试备用 oald9.v1.json 路径...', err);
    response = await fetch('/dict/oald9.v1.json');
    if (!response.ok) {
      throw new Error(`无法获取词典文件: HTTP ${response.status}`);
    }
  }

  const contentLength = Number(response.headers.get('content-length')) || 0;
  let rawBytes: Uint8Array;

  if (response.body) {
    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let receivedBytes = 0;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) {
        chunks.push(value);
        receivedBytes += value.length;
        if (contentLength > 0) {
          const downloadProgress = Math.min(30, 5 + Math.floor((receivedBytes / contentLength) * 25));
          onProgress?.(downloadProgress, `正在下载词典数据 (${(receivedBytes / (1024 * 1024)).toFixed(1)} MB)...`);
        }
      }
    }

    const totalLength = chunks.reduce((acc, c) => acc + c.length, 0);
    rawBytes = new Uint8Array(totalLength);
    let offset = 0;
    for (const c of chunks) {
      rawBytes.set(c, offset);
      offset += c.length;
    }
  } else {
    const arrayBuffer = await response.arrayBuffer();
    rawBytes = new Uint8Array(arrayBuffer);
  }

  onProgress?.(35, '正在解压词典数据...');
  let jsonText: string;

  // 检查是否为未解压的 gzip 魔法头部 (0x1F, 0x8B)
  const isGzip = rawBytes.length >= 2 && rawBytes[0] === 0x1f && rawBytes[1] === 0x8b;

  if (isGzip) {
    // 服务器未自动添加 Content-Encoding，需要在客户端进行解压
    if (typeof DecompressionStream !== 'undefined') {
      try {
        const ds = new DecompressionStream('gzip');
        const stream = new Response(rawBytes as BodyInit).body!.pipeThrough(ds);
        jsonText = await new Response(stream).text();
      } catch (err) {
        console.warn('DecompressionStream 解压异常，尝试降级明文解码:', err);
        jsonText = new TextDecoder('utf-8').decode(rawBytes);
      }
    } else {
      throw new Error('当前浏览器环境不支持 DecompressionStream，无法解压 Gzip 词典');
    }
  } else {
    // 浏览器 HTTP 网络层已透明完成 gzip 解压（例如开发/预览服务器返回 Content-Encoding: gzip）
    jsonText = new TextDecoder('utf-8').decode(rawBytes);
  }

  onProgress?.(60, '正在解析词典词条...');
  const data = JSON.parse(jsonText);
  const rawEntries = data.entries as Record<string, [string, string[], string[], string]>;
  const rawLinks = data.links as Record<string, string>;

  const entryRecords: DictEntryRecord[] = [];
  for (const [word, val] of Object.entries(rawEntries)) {
    entryRecords.push({
      word,
      phonetic: val[0] || '',
      pos: val[1] || [],
      definitions: val[2] || [],
      displayWord: val[3] || word,
    });
  }
  onProgress?.(70, `正在写入本地数据库 (${entryRecords.length.toLocaleString()} 实体词条)...`);

  // 批量分块入库
  const CHUNK_SIZE = 5000;
  for (let i = 0; i < entryRecords.length; i += CHUNK_SIZE) {
    const chunk = entryRecords.slice(i, i + CHUNK_SIZE);
    await dictDb.entries.bulkPut(chunk);
    const progress = 70 + Math.floor((i / entryRecords.length) * 15);
    onProgress?.(progress, `已存入 ${Math.min(i + CHUNK_SIZE, entryRecords.length)} / ${entryRecords.length} 实体词...`);
  }

  const linkRecords: DictLinkRecord[] = [];
  for (const [word, target] of Object.entries(rawLinks)) {
    linkRecords.push({ word, target });
  }
  onProgress?.(85, `正在写入跳转映射 (${linkRecords.length.toLocaleString()} 屈折词)...`);

  const LINK_CHUNK = 10000;
  for (let i = 0; i < linkRecords.length; i += LINK_CHUNK) {
    const chunk = linkRecords.slice(i, i + LINK_CHUNK);
    await dictDb.links.bulkPut(chunk);
    const progress = 85 + Math.floor((i / linkRecords.length) * 14);
    onProgress?.(progress, `已存入 ${Math.min(i + LINK_CHUNK, linkRecords.length)} / ${linkRecords.length} 屈折映射...`);
  }

  const dictTitle = data.name || 'OALDPE En-Cn 精装版 V2025.02.14';
  await dictDb.meta.put({ key: 'dictName', value: dictTitle });
  await dictDb.meta.put({ key: 'loaded', value: 1 });
  onProgress?.(100, '词典初始化完毕！');
}