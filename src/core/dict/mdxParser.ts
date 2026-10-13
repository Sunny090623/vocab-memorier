import { unzlibSync } from 'fflate';
import type { DictEntryRecord, DictLinkRecord } from '../../data/db/schema.ts';
import { mdxDecryptBlock } from './crypt.ts';

export interface ParsedDictResult {
  title: string;
  entriesCount: number;
  linksCount: number;
  entries: DictEntryRecord[];
  links: DictLinkRecord[];
}

export type MdxProgressCallback = (percent: number, statusText: string) => void;

function cleanText(s: string): string {
  return s
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\xa0/g, ' ')
    .trim();
}

export function sanitizeDictTitle(titleAttr: string, descAttr: string, fallbackName?: string): string {
  if (titleAttr && titleAttr.trim()) {
    const cleaned = cleanText(titleAttr);
    if (
      cleaned.length > 0 &&
      cleaned.length < 80 &&
      !cleaned.includes('{') &&
      !cleaned.includes(';') &&
      !cleaned.includes('display:')
    ) {
      return cleaned;
    }
  }

  if (fallbackName && fallbackName.trim() && !fallbackName.toLowerCase().includes('untitled')) {
    return fallbackName.trim();
  }

  if (descAttr && descAttr.trim()) {
    const unescaped = descAttr
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&amp;/g, '&');

    const bookMatch = unescaped.match(/《([^》]+)》/);
    if (bookMatch && bookMatch[1].trim().length < 50) {
      return bookMatch[1].trim();
    }

    const hMatch = unescaped.match(/<h[1-2][^>]*>(.*?)<\/h[1-2]>/i);
    if (hMatch) {
      const hText = cleanText(hMatch[1]);
      if (hText.length > 0 && hText.length < 60 && !hText.includes('{') && !hText.includes(';')) {
        return hText;
      }
    }
  }

  return fallbackName || '本地 MDX 词典';
}


function readUint32BE(buf: Uint8Array, offset: number): number {
  return (
    ((buf[offset] << 24) >>> 0) +
    (buf[offset + 1] << 16) +
    (buf[offset + 2] << 8) +
    buf[offset + 3]
  );
}

function readUint64BE(buf: Uint8Array, offset: number): number {
  const high = readUint32BE(buf, offset);
  const low = readUint32BE(buf, offset + 4);
  return high * 0x100000000 + low;
}

interface KeyEntry {
  word: string;
  startOffset: number;
  endOffset: number;
}

interface RecordBlockInfo {
  packSize: number;
  unpackSize: number;
  accum: number;
}

/**
 * 纯 TypeScript 客户端 MDX (MDict) 词典解码器
 * 支持 v1.2 与 v2.0 格式、UTF-8/UTF-16/GBK 编码与流式分块解压，
 * 适用于在浏览器中直接解码 MDX 词典文件。
 */
