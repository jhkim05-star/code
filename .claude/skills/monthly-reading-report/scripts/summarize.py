#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""독서·영상 기록 내보내기 파일을 읽어 기간별 집계를 JSON 으로 내놓는다.

'책꽂이 · 기록' 앱의 내보내기 3종을 모두 받는다.
  - 독서영상기록_YYYYMMDD_HHMM.xlsx  (책 / 비디오장 / 기간별 통계 / 분포 4개 시트)
  - 독서기록_*.csv, 영상기록_*.csv   (한 종류만 담긴 표)
  - 기록백업_*.json                  (원본 필드명 그대로인 전체 백업)

표준 라이브러리만 쓴다. xlsx 는 zip + XML 이라 openpyxl 없이 직접 읽는다.
집계를 사람이 손으로 하면 합계·평균이 어긋나기 쉬우므로 숫자는 전부 여기서 만든다.

사용법:
    python3 summarize.py FILE [FILE2 ...] [--month 2026-09] [--week 2026-W36]
                              [--out summary.json]
기간을 주지 않으면 기록이 있는 가장 최근 달을 고른다.
"""

import argparse
import csv
import io
import json
import os
import re
import sys
import zipfile
import xml.etree.ElementTree as ET
from collections import Counter, OrderedDict
from datetime import date, datetime, timedelta

NS = '{http://schemas.openxmlformats.org/spreadsheetml/2006/main}'


# --------------------------------------------------------------------------
# 파일 읽기
# --------------------------------------------------------------------------

def _col_index(ref):
    """'BC12' -> 54 (0-based 열 번호)"""
    letters = ''.join(ch for ch in ref if ch.isalpha())
    n = 0
    for ch in letters:
        n = n * 26 + (ord(ch.upper()) - 64)
    return n - 1


def read_xlsx(path):
    """{시트이름: [[셀, ...], ...]} 를 돌려준다. inlineStr 과 sharedStrings 둘 다 처리."""
    out = OrderedDict()
    with zipfile.ZipFile(path) as z:
        names = z.namelist()

        shared = []
        if 'xl/sharedStrings.xml' in names:
            root = ET.fromstring(z.read('xl/sharedStrings.xml'))
            for si in root.findall(NS + 'si'):
                shared.append(''.join(t.text or '' for t in si.iter(NS + 't')))

        # 시트 이름 ← rId ← 파일 경로
        rels = {}
        if 'xl/_rels/workbook.xml.rels' in names:
            rroot = ET.fromstring(z.read('xl/_rels/workbook.xml.rels'))
            for rel in rroot:
                rid = rel.get('Id')
                target = rel.get('Target', '')
                if target.startswith('/'):
                    target = target[1:]
                elif not target.startswith('xl/'):
                    target = 'xl/' + target
                rels[rid] = target

        sheets = []
        wroot = ET.fromstring(z.read('xl/workbook.xml'))
        for sh in wroot.iter(NS + 'sheet'):
            rid = None
            for k, v in sh.attrib.items():
                if k.endswith('}id'):
                    rid = v
            sheets.append((sh.get('name'), rels.get(rid)))

        for sheet_name, target in sheets:
            if not target or target not in names:
                continue
            rows = []
            sroot = ET.fromstring(z.read(target))
            for row in sroot.iter(NS + 'row'):
                cells = []
                for c in row.findall(NS + 'c'):
                    idx = _col_index(c.get('r', 'A1'))
                    while len(cells) < idx:
                        cells.append('')
                    t = c.get('t')
                    if t == 'inlineStr':
                        is_el = c.find(NS + 'is')
                        val = ''.join(x.text or '' for x in is_el.iter(NS + 't')) if is_el is not None else ''
                    elif t == 's':
                        v = c.find(NS + 'v')
                        val = shared[int(v.text)] if v is not None and v.text else ''
                    else:
                        v = c.find(NS + 'v')
                        val = v.text if v is not None and v.text is not None else ''
                    cells.append(val)
                rows.append(cells)
            out[sheet_name] = rows
    return out


def read_csv(path):
    with io.open(path, encoding='utf-8-sig', newline='') as f:
        return [r for r in csv.reader(f)]


def rows_to_dicts(rows):
    if not rows:
        return []
    header = [str(h).strip() for h in rows[0]]
    out = []
    for r in rows[1:]:
        if not any(str(x).strip() for x in r):
            continue
        d = {}
        for i, h in enumerate(header):
            d[h] = r[i].strip() if i < len(r) and r[i] is not None else ''
        out.append(d)
    return out


# --------------------------------------------------------------------------
# 표 → 공통 레코드
# 시트/CSV 는 사람이 읽는 한글 열 이름, JSON 백업은 원본 필드명이라 양쪽을 맞춘다.
# --------------------------------------------------------------------------

ORIGIN_LABEL = {'domestic': '한국', 'foreign': '외국', '': ''}
FORMAT_LABEL = {'paper': '종이책', 'ebook': '전자책', 'audio': '오디오북', '': ''}
KIND_LABEL = {'movie': '영화', 'series': '시리즈', '': ''}
STATUS_LABEL = {'planned': '읽을 예정', 'reading': '읽는 중', 'finished': '완독'}


def num(v, default=None):
    try:
        s = str(v).replace(',', '').strip()
        if s == '':
            return default
        f = float(s)
        return int(f) if f == int(f) else f
    except (TypeError, ValueError):
        return default


def book_from_row(d):
    return {
        'status': d.get('상태', ''),
        'title': d.get('제목', ''),
        'authors': d.get('저자', ''),
        'translator': d.get('옮긴이', ''),
        'publisher': d.get('출판사', ''),
        'published': d.get('발행일', ''),
        'pages': num(d.get('페이지'), None),
        'genre': d.get('장르', '') or '미분류',
        'origin': d.get('한국/외국', '') or '미상',
        'format': d.get('종이책 여부', '') or '미상',
        'rating': num(d.get('별점'), None),
        'started': d.get('읽기 시작', ''),
        'finished': d.get('완독일', ''),
        'duration': num(d.get('읽은 기간(일)'), None),
        'oneliner': d.get('한줄평', ''),
        'note': d.get('독서록', ''),
    }


def book_from_json(b):
    authors = b.get('authors') or []
    if isinstance(authors, str):
        authors = [authors]
    return {
        'status': STATUS_LABEL.get(b.get('status', ''), b.get('status', '')),
        'title': b.get('title', ''),
        'authors': ', '.join(authors),
        'translator': b.get('translator', ''),
        'publisher': b.get('publisher', ''),
        'published': b.get('publishedDate', ''),
        'pages': num(b.get('pageCount'), None),
        'genre': b.get('genre') or '미분류',
        'origin': ORIGIN_LABEL.get(b.get('origin', ''), '') or '미상',
        'format': FORMAT_LABEL.get(b.get('format', ''), '') or '미상',
        'rating': num(b.get('rating'), None),
        'started': b.get('startedAt', ''),
        'finished': b.get('finishedAt', ''),
        'duration': num(b.get('durationDays'), None),
        'oneliner': b.get('oneLiner', ''),
        'note': b.get('note', ''),
    }


def video_from_row(d):
    return {
        'kind': d.get('종류', ''),
        'title': d.get('제목', ''),
        'director': d.get('감독/제작', '') or d.get('감독', ''),
        'released': d.get('개봉·방영일', ''),
        'genre': d.get('장르', '') or '미분류',
        'country': d.get('제작국가', ''),
        'origin': d.get('한국/외국', '') or '미상',
        'runtime': num(d.get('러닝타임(분)'), None),
        'episodes': num(d.get('편수'), None),
        'minutes': num(d.get('총 시청시간(분)'), 0) or 0,
        'platform': d.get('플랫폼', '') or '미기재',
        'rating': num(d.get('별점'), None),
        'watched': d.get('본 날짜', ''),
        'oneliner': d.get('한줄평', ''),
        'note': d.get('감상평', ''),
    }


def video_from_json(v):
    runtime = num(v.get('runtimeMin'), 0) or 0
    eps = num(v.get('episodes'), 0) or 0
    minutes = runtime * (eps or 1) if v.get('kind') == 'series' else runtime
    return {
        'kind': KIND_LABEL.get(v.get('kind', ''), v.get('kind', '')),
        'title': v.get('title', ''),
        'director': v.get('director', ''),
        'released': v.get('releaseDate', ''),
        'genre': v.get('genre') or '미분류',
        'country': v.get('country', ''),
        'origin': ORIGIN_LABEL.get(v.get('origin', ''), '') or '미상',
        'runtime': runtime or None,
        'episodes': eps or None,
        'minutes': minutes,
        'platform': v.get('platform', '') or '미기재',
        'rating': num(v.get('rating'), None),
        'watched': v.get('watchedAt', ''),
        'oneliner': v.get('oneLiner', ''),
        'note': v.get('note', ''),
    }


BOOK_HINTS = ('읽은 기간(일)', '완독일', '읽기 시작', '독서록')
VIDEO_HINTS = ('본 날짜', '총 시청시간(분)', '감상평', '러닝타임(분)')


def load(paths):
    books, videos = [], []
    for path in paths:
        ext = os.path.splitext(path)[1].lower()
        if ext == '.json':
            with io.open(path, encoding='utf-8') as f:
                data = json.load(f)
            books += [book_from_json(b) for b in data.get('books', [])]
            videos += [video_from_json(v) for v in data.get('videos', [])]
        elif ext in ('.xlsx', '.xlsm'):
            for name, rows in read_xlsx(path).items():
                dicts = rows_to_dicts(rows)
                if not dicts:
                    continue
                keys = set(dicts[0].keys())
                if keys & set(BOOK_HINTS):
                    books += [book_from_row(d) for d in dicts]
                elif keys & set(VIDEO_HINTS):
                    videos += [video_from_row(d) for d in dicts]
                # 기간별 통계·분포 시트는 여기서 다시 계산하므로 무시
        elif ext in ('.csv', '.tsv'):
            dicts = rows_to_dicts(read_csv(path))
            if not dicts:
                continue
            keys = set(dicts[0].keys())
            if keys & set(BOOK_HINTS):
                books += [book_from_row(d) for d in dicts]
            elif keys & set(VIDEO_HINTS):
                videos += [video_from_row(d) for d in dicts]
            else:
                sys.stderr.write('경고: %s 의 열 이름을 알아보지 못해 건너뜁니다.\n' % path)
        else:
            sys.stderr.write('경고: 지원하지 않는 형식 %s\n' % path)

    # 같은 파일을 두 번 넣거나 xlsx 와 csv 를 함께 넣은 경우 중복 제거
    def dedup(items, keyfn):
        seen, out = set(), []
        for it in items:
            k = keyfn(it)
            if k in seen:
                continue
            seen.add(k)
            out.append(it)
        return out

    books = dedup(books, lambda b: (b['title'], b['finished'], b['started']))
    videos = dedup(videos, lambda v: (v['title'], v['watched']))
    return books, videos


# --------------------------------------------------------------------------
# 기간
# --------------------------------------------------------------------------

def parse_date(s):
    if not s:
        return None
    m = re.match(r'^(\d{4})[-./](\d{1,2})[-./](\d{1,2})', str(s).strip())
    if not m:
        return None
    try:
        return date(int(m.group(1)), int(m.group(2)), int(m.group(3)))
    except ValueError:
        return None


def month_key(d):
    return '%04d-%02d' % (d.year, d.month) if d else ''


def week_key(d):
    if not d:
        return ''
    y, w, _ = d.isocalendar()
    return '%04d-W%02d' % (y, w)


def month_range(key):
    y, m = int(key[:4]), int(key[5:7])
    start = date(y, m, 1)
    end = date(y + (m == 12), (m % 12) + 1, 1) - timedelta(days=1)
    return start, end


def week_range(key):
    y, w = int(key[:4]), int(key[6:])
    start = date.fromisocalendar(y, w, 1) if hasattr(date, 'fromisocalendar') \
        else datetime.strptime('%d-W%02d-1' % (y, w), '%G-W%V-%u').date()
    return start, start + timedelta(days=6)


def prev_key(key, kind):
    if kind == 'month':
        start, _ = month_range(key)
        p = start - timedelta(days=1)
        return month_key(p)
    start, _ = week_range(key)
    return week_key(start - timedelta(days=7))


def label_for(key, kind):
    if kind == 'month':
        return "'%s년 %d월" % (key[2:4], int(key[5:7]))
    start, end = week_range(key)
    return "'%s년 %d주차(%d.%d.~%d.%d.)" % (
        key[2:4], int(key[6:]), start.month, start.day, end.month, end.day)


# --------------------------------------------------------------------------
# 집계
# --------------------------------------------------------------------------

def avg(vals):
    vals = [v for v in vals if v is not None]
    return round(sum(vals) / len(vals), 1) if vals else None


def top(counter, n=None):
    items = sorted(counter.items(), key=lambda kv: (-kv[1], kv[0]))
    return [[k, v] for k, v in (items[:n] if n else items)]


def summarize_books(books):
    pages = [b['pages'] for b in books if b['pages']]
    ratings = [b['rating'] for b in books if b['rating']]
    durations = [(b['duration'], b['title']) for b in books if b['duration']]
    longest = max(durations)[::-1] if durations else None
    shortest = min(durations)[::-1] if durations else None
    author_counter = Counter()
    for b in books:
        first = (b['authors'] or '').split(',')[0].strip()
        if first:
            author_counter[first] += 1
    return {
        'count': len(books),
        'pages': sum(pages),
        'rated_count': len(ratings),
        'avg_rating': avg(ratings),
        'avg_duration_days': avg([d for d, _ in durations]),
        'longest': {'title': longest[0], 'days': longest[1]} if longest else None,
        'shortest': {'title': shortest[0], 'days': shortest[1]} if shortest else None,
        'genres': top(Counter(b['genre'] for b in books)),
        'origin': top(Counter(b['origin'] for b in books)),
        'format': top(Counter(b['format'] for b in books)),
        'authors': [a for a in top(author_counter) if a[1] > 1],
        'items': sorted(books, key=lambda b: b['finished'] or ''),
    }


def hm(minutes):
    """614 -> '10시간 14분'. 보고서에 그대로 옮겨 쓰라고 미리 만들어 둔다."""
    minutes = int(round(minutes or 0))
    h, m = divmod(minutes, 60)
    if h and m:
        return '%d시간 %d분' % (h, m)
    if h:
        return '%d시간' % h
    return '%d분' % m


def summarize_videos(videos):
    ratings = [v['rating'] for v in videos if v['rating']]
    minutes = sum(v['minutes'] or 0 for v in videos)
    # 시리즈는 화수, 영화는 1편으로 세어 합한 '총 회차 수'.
    # 개별 시리즈의 화수가 아니므로 보고서에 그대로 옮길 때 주의.
    total_episodes = sum((v['episodes'] or 1) if v['kind'] == '시리즈' else 1 for v in videos)
    series = [v for v in videos if v['kind'] == '시리즈']
    return {
        'count': len(videos),
        'minutes': minutes,
        'minutes_label': hm(minutes),
        'hours': round(minutes / 60.0, 1) if minutes else 0,
        'total_episodes': total_episodes,
        'series_count': len(series),
        'movie_count': len(videos) - len(series),
        'rated_count': len(ratings),
        'avg_rating': avg(ratings),
        'kinds': top(Counter(v['kind'] for v in videos)),
        'genres': top(Counter(v['genre'] for v in videos)),
        'origin': top(Counter(v['origin'] for v in videos)),
        'platforms': top(Counter(v['platform'] for v in videos)),
        'items': [dict(v, minutes_label=hm(v['minutes'])) for v in
                  sorted(videos, key=lambda v: v['watched'] or '')],
    }


def pick(items, datefield, key, kind):
    keyfn = month_key if kind == 'month' else week_key
    return [it for it in items if keyfn(parse_date(it[datefield])) == key]


def main():
    ap = argparse.ArgumentParser(description='독서·영상 기록 기간별 집계')
    ap.add_argument('files', nargs='+', help='xlsx / csv / json 내보내기 파일')
    ap.add_argument('--month', help='대상 월 (예: 2026-09)')
    ap.add_argument('--week', help='대상 주 (예: 2026-W36)')
    ap.add_argument('--out', help='결과 JSON 저장 경로')
    args = ap.parse_args()

    books, videos = load(args.files)
    if not books and not videos:
        sys.stderr.write('오류: 읽어들인 기록이 없습니다. 파일 형식을 확인하세요.\n')
        return 2

    if args.week:
        kind, key = 'week', args.week.upper()
    elif args.month:
        kind, key = 'month', args.month
    else:
        kind = 'month'
        keys = [month_key(parse_date(b['finished'])) for b in books] + \
               [month_key(parse_date(v['watched'])) for v in videos]
        keys = sorted(k for k in keys if k)
        if not keys:
            sys.stderr.write('오류: 완독일·본 날짜가 있는 기록이 없어 기간을 정할 수 없습니다.\n')
            return 2
        key = keys[-1]

    start, end = month_range(key) if kind == 'month' else week_range(key)
    pkey = prev_key(key, kind)

    cur_b = pick(books, 'finished', key, kind)
    cur_v = pick(videos, 'watched', key, kind)
    prev_b = pick(books, 'finished', pkey, kind)
    prev_v = pick(videos, 'watched', pkey, kind)

    cb, cv = summarize_books(cur_b), summarize_videos(cur_v)
    pb, pv = summarize_books(prev_b), summarize_videos(prev_v)

    all_finished = [b for b in books if b['status'] == '완독' or b['finished']]
    reading = [b for b in books if b['status'] == '읽는 중']
    planned = [b for b in books if b['status'] == '읽을 예정']

    result = {
        'period': {
            'kind': kind, 'key': key, 'label': label_for(key, kind),
            'start': start.isoformat(), 'end': end.isoformat(),
            'prev_key': pkey, 'prev_label': label_for(pkey, kind),
        },
        'books': cb,
        'videos': cv,
        'prev': {'books': {'count': pb['count'], 'pages': pb['pages'],
                           'avg_rating': pb['avg_rating'],
                           'avg_duration_days': pb['avg_duration_days']},
                 'videos': {'count': pv['count'], 'minutes': pv['minutes'],
                            'minutes_label': pv['minutes_label']}},
        'delta': {
            'books_count': cb['count'] - pb['count'],
            'pages': cb['pages'] - pb['pages'],
            'videos_count': cv['count'] - pv['count'],
            'minutes': cv['minutes'] - pv['minutes'],
            'minutes_label': hm(abs(cv['minutes'] - pv['minutes'])),
        },
        'in_progress': [{'title': b['title'], 'authors': b['authors'],
                         'started': b['started']} for b in reading],
        'planned_count': len(planned),
        'planned_titles': [b['title'] for b in planned],
        'all_time': {
            'books': len(all_finished),
            'pages': sum(b['pages'] or 0 for b in all_finished),
            'videos': len(videos),
            'minutes': sum(v['minutes'] or 0 for v in videos),
            'minutes_label': hm(sum(v['minutes'] or 0 for v in videos)),
        },
        'source_counts': {'books_in_file': len(books), 'videos_in_file': len(videos)},
    }

    text = json.dumps(result, ensure_ascii=False, indent=2)
    if args.out:
        with io.open(args.out, 'w', encoding='utf-8') as f:
            f.write(text)
        sys.stderr.write('저장: %s\n' % args.out)
    print(text)
    return 0


if __name__ == '__main__':
    sys.exit(main())
