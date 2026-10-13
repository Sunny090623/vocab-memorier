import { inflateSync, decompressSync } from 'fflate';
import { dictDb } from '../../data/db/dictDb.ts';
import { parseMdx, ParsedDictResult } from './mdxParser.ts';

export type ZipProgressCallback = (percent: number, statusText: string) => void;

export interface ZipDictLoadResult {
  dictName: string;
  entriesCount: number;
  linksCount: number;
}

interface ZipEntryMeta {
  name: string;
  method: number;
  compSize: number;
  uncompSize: number;
  localOffset: number;
}

interface SliceReader {
  size: number;
  read(start: number, end: number): Promise<Uint8Array>;
}

function createSliceReader(fileOrBuffer: File | Blob | ArrayBuffer): SliceReader {
  if (
    fileOrBuffer &&
    typeof (fileOrBuffer as any).slice === 'function' &&
    typeof (fileOrBuffer as any).size === 'number'
  ) {
    const blobLike = fileOrBuffer as Blob;
    return {
      size: blobLike.size,
      async read(start: number, end: number): Promise<Uint8Array> {
        const sliced = blobLike.slice(start, end);
        if (typeof sliced.arrayBuffer === 'function') {
          const ab = await sliced.arrayBuffer();
          return new Uint8Array(ab);
        }
        if (typeof Response !== 'undefined') {
          const ab = await new Response(sliced).arrayBuffer();
          return new Uint8Array(ab);
        }
        return new Promise<Uint8Array>((resolve, reject) => {
          const fr = new FileReader();
          fr.onload = () => resolve(new Uint8Array(fr.result as ArrayBuffer));
          fr.onerror = () => reject(fr.error);
          fr.readAsArrayBuffer(sliced);
        });
      },
    };
  }

  const raw =
    fileOrBuffer instanceof ArrayBuffer
      ? new Uint8Array(fileOrBuffer)
      : new Uint8Array((fileOrBuffer as any).buffer || fileOrBuffer);

  return {
    size: raw.byteLength,
    async read(start: number, end: number): Promise<Uint8Array> {
      return raw.subarray(start, end);
    },
  };
}

/**
 * 客户端解压 ZIP 并加载 MDX/JSON 词典文件入库
 * 核心优化：针对巨型压缩包（如包含多 GB 音频资源的 3.8GB+ 词库包），
 * 采用 Blob 随机切片技术（Blob.slice），仅按需读取尾部 EOCD 与中央目录（几 KB），
 * 定位目标词典文件后仅切片抽取该文件的压缩数据流（几十 MB），
 * 避免全量读取引发 V8 2GB ArrayBuffer 内存崩溃及浏览器权限报错。
 */
