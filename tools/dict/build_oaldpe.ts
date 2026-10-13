import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { parseMdx } from '../../src/core/dict/mdxParser.ts';

async function build() {
  const mdxPath = path.resolve('tools/dict/Oxford Advanced Learner’s Dictionary/oaldpe.mdx');
  console.log('Reading MDX from:', mdxPath);
  const t0 = Date.now();
  const buffer = fs.readFileSync(mdxPath);
  console.log(`Read ${buffer.length} bytes in ${(Date.now() - t0) / 1000}s`);

  const result = await parseMdx(buffer, (pct, status) => {
    if (pct % 20 === 0) console.log(`[${pct}%] ${status}`);
  });

  console.log(`Parsed in ${(Date.now() - t0) / 1000}s`);
  console.log('Title:', result.title);
  console.log('Entries count:', result.entriesCount);
  console.log('Links count:', result.linksCount);

  console.log('Transforming entries and links into compact dictionary structure...');
  const entriesObj: Record<string, [string, string[], string[], string]> = {};
  for (const e of result.entries) {
    entriesObj[e.word] = [e.phonetic, e.pos, e.definitions, e.displayWord];
  }

  const linksObj: Record<string, string> = {};
  for (const l of result.links) {
    linksObj[l.word] = l.target;
  }

  const payload = {
    version: '1.0',
    name: result.title || 'OALDPE En-Cn 精装版 V2025.02.14',
    entriesCount: result.entriesCount,
    linksCount: result.linksCount,
    entries: entriesObj,
    links: linksObj,
  };

  console.log('Serializing JSON...');
  const jsonStr = JSON.stringify(payload);
  const rawBytes = Buffer.from(jsonStr, 'utf-8');
  console.log(`Serialized JSON size: ${(rawBytes.length / (1024 * 1024)).toFixed(2)} MB`);

  console.log('Compressing with Gzip level 6...');
  const gzBytes = zlib.gzipSync(rawBytes, { level: 6 });
  console.log(`Compressed Gzip size: ${(gzBytes.length / (1024 * 1024)).toFixed(2)} MB`);

  const outDir = path.resolve('public/dict');
  fs.mkdirSync(outDir, { recursive: true });

  const jsonOut = path.join(outDir, 'oald9.v1.json');
  const gzOut = path.join(outDir, 'oald9.v1.json.gz');
  const manifestOut = path.join(outDir, 'manifest.json');

  fs.writeFileSync(jsonOut, rawBytes);
  console.log('Wrote', jsonOut);

  fs.writeFileSync(gzOut, gzBytes);
  console.log('Wrote', gzOut);

  const manifest = {
    version: '1.0',
    name: payload.name,
    entriesCount: payload.entriesCount,
    linksCount: payload.linksCount,
    rawBytes: rawBytes.length,
    gzBytes: gzBytes.length,
    updatedAt: new Date().toISOString(),
  };

  fs.writeFileSync(manifestOut, JSON.stringify(manifest, null, 2), 'utf-8');
  console.log('Wrote', manifestOut);
  console.log('Done successfully in', (Date.now() - t0) / 1000, 's');
}

build().catch((err) => {
  console.error('Build failed:', err);
  process.exit(1);
});