export async function parseMdx(
  buffer: Uint8Array,
  onProgress?: MdxProgressCallback,
  fallbackTitle?: string
): Promise<ParsedDictResult> {
  const dv = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);

  onProgress?.(5, '正在读取词典元数据头部...');

  // 1. 读取头部 XML
  const headerByteSize = dv.getUint32(0, false);
  const headerBytes = buffer.subarray(4, 4 + headerByteSize);
  const headerText = new TextDecoder('utf-16le').decode(headerBytes);

  // 解析 XML 属性
  const getAttr = (key: string): string => {
    const match = headerText.match(new RegExp(`${key}="([^"]*)"`, 'i'));
    return match ? match[1] : '';
  };

  const rawTitle = getAttr('Title');
  const rawDesc = getAttr('Description');
  const title = sanitizeDictTitle(rawTitle, rawDesc, fallbackTitle);
  const engineVersionStr = getAttr('GeneratedByEngineVersion') || '2.0';
  const engineVersion = parseFloat(engineVersionStr);
  const isV2 = engineVersion >= 2.0;
  const encodingAttr = (getAttr('Encoding') || 'UTF-8').toUpperCase();
  const encryptedAttr = parseInt(getAttr('Encrypted') || '0', 10);

  let textDecoder: TextDecoder;
  try {
    if (encodingAttr.includes('16')) {
      textDecoder = new TextDecoder('utf-16le');
    } else if (encodingAttr.includes('GB') || encodingAttr.includes('2312')) {
      textDecoder = new TextDecoder('gb18030');
    } else if (encodingAttr.includes('BIG5')) {
      textDecoder = new TextDecoder('big5');
    } else {
      textDecoder = new TextDecoder('utf-8');
    }
  } catch {
    textDecoder = new TextDecoder('utf-8');
  }

  // 跳过 4 字节 header 校验码
  let pos = 4 + headerByteSize + 4;

  onProgress?.(10, '正在解析词条索引结构...');

  // 2. 词条索引头部
  let numKeyBlocks = 0;
  let numEntries = 0;
  let keyBlockInfoSize = 0;

  if (isV2) {
    numKeyBlocks = readUint64BE(buffer, pos); pos += 8;
    numEntries = readUint64BE(buffer, pos); pos += 8;
    // 跳过 keyInfoUnpackSize (8 字节)
    pos += 8;
    keyBlockInfoSize = readUint64BE(buffer, pos); pos += 8;
    // 跳过 keyBlockSize (8 字节)
    pos += 8;
    // 跳过 checksum (4 字节)
    pos += 4;
  } else {
    numKeyBlocks = dv.getUint32(pos, false); pos += 4;
    numEntries = dv.getUint32(pos, false); pos += 4;
    keyBlockInfoSize = dv.getUint32(pos, false); pos += 4;
    // 跳过 keyBlockSize (4 字节)
    pos += 4;
  }

  // 3. 读取 keyBlockInfo
  const keyInfoBytes = buffer.subarray(pos, pos + keyBlockInfoSize);
  pos += keyBlockInfoSize;

  let decompressedKeyInfo: Uint8Array;
  if (isV2) {
    let payload = keyInfoBytes.subarray(8);
    // 处理 MDX v2 Encrypted="2" (RIPEMD-128 加密 keyInfo 块)
    if (encryptedAttr & 2) {
      const seed = new Uint8Array(8);
      seed.set(keyInfoBytes.subarray(4, 8), 0);
      seed.set([0x95, 0x36, 0x00, 0x00], 4);
      payload = mdxDecryptBlock(payload, seed);
    }

    const compType = keyInfoBytes[0];
    if (compType === 2) {
      decompressedKeyInfo = unzlibSync(payload);
    } else {
      decompressedKeyInfo = payload;
    }
  } else {
    // v1.2 为非压缩直接存储
    decompressedKeyInfo = keyInfoBytes;
  }

  const keyBlocksMeta: Array<{ packSize: number; unpackSize: number }> = [];
  const keyInfoDv = new DataView(
    decompressedKeyInfo.buffer,
    decompressedKeyInfo.byteOffset,
    decompressedKeyInfo.byteLength
  );

  let kPos = 0;
  for (let i = 0; i < numKeyBlocks; i++) {
    if (isV2) {
      // 8 字节条目数
      kPos += 8;
      // 2 字节首词长度 + 首词
      const fwLen = keyInfoDv.getUint16(kPos, false);
      kPos += 2 + fwLen + (encodingAttr.includes('16') ? 2 : 1);
      // 2 字节末词长度 + 末词
      const lwLen = keyInfoDv.getUint16(kPos, false);
      kPos += 2 + lwLen + (encodingAttr.includes('16') ? 2 : 1);
      // 8 字节 packSize, 8 字节 unpackSize
      const packSize = readUint64BE(decompressedKeyInfo, kPos); kPos += 8;
      const unpackSize = readUint64BE(decompressedKeyInfo, kPos); kPos += 8;
      keyBlocksMeta.push({ packSize, unpackSize });
    } else {
      // 4 字节条目数
      kPos += 4;
      // 1 字节首词长度 + 首词
      const fwLen = decompressedKeyInfo[kPos]; kPos += 1 + fwLen;
      // 1 字节末词长度 + 末词
      const lwLen = decompressedKeyInfo[kPos]; kPos += 1 + lwLen;
      // 4 字节 packSize, 4 字节 unpackSize
      const packSize = keyInfoDv.getUint32(kPos, false); kPos += 4;
      const unpackSize = keyInfoDv.getUint32(kPos, false); kPos += 4;
      keyBlocksMeta.push({ packSize, unpackSize });
    }
  }

  onProgress?.(20, `正在解码词条列表 (${numEntries.toLocaleString()} 个词条)...`);

  // 4. 读取所有 keyBlock 并提取单词及其 recordOffset
  const keyEntries: KeyEntry[] = [];
  let currKeyPos = pos;

  for (let i = 0; i < numKeyBlocks; i++) {
    const { packSize } = keyBlocksMeta[i];
    const blockPacked = buffer.subarray(currKeyPos, currKeyPos + packSize);
    currKeyPos += packSize;

    // 前 4 字节 compType: 2 = zlib
    const decomp = unzlibSync(blockPacked.subarray(8));
    const decompDv = new DataView(decomp.buffer, decomp.byteOffset, decomp.byteLength);

    let dOffset = 0;
    while (dOffset < decomp.length) {
      let recOffset = 0;
      if (isV2) {
        recOffset = readUint64BE(decomp, dOffset);
        dOffset += 8;
      } else {
        recOffset = decompDv.getUint32(dOffset, false);
        dOffset += 4;
      }

      let end = dOffset;
      if (encodingAttr.includes('16')) {
        while (end + 1 < decomp.length && !(decomp[end] === 0 && decomp[end + 1] === 0)) {
          end += 2;
        }
      } else {
        while (end < decomp.length && decomp[end] !== 0) {
          end++;
        }
      }

      const word = textDecoder.decode(decomp.subarray(dOffset, end)).trim();
      dOffset = end + (encodingAttr.includes('16') ? 2 : 1);

      if (word) {
        if (keyEntries.length > 0) {
          keyEntries[keyEntries.length - 1].endOffset = recOffset;
        }
        keyEntries.push({ word, startOffset: recOffset, endOffset: -1 });
      }
    }
  }

  // 5. 读取 Record Block 结构
  pos = currKeyPos;
  let numRecordBlocks = 0;

  if (isV2) {
    numRecordBlocks = readUint64BE(buffer, pos); pos += 8;
    // numRecordEntries (8 字节)
    pos += 8;
    // recordBlockInfoSize (8 字节)
    pos += 8;
    // recordBlockSize (8 字节)
    pos += 8;
  } else {
    numRecordBlocks = dv.getUint32(pos, false); pos += 4;
    // numRecordEntries (4 字节)
    pos += 4;
    // recordBlockInfoSize (4 字节)
    pos += 4;
    // recordBlockSize (4 字节)
    pos += 4;
  }

  const recordBlocks: RecordBlockInfo[] = [];
  let accum = 0;
  for (let i = 0; i < numRecordBlocks; i++) {
    let packSize = 0;
    let unpackSize = 0;
    if (isV2) {
      packSize = readUint64BE(buffer, pos); pos += 8;
      unpackSize = readUint64BE(buffer, pos); pos += 8;
    } else {
      packSize = dv.getUint32(pos, false); pos += 4;
      unpackSize = dv.getUint32(pos, false); pos += 4;
    }
    recordBlocks.push({ packSize, unpackSize, accum });
    accum += unpackSize;
  }

  if (keyEntries.length > 0) {
    keyEntries[keyEntries.length - 1].endOffset = accum;
  }

  const recordDataStart = pos;

  onProgress?.(30, `正在解压释义数据 (${numRecordBlocks} 块，展开大小 ${(accum / 1024 / 1024).toFixed(1)} MB)...`);

  // 6. 遍历 Record Blocks 提取释义并关联单词
  const entriesMap = new Map<string, DictEntryRecord>();
  const rawLinks = new Map<string, string>();

  // 正则模式（兼容牛津第9版、牛津PE高阶精装版、柯林斯、朗文等常见 MDX 双解词典）
  const posPattern = /<pos[^>]*>(?:<xhtml:a[^>]*>)?([^<]+)(?:<\/xhtml:a>)?<\/pos>|<span\s+class=["']pos["'][^>]*>([^<]+)<\/span>/gi;
  const phonPattern = /<phon[^>]*>(.*?)<\/phon>|<span\s+class=["']phon["'][^>]*>(.*?)<\/span>/gi;
  const defPattern = /<def\b[^>]*>(.*?)<\/def>/gis;
  const chnPattern = /<chn\b[^>]*>(.*?)<\/chn>/gis;
  const fallbackPhonPattern = /[/\[]([^\n/\]]{2,25})[/\]]/;
  const fallbackPosPattern = /\b(n\.|v\.|vi\.|vt\.|adj\.|adv\.|prep\.|conj\.|pron\.|num\.)\b/gi;

  let rDataOffset = recordDataStart;
  let keyIndex = 0;

  for (let b = 0; b < numRecordBlocks; b++) {
    const blockMeta = recordBlocks[b];
    const packedBytes = buffer.subarray(rDataOffset, rDataOffset + blockMeta.packSize);
    rDataOffset += blockMeta.packSize;

    // 解压 record block
    let decompBlock: Uint8Array;
    try {
      decompBlock = unzlibSync(packedBytes.subarray(8));
    } catch {
      // 容错：个别小 block 可能未压缩或直接存储
      decompBlock = packedBytes.subarray(8);
    }

    // 找到所有落在当前 block 内部的 keyEntries
    while (
      keyIndex < keyEntries.length &&
      keyEntries[keyIndex].startOffset < blockMeta.accum + blockMeta.unpackSize
    ) {
      const item = keyEntries[keyIndex];
      keyIndex++;

      const relStart = item.startOffset - blockMeta.accum;
      const relEnd = Math.min(
        item.endOffset - blockMeta.accum,
        decompBlock.length
      );

      if (relStart < 0 || relStart >= decompBlock.length) {
        continue;
      }

      const valBytes = decompBlock.subarray(relStart, relEnd > relStart ? relEnd : decompBlock.length);
      const valStr = textDecoder.decode(valBytes).replace(/\0/g, '').trim();

      const wordRaw = item.word.replace(/\0/g, '').trim();
      const wordLower = wordRaw.toLowerCase();

      // 判断是否为 @@@LINK= 跳转重定向词（屈折变化、同义跳转）
      if (valStr.startsWith('@@@LINK=')) {
        const target = valStr.substring(8).replace(/\0/g, '').trim();
        if (target && !rawLinks.has(wordLower)) {
          rawLinks.set(wordLower, target);
        }
        continue;
      }

      if (entriesMap.has(wordLower)) {
        continue;
      }

      // 提取音标
      let phonetic = '';
      const phonMatches = Array.from(valStr.matchAll(phonPattern));
      if (phonMatches.length > 0) {
        phonetic = cleanText(phonMatches[0][1] || phonMatches[0][2] || '').replace(/^\/+|\/+$/g, '').trim();
      } else {
        const fbPhon = valStr.match(fallbackPhonPattern);
        if (fbPhon) {
          phonetic = fbPhon[1].replace(/^\/+|\/+$/g, '').trim();
        }
      }

      // 提取词性
      const posMatches = Array.from(valStr.matchAll(posPattern)).map((m) => cleanText(m[1] || m[2] || ''));
      let posList = Array.from(new Set(posMatches)).filter(Boolean).slice(0, 3);
      if (posList.length === 0) {
        const fbPos = Array.from(valStr.matchAll(fallbackPosPattern)).map((m) => m[1].toLowerCase());
        posList = Array.from(new Set(fbPos)).slice(0, 3);
      }

      // 提取中文释义 / 核心解释
      const defs: string[] = [];

      // 1. 优先提取 OALDPE/精装版词典特有的核心释义标签 <deft><chn>
      const deftMatches = Array.from(valStr.matchAll(/<deft\b[^>]*>(?:<chn\b[^>]*>)?(.*?)(?:<\/chn>)?<\/deft>/gis));
      for (const dm of deftMatches) {
        const cleaned = cleanText(dm[1]);
        if (cleaned && !defs.includes(cleaned)) {
          defs.push(cleaned);
          if (defs.length >= 5) break;
        }
      }

      // 2. 传统双解词典提取（如牛津第9版 <def>...<chn>...）
      if (defs.length === 0) {
        const defMatches = Array.from(valStr.matchAll(defPattern)).slice(0, 8);
        for (const dm of defMatches) {
          const chnMatches = Array.from(dm[1].matchAll(chnPattern));
          for (const cm of chnMatches) {
            const cleaned = cleanText(cm[1]);
            if (cleaned && !defs.includes(cleaned)) {
              defs.push(cleaned);
              if (defs.length >= 5) break;
            }
          }
          if (defs.length >= 5) break;
        }
      }

      // 通用回退提取：若无标准 <def><chn> 标签，则清洗 HTML 提取首选简短中文解释
      if (defs.length === 0) {
        const cleanedLines = cleanText(valStr)
          .split(/\r?\n/)
          .map((l) => l.trim())
          .filter((l) => l.length > 0 && /[\u4e00-\u9fa5]/.test(l));

        for (const l of cleanedLines.slice(0, 4)) {
          if (!defs.includes(l)) {
            defs.push(l);
          }
        }
      }

      entriesMap.set(wordLower, {
        word: wordLower,
        displayWord: wordRaw,
        phonetic,
        pos: posList,
        definitions: defs,
      });
    }

    // 定期进度更新与微任务切片，防止界面无响应
    if (b % 150 === 0 || b === numRecordBlocks - 1) {
      const percent = 30 + Math.floor((b / numRecordBlocks) * 45);
      onProgress?.(
        percent,
        `正在解析词条 (${percent}% - 已处理 ${entriesMap.size.toLocaleString()} 个词条)...`
      );
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
  }

  onProgress?.(80, '正在整理词条跳转与屈折映射...');

  // 7. 解析屈折与跳转
  const links: DictLinkRecord[] = [];
  for (const [src, tgt] of rawLinks.entries()) {
    if (entriesMap.has(src)) {
      continue;
    }
    const tgtLower = tgt.toLowerCase();
    if (entriesMap.has(tgtLower)) {
      links.push({ word: src, target: tgtLower });
    } else if (rawLinks.has(tgtLower)) {
      const secondTgt = rawLinks.get(tgtLower)!.toLowerCase();
      if (entriesMap.has(secondTgt)) {
        links.push({ word: src, target: secondTgt });
      }
    }
  }

  const entries = Array.from(entriesMap.values());

  onProgress?.(85, `解析完成：共 ${entries.length.toLocaleString()} 词条，${links.length.toLocaleString()} 跳转`);

  return {
    title,
    entriesCount: entries.length,
    linksCount: links.length,
    entries,
    links,
  };
}