export async function loadDictionaryFromZip(
  fileOrBuffer: File | Blob | ArrayBuffer,
  onProgress?: ZipProgressCallback
): Promise<ZipDictLoadResult> {
  onProgress?.(5, '正在读取 ZIP 压缩包文件头部与元数据...');

  const reader = createSliceReader(fileOrBuffer);
  const size = reader.size;
  if (size < 22) {
    throw new Error('ZIP 文件体积过小，无效的压缩文件。');
  }

  onProgress?.(10, '正在定位 ZIP 目录索引结构...');

  // 1. 定位并读取 EOCD (End of Central Directory Record)
  const tailSize = Math.min(65557, size);
  const tailBytes = await reader.read(size - tailSize, size);
  const tailDv = new DataView(tailBytes.buffer, tailBytes.byteOffset, tailBytes.byteLength);

  let eocdRel = -1;
  for (let i = tailBytes.length - 22; i >= 0; i--) {
    if (tailDv.getUint32(i, true) === 0x06054b50) {
      eocdRel = i;
      break;
    }
  }

  if (eocdRel === -1) {
    throw new Error('未能在压缩包中找到有效 ZIP 目录结尾标记 (EOCD)。');
  }

  let cdSize = tailDv.getUint32(eocdRel + 12, true);
  let cdOffset = tailDv.getUint32(eocdRel + 16, true);

  onProgress?.(15, '正在解析 ZIP 目录清单...');

  // 2. 读取 Central Directory 目录区
  const cdBytes = await reader.read(cdOffset, cdOffset + cdSize);
  const cdDv = new DataView(cdBytes.buffer, cdBytes.byteOffset, cdBytes.byteLength);

  const entries: ZipEntryMeta[] = [];
  let pos = 0;
  while (pos + 46 <= cdBytes.length) {
    if (cdDv.getUint32(pos, true) !== 0x02014b50) break;
    const method = cdDv.getUint16(pos + 10, true);
    let compSize = cdDv.getUint32(pos + 20, true);
    let uncompSize = cdDv.getUint32(pos + 24, true);
    const nameLen = cdDv.getUint16(pos + 28, true);
    const extraLen = cdDv.getUint16(pos + 30, true);
    const commentLen = cdDv.getUint16(pos + 32, true);
    let localOffset = cdDv.getUint32(pos + 42, true);

    const nameBytes = cdBytes.subarray(pos + 46, pos + 46 + nameLen);
    let name = new TextDecoder('utf-8').decode(nameBytes);
    // 兼容 GBK 编码文件名
    if (name.includes('\ufffd')) {
      try {
        name = new TextDecoder('gb18030').decode(nameBytes);
      } catch {}
    }

    // 处理 ZIP64 扩展字段 (针对偏移量超 2GB/4GB 的情况)
    let extraPos = pos + 46 + nameLen;
    const extraEnd = extraPos + extraLen;
    while (extraPos + 4 <= extraEnd) {
      const headerId = cdDv.getUint16(extraPos, true);
      const dataSize = cdDv.getUint16(extraPos + 2, true);
      extraPos += 4;
      if (headerId === 0x0001) {
        let ep = extraPos;
        if (uncompSize === 0xffffffff && ep + 8 <= extraEnd) {
          const low = cdDv.getUint32(ep, true);
          const high = cdDv.getUint32(ep + 4, true);
          uncompSize = high * 0x100000000 + low;
          ep += 8;
        }
        if (compSize === 0xffffffff && ep + 8 <= extraEnd) {
          const low = cdDv.getUint32(ep, true);
          const high = cdDv.getUint32(ep + 4, true);
          compSize = high * 0x100000000 + low;
          ep += 8;
        }
        if (localOffset === 0xffffffff && ep + 8 <= extraEnd) {
          const low = cdDv.getUint32(ep, true);
          const high = cdDv.getUint32(ep + 4, true);
          localOffset = high * 0x100000000 + low;
          ep += 8;
        }
      }
      extraPos += dataSize;
    }

    entries.push({ name, method, compSize, uncompSize, localOffset });
    pos += 46 + nameLen + extraLen + commentLen;
  }

  // 3. 寻找匹配的词典文件（优先选择主 MDX，忽略反查词典）
  const mdxEntries = entries.filter((e) => e.name.toLowerCase().endsWith('.mdx'));
  let chosenEntry: ZipEntryMeta | undefined;

  if (mdxEntries.length > 0) {
    const primaryMdx = mdxEntries.filter(
      (e) => !e.name.includes('反查') && !e.name.toLowerCase().includes('zhen')
    );
    if (primaryMdx.length > 0) {
      primaryMdx.sort((a, b) => b.compSize - a.compSize);
      chosenEntry = primaryMdx[0];
    } else {
      mdxEntries.sort((a, b) => b.compSize - a.compSize);
      chosenEntry = mdxEntries[0];
    }
  } else {
    chosenEntry =
      entries.find((e) => e.name.toLowerCase().endsWith('.json.gz')) ||
      entries.find((e) => e.name.toLowerCase().endsWith('.json'));
  }

  if (!chosenEntry) {
    throw new Error(
      'ZIP 压缩包中未找到有效的词典文件！请确保压缩包中包含 .mdx 或 .json 格式的词典。'
    );
  }

  // 4. 定位并切片提取目标文件
  const fileName = chosenEntry.name.split('/').pop()?.split('\\').pop() || chosenEntry.name;
  onProgress?.(
    18,
    `已定位目标词典: ${fileName} (${(chosenEntry.compSize / 1024 / 1024).toFixed(1)} MB)，正在切片提取...`
  );

  const lfhBytes = await reader.read(chosenEntry.localOffset, chosenEntry.localOffset + 30);
  const lfhDv = new DataView(lfhBytes.buffer, lfhBytes.byteOffset, lfhBytes.byteLength);
  const lfhNameLen = lfhDv.getUint16(26, true);
  const lfhExtraLen = lfhDv.getUint16(28, true);
  const dataStart = chosenEntry.localOffset + 30 + lfhNameLen + lfhExtraLen;

  const compPayload = await reader.read(dataStart, dataStart + chosenEntry.compSize);

  let decompressedBytes: Uint8Array;
  if (chosenEntry.method === 8) {
    onProgress?.(22, '正在解压词典数据流...');
    decompressedBytes = inflateSync(compPayload);
  } else if (chosenEntry.method === 0) {
    decompressedBytes = compPayload;
  } else {
    throw new Error(`不支持的 ZIP 压缩方式 (method ${chosenEntry.method})`);
  }

  // 5. 解析词典内容
  let parsedResult: ParsedDictResult;
  const isMdx = chosenEntry.name.toLowerCase().endsWith('.mdx');

  if (isMdx) {
    const fallbackTitle = fileName.replace(/\.mdx$/i, '');
    parsedResult = await parseMdx(
      decompressedBytes,
      (pct, status) => {
        const overall = 25 + Math.floor(pct * 0.6);
        onProgress?.(overall, status);
      },
      fallbackTitle
    );
  } else {
    let jsonText: string;
    let fallbackTitle = fileName.replace(/\.json(\.gz)?$/i, '');

    if (chosenEntry.name.toLowerCase().endsWith('.json.gz')) {
      onProgress?.(28, '正在解压 Gzip 格式 JSON 词典...');
      const unzippedJson = decompressSync(decompressedBytes);
      jsonText = new TextDecoder('utf-8').decode(unzippedJson);
    } else {
      onProgress?.(28, '正在读取 JSON 格式词典...');
      jsonText = new TextDecoder('utf-8').decode(decompressedBytes);
    }

    onProgress?.(50, '正在解析词典 JSON 结构...');
    const data = JSON.parse(jsonText);
    const rawEntries = data.entries as Record<string, [string, string[], string[], string]>;
    const rawLinks = data.links as Record<string, string>;

    const entries = Object.entries(rawEntries).map(([word, val]) => ({
      word,
      phonetic: val[0] || '',
      pos: val[1] || [],
      definitions: val[2] || [],
      displayWord: val[3] || word,
    }));

    const links = Object.entries(rawLinks).map(([word, target]) => ({
      word,
      target,
    }));

    parsedResult = {
      title: data.name || fallbackTitle,
      entriesCount: entries.length,
      linksCount: links.length,
      entries,
      links,
    };
  }

  onProgress?.(85, '正在重置本地词典数据表...');

  // 6. 清理并批量写入 IndexedDB
  await dictDb.entries.clear();
  await dictDb.links.clear();

  onProgress?.(88, `正在存入 ${parsedResult.entries.length.toLocaleString()} 个实体词条...`);
  const CHUNK_SIZE = 5000;
  for (let i = 0; i < parsedResult.entries.length; i += CHUNK_SIZE) {
    const chunk = parsedResult.entries.slice(i, i + CHUNK_SIZE);
    await dictDb.entries.bulkPut(chunk);
    const writePct = 88 + Math.floor((i / parsedResult.entries.length) * 6);
    onProgress?.(
      writePct,
      `正在存入实体词 (${Math.min(i + CHUNK_SIZE, parsedResult.entries.length).toLocaleString()} / ${parsedResult.entries.length.toLocaleString()})...`
    );
  }

  onProgress?.(94, `正在存入 ${parsedResult.links.length.toLocaleString()} 个跳转映射...`);
  const LINK_CHUNK = 10000;
  for (let i = 0; i < parsedResult.links.length; i += LINK_CHUNK) {
    const chunk = parsedResult.links.slice(i, i + LINK_CHUNK);
    await dictDb.links.bulkPut(chunk);
    const writePct = 94 + Math.floor((i / parsedResult.links.length) * 5);
    onProgress?.(
      writePct,
      `正在存入跳转映射 (${Math.min(i + LINK_CHUNK, parsedResult.links.length).toLocaleString()} / ${parsedResult.links.length.toLocaleString()})...`
    );
  }

  // 7. 更新元数据
  await dictDb.meta.put({ key: 'loaded', value: 1 });
  await dictDb.meta.put({ key: 'dictName', value: parsedResult.title });
  await dictDb.meta.put({ key: 'entriesCount', value: parsedResult.entriesCount });
  await dictDb.meta.put({ key: 'linksCount', value: parsedResult.linksCount });
  await dictDb.meta.put({ key: 'updatedAt', value: Date.now() });

  onProgress?.(100, `词典《${parsedResult.title}》加载成功！`);

  return {
    dictName: parsedResult.title,
    entriesCount: parsedResult.entriesCount,
    linksCount: parsedResult.linksCount,
  };
}
