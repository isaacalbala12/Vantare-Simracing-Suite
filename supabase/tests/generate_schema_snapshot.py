"""Normalize the disposable migration replay into review-only domain snapshots.

The caller supplies pg_dump and selected local catalog rows. This module never
connects to an environment and cannot apply SQL.
"""
import json
import pathlib
import re

SNAPSHOT_IMAGE = 'public.ecr.aws/supabase/postgres:17.6.1.165'
SNAPSHOT_DIGEST = 'sha256:28f0e16a019e648089fc1a6d333549a55548f6019c15ae4bd7cd58b989027518'
SNAPSHOT_DUMP_OPTIONS = ('--schema-only', '--no-owner')


def verify_snapshot_source(dump, image_digests):
    for label in ('database', 'pg_dump'):
        pattern = (r'^-- Dumped from database version (\S+)' if label == 'database'
                   else r'^-- Dumped by pg_dump version (\S+)')
        match = re.search(pattern, dump, re.M)
        if not match or match[1] != '17.6':
            raise ValueError(f'schema snapshot requires {label} 17.6')
    if not any(value.endswith('@' + SNAPSHOT_DIGEST) for value in image_digests):
        raise ValueError('schema snapshot requires the pinned Supabase image digest')


def canonical_guard_union(query):
    # Only this DISTINCT aggregate with ORDER BY is invariant to UNION order.
    # Keep all other SQL, nested unions and quoted strings byte-for-byte.
    prefix = 'select array_agg(distinct account order by account) filter(where account is not null) from ('
    start = query.find(prefix)
    if start < 0 or '\\' in query or '--' in query or '/*' in query:
        return query
    begin = start + len(prefix)
    depth, quote, index, part = 0, None, begin, begin
    branches = []
    while index < len(query):
        char = query[index]
        if quote:
            if char == quote:
                if index + 1 < len(query) and query[index + 1] == quote:
                    index += 2
                    continue
                quote = None
        elif char in "'\"":
            quote = char
        elif char == '(':
            depth += 1
        elif char == ')':
            if depth == 0:
                if not query[index:].startswith(') owners(account)'):
                    return query
                branches.append(query[part:index].strip())
                return query[:begin] + ' union '.join(sorted(branches)) + query[index:]
            depth -= 1
        elif depth == 0 and query[index - 1].isspace():
            operator = re.match(r'\b(union|except|intersect)\b', query[index:], re.I)
            if operator:
                if operator[1].lower() != 'union':
                    return query
                end = index + len(operator[0])
                if re.match(r'\s+all\b', query[end:], re.I):
                    return query
                if re.match(r'\s+distinct\b', query[end:], re.I):
                    end += re.match(r'\s+distinct\b', query[end:], re.I).end()
                branches.append(query[part:index].strip())
                index = part = end
                continue
        index += 1
    return query


def canonical_guard_trigger(block):
    if 'EXECUTE FUNCTION private.guard_account_write(' not in block:
        return block
    return re.sub(r"'(?:''|[^'])*'", lambda match: "'" + canonical_guard_union(
        match[0][1:-1].replace("''", "'")).replace("'", "''") + "'", block)

PREFIXES = (
    ('testing', ('testing_', 'testing_center_', 'report_', 'native_testing_')),
    ('billing', ('billing_', 'payment_', 'checkout_', 'license_', 'web_purchase_', 'stripe_')),
    ('admin', ('native_admin_', 'admin_')),
    ('roadmap', ('visual_roadmap',)),
    ('identity', ('profiles', 'clerk_', 'native_account_', 'account_', 'pilot_profile_')),
    ('storage', ('storage.',)),
    ('mail', ('mail_',)),
    ('operations', ('operational_',)),
)
HEADER = re.compile(r'^-- Name: (?P<name>.*?); Type: (?P<kind>.*?); Schema: (?P<schema>.*?); Owner:', re.M)
TABLE_REF = re.compile(r'\b(?:ON|TABLE|REFERENCES)\s+(?:ONLY\s+)?(?:"?\w+"?\.)?"?([a-zA-Z_][\w]*)"?', re.I)
VOLATILE = ('-- Dumped from database version', '-- Dumped by pg_dump version', r'\restrict ', r'\unrestrict ')


