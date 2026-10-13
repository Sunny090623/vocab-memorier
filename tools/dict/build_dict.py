import sys, os, time, json, gzip, re, types

sys.stdout.reconfigure(encoding='utf-8')
sys.modules.setdefault('lzo', types.ModuleType('lzo'))
from readmdict import MDX

def clean_text(s):
    s = re.sub(r'<[^>]+>', '', s)
    s = s.replace('\xa0', ' ').strip()
    return s

def build():
    dict_dirs = [d for d in os.listdir('.') if os.path.isdir(d) and ('牛津' in d or 'oalecd' in d.lower())]
    if not dict_dirs:
        raise RuntimeError('Dictionary folder not found')
    dict_dir = dict_dirs[0]
    mdx_files = [f for f in os.listdir(dict_dir) if f.endswith('.mdx')]
    if not mdx_files:
        raise RuntimeError('MDX file not found')
    dict_path = os.path.join(dict_dir, mdx_files[0])

    out_dir = os.path.join('public', 'dict')
    os.makedirs(out_dir, exist_ok=True)
    out_gz = os.path.join(out_dir, 'oald9.v1.json.gz')
    out_manifest = os.path.join(out_dir, 'manifest.json')

    print(f'Reading MDX from {dict_path}...')
    t0 = time.time()
    mdx = MDX(dict_path)
    print(f'Loaded index ({len(mdx)} records) in {time.time()-t0:.2f}s')

    entries = {}
    raw_links = {}

    pos_pattern = re.compile(r'<pos>(?:<xhtml:a[^>]*>)?([^<]+)(?:</xhtml:a>)?</pos>')
    phon_pattern = re.compile(r'<phon>(.*?)</phon>')
    def_pattern = re.compile(r'<def\b[^>]*>(.*?)</def>', re.DOTALL)
    chn_pattern = re.compile(r'<chn\b[^>]*>(.*?)</chn>', re.DOTALL)

    for k, v in mdx.items():
        word_raw = k.decode('utf-8', errors='ignore').strip()
        word_lower = word_raw.lower()
        if not word_lower:
            continue

        val_str = v.decode('utf-8', errors='ignore').strip()
        if val_str.startswith('@@@LINK='):
            target = val_str[8:].strip()
            if target and word_lower not in raw_links:
                raw_links[word_lower] = target
            continue

        if word_lower in entries:
            continue

        phons = phon_pattern.findall(val_str)
        phon = clean_text(phons[0]) if phons else ''

        pos_list = list(dict.fromkeys(pos_pattern.findall(val_str)))[:3]

        defs = []
        for def_match in def_pattern.findall(val_str)[:8]:
            chns = chn_pattern.findall(def_match)
            for chn in chns:
                cleaned = clean_text(chn)
                if cleaned and cleaned not in defs:
                    defs.append(cleaned)
                    if len(defs) >= 5:
                        break
            if len(defs) >= 5:
                break

        entries[word_lower] = [phon, pos_list, defs, word_raw]

    print(f'Parsed {len(entries)} entries and {len(raw_links)} links in {time.time()-t0:.2f}s')

    resolved_links = {}
    for src, tgt in raw_links.items():
        if src in entries:
            continue
        tgt_lower = tgt.lower()
        if tgt_lower in entries:
            resolved_links[src] = tgt_lower
        elif tgt_lower in raw_links and raw_links[tgt_lower].lower() in entries:
            resolved_links[src] = raw_links[tgt_lower].lower()

    payload = {
        'version': '1.0',
        'name': "Oxford Advanced Learner's Dictionary 9th Edition",
        'entriesCount': len(entries),
        'linksCount': len(resolved_links),
        'entries': entries,
        'links': resolved_links
    }

    json_bytes = json.dumps(payload, ensure_ascii=False, separators=(',', ':')).encode('utf-8')
    with gzip.open(out_gz, 'wb', compresslevel=6) as f:
        f.write(json_bytes)

    manifest = {
        'version': '1.0',
        'entriesCount': len(entries),
        'linksCount': len(resolved_links),
        'rawBytes': len(json_bytes),
        'gzBytes': os.path.getsize(out_gz),
        'updatedAt': time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime())
    }
    with open(out_manifest, 'w', encoding='utf-8') as f:
        json.dump(manifest, f, indent=2)

    print(f"Done: {out_gz} ({manifest['gzBytes']/1024/1024:.2f} MB)")

if __name__ == '__main__':
    build()