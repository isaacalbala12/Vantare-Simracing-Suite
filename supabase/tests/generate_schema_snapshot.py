"""Normalize the disposable migration replay into review-only domain snapshots.

The caller supplies pg_dump and selected local catalog rows. This module never
connects to an environment and cannot apply SQL.
"""
import json
import pathlib
import re

PREFIXES = (
    ('testing', ('testing_', 'testing_center_', 'report_', 'native_testing_')),
    ('billing', ('billing_', 'payment_', 'checkout_', 'license_', 'web_purchase_', 'stripe_')),
    ('admin', ('native_admin_', 'admin_')),
    ('roadmap', ('visual_roadmap',)),
    ('identity', ('profiles', 'clerk_', 'native_account_', 'account_', 'pilot_profile_')),
    ('storage', ('storage.',)),
)
HEADER = re.compile(r'^-- Name: (?P<name>.*?); Type: (?P<kind>.*?); Schema: (?P<schema>.*?); Owner:', re.M)
TABLE_REF = re.compile(r'\b(?:ON|TABLE|REFERENCES)\s+(?:ONLY\s+)?(?:"?\w+"?\.)?"?([a-zA-Z_][\w]*)"?', re.I)
VOLATILE = ('-- Dumped from database version', '-- Dumped by pg_dump version', r'\restrict ', r'\unrestrict ')


def domain(name, schema='public', kind='', body=''):
    if schema == 'storage' or name.startswith('storage.'):
        return 'storage'
    # Policies, triggers, indexes and ACL sections are assigned by their table.
    match = TABLE_REF.search(body) if kind in {'POLICY', 'TRIGGER', 'INDEX', 'CONSTRAINT', 'FK CONSTRAINT'} else None
    candidate = (match.group(1) if match else name.split()[0]).lower().strip('"').rsplit('.', 1)[-1]
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
        end = matches[index + 1].start() if index + 1 < len(matches) else len(text)
        block = text[match.start():end].strip() + '\n'
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
