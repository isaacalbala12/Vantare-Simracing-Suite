"""Policy for migrations created after ADR 0106; historical SQL is immutable."""
import argparse
import pathlib
import re
import subprocess


ROLES = {'public', 'anon', 'authenticated', 'service_role'}
# The two migrations were merged before the lint entered CI with the real cut.
# Only this diagnostic is waived; other checks (and merged-file immutability)
# still apply to them.
EXCEPTIONS = {
    '20261104110000_isa_1910_smtp_effects.sql': frozenset({'missing_revoke_all'}),
    '20261104120500_isa_1896_legacy_retirement.sql': frozenset({'missing_revoke_all'}),
}
MIGRATION = re.compile(r'^(\d{14})_[a-zA-Z0-9_]+\.sql$')
IDENT = r'(?P<name>(?:[a-zA-Z_][\w]*\.)?[a-zA-Z_][\w]*)'
OBJECT = re.compile(
    rf'\b(?P<verb>create(?:\s+or\s+replace)?|alter)\s+'
    rf'(?P<kind>table|view|sequence|function)\s+'
    rf'(?:only\s+|if\s+(?:not\s+)?exists\s+)*{IDENT}', re.I)
REVOKE = re.compile(
    r'\brevoke\s+all(?:\s+privileges)?\s+on\s+'
    r'(?P<kind>table|sequence|function)\s+'
    r'(?P<objects>[^;]+?)\s+from\s+(?P<roles>[^;]+);', re.I | re.S)
EXECUTE_LITERAL = re.compile(r"\bexecute\s+'(?P<body>(?:''|[^'])*)'\s*;", re.I | re.S)


def without_comments(source: str) -> str:
    """Mask comments, retaining line positions and executable quoted SQL."""
    out = []
    i = 0
    quoted = None
    block_depth = 0
    line_comment = False
    while i < len(source):
        char = source[i]
        next_char = source[i + 1] if i + 1 < len(source) else ''
        if line_comment:
            if char == '\n':
                line_comment = False
                out.append(char)
            else:
                out.append(' ')
        elif block_depth:
            if char == '/' and next_char == '*':
                block_depth += 1
                out.extend('  ')
                i += 1
            elif char == '*' and next_char == '/':
                block_depth -= 1
                out.extend('  ')
                i += 1
            else:
                out.append('\n' if char == '\n' else ' ')
        elif quoted:
            out.append(char)
            if char == quoted:
                if next_char == quoted:
                    out.append(next_char)
                    i += 1
                else:
                    quoted = None
        elif char in ("'", '"'):
            quoted = char
            out.append(char)
        elif char == '-' and next_char == '-':
            line_comment = True
            out.extend('  ')
            i += 1
        elif char == '/' and next_char == '*':
            block_depth = 1
            out.extend('  ')
            i += 1
        else:
            out.append(char)
        i += 1
    return ''.join(out)


def revoke_roles(sql: str, kind: str, name: str) -> set[str]:
    expected_kind = 'function' if kind == 'function' else (
        'sequence' if kind == 'sequence' else 'table')
    # A constant EXECUTE string is executable SQL too. A concatenated string
    # is deliberately excluded: its final ACL cannot be proved statically.
    literal_sql = [match.group('body').replace("''", "'") + ';'
                   for match in EXECUTE_LITERAL.finditer(sql)]
    for match in (m for source in [*literal_sql, sql] for m in REVOKE.finditer(source)):
        if match.group('kind').lower() != expected_kind:
            continue
        objects = match.group('objects').lower()
        # A signature has argument commas; match its name before the opening
        # parenthesis. Table names are followed by a comma or the FROM clause.
        suffix = r'\s*\(' if kind == 'function' else r'\s*(?:,|$)'
        if not re.search(r'(?<![\w.])' + re.escape(name.lower()) + suffix,
                         objects):
            continue
        roles = {part.strip().strip('"').lower()
                 for part in match.group('roles').split(',')}
        if roles >= ROLES:
            return roles
        return roles
    return set()


