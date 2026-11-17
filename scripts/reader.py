#!/usr/bin/env python3
"""Prepare local PDF assets and build a standalone study reader."""
import argparse
import base64
import hashlib
import html
import json
import re
import sys
import unicodedata
import uuid
from collections import Counter
from pathlib import Path
from statistics import median
from zipfile import ZIP_DEFLATED, ZipFile

ASSETS = Path(__file__).resolve().parents[1] / 'assets'
FIELDS = ('title', 'idea', 'body', 'key', 'question', 'answer')


def read_json(path):
    return json.loads(path.read_text(encoding='utf-8'))


def replace_file(path, content):
    path.parent.mkdir(parents=True, exist_ok=True)
    temp = path.with_name(path.name + '.new')
    temp.write_text(content, encoding='utf-8')
    temp.replace(path)


def write_json(path, value):
    replace_file(path, json.dumps(value, ensure_ascii=False, indent=2) + '\n')


def glyphs(value):
    return ''.join(c for c in unicodedata.normalize('NFKC', value) if not c.isspace())


def extract_lines(page):
    def pct(number, total):
        return round(100 * number / total, 4)

    page_x, page_y = page.bbox[:2]
    lines = []
    for row in page.extract_text_lines(return_chars=True):
        text = row['text']
        chars = [ch for ch in row['chars'] if glyphs(ch['text'])]
        if not text.strip() or not chars:
            continue
        item = {
            't': text, 'x': pct(row['x0'] - page_x, page.width),
            'y': pct(row['top'] - page_y, page.height),
            'w': pct(row['x1'] - row['x0'], page.width),
            'h': pct(row['bottom'] - row['top'], page.height),
        }
        if glyphs(text) == ''.join(glyphs(ch['text']) for ch in chars):
            boxes = iter((round((ch['x0'] - page_x) / page.width * 10000),
                          round((ch['x1'] - page_x) / page.width * 10000))
                         for ch in chars for _ in glyphs(ch['text']))
            positions = []
            for char in text:
                matches = [next(boxes) for _ in glyphs(char)]
                pair = (min(a for a, _ in matches), max(b for _, b in matches)) if matches else (-1, -1)
                positions.extend(pair * (2 if ord(char) > 0xffff else 1))
            top, bottom = median(ch['top'] for ch in chars), median(ch['bottom'] for ch in chars)
            item['ink'] = [round((top - page_y) / page.height * 10000),
                           round((bottom - page_y) / page.height * 10000), positions]
        lines.append(item)
    return lines


def prepare(args):
    import pdfplumber

    manifest_path = args.work / 'manifest.json'
    manifest = read_json(manifest_path) if manifest_path.exists() else {
        'id': uuid.uuid4().hex, 'title': args.title or args.pdf[0].stem, 'documents': []
    }
    if args.title:
        manifest['title'] = args.title
    known = {doc['sha256'] for doc in manifest['documents']}
    for path in args.pdf:
        with path.open('rb') as stream:
            digest = hashlib.file_digest(stream, 'sha256').hexdigest()
        if digest in known:
            continue
        doc_id = 'D' + digest[:10]
        if any(doc['id'] == doc_id for doc in manifest['documents']):
            raise ValueError(f'Conflicting document IDs for {path.name}')
        folder = args.work / doc_id
        folder.mkdir(parents=True, exist_ok=True)
        entries = []
        with pdfplumber.open(path) as pdf:
            if not pdf.pages:
                raise ValueError(f'Empty PDF: {path.name}')
            for number, page in enumerate(pdf.pages, 1):
                page_id = f'{doc_id}-{number:03}'
                image_path = f'{doc_id}/{number:03}.webp'
                lines = extract_lines(page)
                picture = page.to_image(resolution=120, force_mediabox=True).original
                picture.save(args.work / image_path, format='WEBP', quality=88)
                source = {
                    'id': page_id, 'num': number, 'ratio': picture.width / picture.height,
                    'image': image_path, 'lines': lines,
                    'text': '\n'.join(line['t'] for line in lines),
                }
                write_json(folder / f'{number:03}.json', source)
                entries.append({'id': page_id, 'page': number,
                                'heading_hint': lines[0]['t'] if lines else '',
                                'no_text_layer': not lines,
                                'visual_objects': bool(page.images or page.curves)})
                page.close()
        headings = Counter(visible_text(re.sub(r'\d+$', '', entry['heading_hint'].rstrip()))
                           for entry in entries)
        for entry in entries:
            heading = visible_text(re.sub(r'\d+$', '', entry['heading_hint'].rstrip()))
            if headings[heading] > 1:
                entry['heading_hint'] = ''
        manifest['documents'].append({'id': doc_id, 'label': path.stem,
                                      'sha256': digest, 'pages': entries})
        known.add(digest)
        write_json(manifest_path, manifest)
    for doc in manifest['documents']:
        scans = sum(page['no_text_layer'] for page in doc['pages'])
        print(f"{doc['id']}  {doc['label']}  {len(doc['pages'])} pages, {scans} without a text layer")
    print(manifest_path)