def domain(name, schema='public', kind='', body=''):
    if schema == 'storage' or name.startswith('storage.'):
        return 'storage'
    # Policies, triggers, indexes and ACL sections are assigned by their table.
    match = TABLE_REF.search(body) if kind in {'POLICY', 'TRIGGER', 'INDEX', 'CONSTRAINT', 'FK CONSTRAINT'} else None
    if match:
        candidate = match.group(1)
    elif name.startswith('COLUMN '):
        candidate = name.removeprefix('COLUMN ').split('.', 1)[0]
    elif name.startswith(('TABLE ', 'FUNCTION ', 'SEQUENCE ')):
        candidate = name.split(' ', 1)[1].split('(', 1)[0]
    else:
        candidate = name.split()[0]
    candidate = candidate.lower().strip('"').rsplit('.', 1)[-1]
    for group, prefixes in PREFIXES:
        if candidate.startswith(prefixes):
            return group
    return 'shared'


def partition_dump(dump):
    lines = [line.rstrip() for line in dump.replace('\r\n', '\n').splitlines()
             if not line.startswith(VOLATILE)]
    text = '\n'.join(lines).strip() + '\n'
    matches = list(HEADER.finditer(text))
    groups = {'shared': text[:matches[0].start()].strip() + '\n' if matches else text}
    for index, match in enumerate(matches):
        # The Docker harness creates this connection helper only for local races.
        if 'vantare_test_dblink_connect(' in match['name']:
            continue
        end = matches[index + 1].start() if index + 1 < len(matches) else len(text)
        block = text[match.start():end].strip() + '\n'
        if match['kind'] == 'TRIGGER':
            block = canonical_guard_trigger(block)
        group = domain(match['name'], match['schema'], match['kind'], block)
        groups.setdefault(group, '')
        groups[group] += '\n' + block
    return {group: content for group, content in sorted(groups.items()) if content.strip()}


def render_catalog_rows(rows):
    result = {}
    for relation, entries in sorted(rows.items()):
        group = domain(relation, relation.split('.')[0], 'CATALOG')
        # JSON keys and rows have canonical order; no runtime IDs or timestamps.
        normalized = sorted(entries, key=lambda row: json.dumps(row, sort_keys=True, ensure_ascii=False))
        body = '\n'.join('-- ' + json.dumps(row, sort_keys=True, ensure_ascii=False)
                         for row in normalized)
        result[group] = result.get(group, '') + f'\n-- Catalog: {relation} ({len(entries)} rows)\n{body}\n'
    return result


def compose(dump, rows):
    groups = partition_dump(dump)
    for group, section in render_catalog_rows(rows).items():
        groups[group] = groups.get(group, '') + section
    return {group: '-- Generated from disposable PostgreSQL; read-only. Do not edit.\n'
                   + content.strip() + '\n'
            for group, content in sorted(groups.items())}


def write_or_check(directory, groups, check=False):
    directory = pathlib.Path(directory)
    expected = {group + '.sql': content for group, content in groups.items()}
    existing = {p.name: p for p in directory.glob('*.sql')} if directory.exists() else {}
    drift = sorted(name for name in expected.keys() | existing.keys()
                   if name not in expected or name not in existing
                   or existing[name].read_text(encoding='utf-8') != expected[name])
    if check:
        return drift
    directory.mkdir(parents=True, exist_ok=True)
    for name in existing.keys() - expected.keys():
        existing[name].unlink()
    for name, content in expected.items():
        (directory / name).write_text(content, encoding='utf-8', newline='\n')
    return []