def check_migration(path: pathlib.Path, rollback: pathlib.Path) -> list[str]:
    errors = []
    if not rollback.is_file() or not rollback.read_text(encoding='utf-8').strip():
        errors.append(f'{path.name}: missing nonempty {rollback.name}')
    else:
        down = without_comments(rollback.read_text(encoding='utf-8'))
        if re.search(r'\bpg_get_functiondef\s*\(', down, re.I):
            errors.append(f'{rollback.name}: pg_get_functiondef is forbidden in new rollbacks')
        if re.search(r'\bauth\s*\.\s*uid\s*\(', down, re.I):
            errors.append(f'{rollback.name}: auth.uid() is forbidden in new rollbacks')
    sql = without_comments(path.read_text(encoding='utf-8'))
    if re.search(r'\bpg_get_functiondef\s*\(', sql, re.I):
        errors.append(f'{path.name}: pg_get_functiondef is forbidden in new migrations')
    if re.search(r'\bauth\s*\.\s*uid\s*\(', sql, re.I):
        errors.append(f'{path.name}: auth.uid() is forbidden in new migrations')
    for match in OBJECT.finditer(sql):
        kind = match.group('kind').lower()
        name = match.group('name').lower()
        if name.startswith('pg_temp.'):
            continue
        if kind == 'function' and match.group('verb').lower() != 'create or replace':
            errors.append(f'{path.name}: {name} must use create or replace function with a full body')
        if kind == 'function':
            next_semicolon = sql.find(';', match.end())
            declaration = sql[match.end():next_semicolon if next_semicolon >= 0 else None]
            if not re.search(r"\bas\s+(?:\$[a-zA-Z_0-9]*\$|')|\bbegin\s+atomic\b",
                             declaration, re.I):
                errors.append(f'{path.name}: {name} needs a full body')
        roles = revoke_roles(sql, kind, name)
        if not ROLES <= roles and 'missing_revoke_all' not in EXCEPTIONS.get(path.name, ()):
            missing = ', '.join(sorted(ROLES - roles))
            errors.append(f'{path.name}: {name} needs REVOKE ALL for {missing}')
    return errors


def merged_migration_errors(root: pathlib.Path, cutoff: str,
                            baseline_ref: str) -> list[str]:
    def git(*args: str) -> subprocess.CompletedProcess[bytes]:
        return subprocess.run(['git', '-C', str(root), *args],
                              capture_output=True)

    top = git('rev-parse', '--show-toplevel')
    baseline = git('rev-parse', '--verify', baseline_ref + '^{commit}')
    if top.returncode or baseline.returncode:
        return [f'baseline {baseline_ref} is unavailable; cannot verify merged migrations']
    repo = pathlib.Path(top.stdout.decode().strip()).resolve()
    prefix = root.resolve().relative_to(repo).as_posix()
    migration_dir = 'migrations' if prefix == '.' else prefix + '/migrations'
    listed = git('ls-tree', '-r', '--name-only', baseline_ref, '--', migration_dir)
    if listed.returncode:
        return [f'baseline {baseline_ref} cannot list merged migrations']

    errors = []
    for path in listed.stdout.decode().splitlines():
        match = MIGRATION.fullmatch(pathlib.PurePosixPath(path).name)
        if not match or match.group(1) <= cutoff:
            continue
        rollback = path.replace('/migrations/', '/rollbacks/').replace(
            '.sql', '.down.sql')
        if prefix == '.':
            rollback = rollback.replace('migrations/', 'rollbacks/', 1)
        for checked in (path, rollback):
            original = git('show', f'{baseline_ref}:{checked}')
            before = original.stdout if original.returncode == 0 else None
            current = repo / pathlib.PurePosixPath(checked)
            after = current.read_bytes() if current.is_file() else None
            # Git may check out the same committed SQL as CRLF on Windows.
            canonical = lambda data: None if data is None else data.replace(b'\r\n', b'\n')
            if canonical(before) != canonical(after):
                errors.append(f'{checked}: already merged in {baseline_ref}; use a new migration')
    return errors


def lint(root: pathlib.Path, cutoff: str,
         baseline_ref: str | None = None) -> tuple[int, list[str]]:
    errors = []
    checked = 0
    if baseline_ref:
        errors.extend(merged_migration_errors(root, cutoff, baseline_ref))
    for path in sorted((root / 'migrations').glob('*.sql')):
        match = MIGRATION.fullmatch(path.name)
        if not match:
            errors.append(f'{path.name}: invalid migration filename')
            continue
        if match.group(1) <= cutoff:
            continue
        checked += 1
        rollback = root / 'rollbacks' / path.name.replace('.sql', '.down.sql')
        errors.extend(check_migration(path, rollback))
    return checked, errors


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--root', type=pathlib.Path,
                        default=pathlib.Path(__file__).resolve().parents[1])
    parser.add_argument('--cutoff', required=True,
                        help='ADR 0106 merge time in UTC, YYYYMMDDHHMMSS')
    parser.add_argument('--baseline-ref',
                        help='Fail when a post-cutoff migration already in this Git ref changed')
    args = parser.parse_args()
    if not re.fullmatch(r'\d{14}', args.cutoff):
        parser.error('--cutoff must be 14 UTC digits')
    checked, errors = lint(args.root, args.cutoff, args.baseline_ref)
    for error in errors:
        print(error)
    if errors:
        print(f'{len(errors)} policy errors in {checked} new migrations')
        return 1
    print(f'{checked} new migrations satisfy ADR 0106')
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