def visible_text(value):
    return re.sub(r'[^\w]', '', unicodedata.normalize('NFKC', value).casefold())


def check_content(content, language, page_id):
    if not isinstance(content, dict) or set(content) != set(FIELDS):
        raise ValueError(f'{page_id} [{language}]: expected {", ".join(FIELDS)}')
    if any(not isinstance(content[key], str) or not content[key].strip() for key in FIELDS):
        raise ValueError(f'{page_id} [{language}]: blank or invalid field')
    core = [visible_text(content[key]) for key in ('idea', 'body', 'question', 'answer')]
    if not all(core) or len(set(core)) != len(core):
        raise ValueError(f'{page_id} [{language}]: repeated or empty study content')


def prepare_reader(args):
    manifest = read_json(args.work / 'manifest.json')
    languages = list(args.languages.split(','))
    if not languages or len(set(languages)) != len(languages) or set(languages) - {'zh', 'en'}:
        raise ValueError('Languages must be zh, en, zh,en, or en,zh')
    documents = manifest['documents']
    page_ids = {page['id'] for doc in documents for page in doc['pages']}
    requested = set(args.pages or page_ids)
    if not requested or requested - page_ids:
        raise ValueError(f'Unknown or empty preview selection: {sorted(requested - page_ids)}')
    if args.pages and args.out.name == 'study-reader.html':
        raise ValueError('Use a separate filename for preview output')
    notes = read_json(args.notes) if args.notes else {}
    if not isinstance(notes, dict) or set(notes) - page_ids:
        raise ValueError('Notes must be an object keyed by known page ID')
    if args.mode != 'light':
        missing = requested - set(notes)
        if missing:
            raise ValueError(f'{len(missing)} page(s) missing notes: {", ".join(sorted(missing)[:8])}')

    data, config_docs = [], []
    for doc in documents:
        entries = [entry for entry in doc['pages'] if entry['id'] in requested]
        if not entries:
            continue
        config_docs.append({'id': doc['id'], 'label': doc['label'], 'total': len(doc['pages'])})
        for index, entry in enumerate(entries, 1):
            page_id = entry['id']
            source = read_json(args.work / doc['id'] / f"{entry['page']:03}.json")
            if source['id'] != page_id:
                raise ValueError(f'Mismatched page data for {page_id}')
            original = entry['heading_hint'] or f"{doc['label']} · {entry['page']}"
            if args.mode == 'light':
                content = {lang: dict.fromkeys(FIELDS, '') for lang in languages}
                for item in content.values():
                    item['title'] = original
            else:
                content = notes[page_id]
                if not isinstance(content, dict):
                    raise ValueError(f'{page_id}: expected entries keyed by language')
                for lang in languages:
                    check_content(content.get(lang), lang, page_id)
            source_text = source['text']
            picture = (args.work / source['image']).read_bytes()
            page = {
                'id': page_id, 'course': doc['id'], 'label': doc['label'], 'num': index,
                'sourcePage': entry['page'], 'original': original, 'ratio': source['ratio'],
                'img': 'data:image/webp;base64,' + base64.b64encode(picture).decode('ascii'),
                'lines': source['lines'], 'sourceText': source_text,
                'zh': content.get('zh', content[languages[0]]),
                'en': content.get('en', content[languages[0]]),
            }
            data.append(page)
    config = {'id': manifest['id'] + (':preview' if args.pages else ''), 'title': manifest['title'],
              'languages': languages, 'documents': config_docs, 'mode': args.mode,
              'groups': {}, 'preview': bool(args.pages), 'aiHandoff': args.ai_handoff}
    return config, data


def serialize(value):
    return json.dumps(value, ensure_ascii=False, separators=(',', ':')).replace('<', '\\u003c')


def build(args):
    if args.zip and args.zip.resolve() == args.out.resolve():
        raise ValueError('ZIP and HTML must have different paths')
    config, data = prepare_reader(args)
    def asset(name):
        return (ASSETS / name).read_text(encoding='utf-8')

    vendor = ['/*\n' + asset(f'vendor/{lib}.LICENSE') + '\n*/\n' + asset(f'vendor/{lib}.min.js')
              for lib in ('marked', 'katex')]
    # The reader declares shared state before the event handlers that consume it.
    reader = asset('reader.js')
    init_marker = 'document.documentElement.dataset.mode=CONFIG.mode;'
    main, init = reader.split(init_marker, 1)
    scripts = vendor + [asset('i18n.js'), asset('study-format.js'), main,
                        asset('reader-workflow.js'), asset('editor.js'), asset('ai-handoff.js'), init_marker + init, asset('reader-tour.js')]
    parts = {'TITLE': html.escape(config['title']), 'CSS': asset('style.css'), 'JS': '\n'.join(scripts),
             'CONFIG': serialize(config), 'DATA': serialize(data)}
    result = re.sub(r'__(TITLE|CSS|JS|CONFIG|DATA)__', lambda m: parts[m[1]], asset('shell.html'))
    replace_file(args.out, result)
    if args.zip:
        args.zip.parent.mkdir(parents=True, exist_ok=True)
        temp = args.zip.with_name(args.zip.name + '.new')
        with ZipFile(temp, 'w', ZIP_DEFLATED) as package:
            package.write(args.out, args.out.name)
            zh = [
                f'解压后用浏览器打开 {args.out.name}，即可离线阅读。',
                '首次打开可跟随分步引导，也可通过「更多 → 使用引导」重看。',
                '选中文字可高亮或摘入 Cheat sheet，支持打印双面 A4。',
                '笔记保存在当前浏览器，可导出 Markdown。',
            ]
            en = [
                f'Unzip and open {args.out.name} in your browser to read offline.',
                'Follow the first-open tour or reopen it from More → Quick tour.',
                'Select text to highlight it or add it to the printable two-sided A4 cheat sheet.',
                'Notes stay in this browser and can be exported as Markdown.',
            ]
            if len(config['languages']) > 1:
                zh.append('用工具栏的语言按钮切换中文与英文。')
                en.append('Use the toolbar language button to switch between Chinese and English.')
            if config['aiHandoff']:
                zh.append('点「AI 提问」，将问题和当前页内容复制到自己的 AI 对话。无需启动器或 API Key。')
                en.append('Use Ask AI to copy your question and current page into your own AI chat. No launcher or API key is needed.')
            package.writestr('使用说明.txt', '\n'.join(zh + [''] + en) + '\n')
        temp.replace(args.zip)
    print(f'{args.out} · {len(data)} pages · {args.mode} · {args.languages}')


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    sub = parser.add_subparsers(dest='command', required=True)
    ingest = sub.add_parser('prepare', help='Extract text and render source pages')
    ingest.add_argument('--work', type=Path, required=True)
    ingest.add_argument('--title')
    ingest.add_argument('pdf', nargs='+', type=Path)
    emit = sub.add_parser('build', help='Validate notes and build preview or final HTML')
    emit.add_argument('--work', type=Path, required=True)
    emit.add_argument('--notes', type=Path)
    emit.add_argument('--languages', default='zh')
    emit.add_argument('--mode', choices=('light', 'standard', 'detailed'), default='standard')
    emit.add_argument('--ai-handoff', action='store_true', help='Enable copyable AI questions with page context')
    emit.add_argument('--pages', nargs='+', help='Selected page IDs for preview only')
    emit.add_argument('--out', type=Path, required=True)
    emit.add_argument('--zip', type=Path)
    args = parser.parse_args()
    try:
        (prepare if args.command == 'prepare' else build)(args)
    except (ImportError, OSError, ValueError) as error:
        parser.exit(1, f'{error}\n')


if __name__ == '__main__':
    main()
