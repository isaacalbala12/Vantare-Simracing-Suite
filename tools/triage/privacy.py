"""Second redaction. Standard library only; no identifiers or full logs to the model."""
import ipaddress
import hashlib
import json
import math
import re
from pathlib import Path

REDACTED = '<redacted>'
REMOVED = '[contenido retirado por privacidad]'
MAX_DEPTH = 32
PRIVATE_KEYS = {'accesstoken', 'refreshtoken', 'accountid', 'hostname', 'computername',
                'username', 'gamertag', 'token', 'apikey', 'licensekey', 'license',
                'password', 'authorization', 'key', 'email'}


def private_key(key):
    return key.lower().replace('_', '').replace('-', '') in PRIVATE_KEYS


def redact(text, depth=0):
    text = str(text)
    if depth >= MAX_DEPTH:
        return REDACTED
    stripped = text.lstrip()
    if stripped.startswith(('{', '[', '"')):
        try:
            value = json.loads(text)
            # Reject nonstandard numbers and invalid Unicode on serialization.
            clean = json.dumps(_clean_tree(value, depth + 1), ensure_ascii=False,
                               sort_keys=True, separators=(',', ':'), allow_nan=False)
            clean.encode('utf-8')
            return clean
        except (ValueError, RecursionError, UnicodeError):
            return REDACTED
    # An embedded fragment has no trustworthy end, including across lines.
    starts = [text.find(mark) for mark in ('{', '[', r'\"', r'\u0022') if mark in text]
    if starts:
        prefix = free_text(text[:min(starts)])
        return prefix if prefix.endswith(REDACTED) else prefix + REDACTED
    return free_text(text)


def external_text(text, limit):
    """Inspect the complete field before flattening/truncating. Fail closed."""
    text = str(text)
    if text == REMOVED:
        return text[:limit]
    cleaned = redact(text)
    if cleaned != text or any(mark in text for mark in
                              (REDACTED, '<redactado>', '<user>', '<ruta>', '<persona>')):
        return REMOVED[:limit]
    if any(ord(c) < 32 and c not in '\t\r\n' for c in text):
        return REMOVED[:limit]
    return ' '.join(text.split())[:limit]


CATALOG = json.loads(Path(__file__).with_name('structured-catalog.json').read_text(encoding='utf-8'))


def closed(value, kind):
    return value if isinstance(value, str) and value in CATALOG[kind] else 'otro'


def version(value):
    """Strict SemVer subset: closed release labels, bounded numeric identifiers.

    Arbitrary SemVer prerelease/build text is still a covert text channel.
    Unknown labels/build text are therefore also 'otro'.
    """
    if not isinstance(value, str) or len(value) > 64:
        return 'otro'
    number = r'(?:0|[1-9][0-9]{0,5})'
    labels = '|'.join(CATALOG['release_labels'])
    grammar = rf'{number}\.{number}\.{number}(?:-(?:{labels})(?:\.{number})*)?(?:\+{number}(?:\.{number})*)?'
    return value if re.fullmatch(grammar, value) else 'otro'


def log_record(value):
    """Closed scalar projection. No message, payload, identity or arbitrary keys."""
    if not isinstance(value, dict):
        return {}
    result = {}
    for key, kind in [('level','levels'), ('error_code','errors'),
                      ('error_type','errors'), ('module','modules')]:
        if key in value:
            result[key] = closed(value[key], kind)
    if 'version' in value:
        result['version'] = version(value['version'])
    for key in ('count', 'relative_ms'):
        if key in value:
            result[key] = value[key] if type(value[key]) is int and 0 <= value[key] <= 1_000_000_000 else 'otro'
    return result


def error_record(value):
    """Hash only our canonical closed projection, never a supplied fingerprint."""
    result = log_record(value)
    if isinstance(value, dict) and 'type' in value:
        result['type'] = closed(value['type'], 'errors')
    if result:
        content = json.dumps(result, sort_keys=True, separators=(',', ':')).encode('ascii')
        result['fingerprint'] = hashlib.sha256(b'vantare.triage.error.v1:' + content).hexdigest()
    return result


def log_fields(content):
    """Parse a whole JSON document; legacy/free-text logs are owner-only."""
    def unique(pairs):
        result = {}
        for key, value in pairs:
            if key in result:
                raise ValueError('duplicate_log_key')
            result[key] = value
        return result
    try:
        value = json.loads(content, object_pairs_hook=unique)
    except (ValueError, TypeError, RecursionError):
        return []
    values = value if isinstance(value, list) else [value]
    return [record for v in values[:300] if (record := log_record(v))]


def free_text(text):
    # Only a bare scalar has a reliable whitespace delimiter. Quotes/escapes
    # or Authorization schemes make the remainder of the line private.
    label = re.compile(r'(?i)\b(?P<label>access[_-]?token|refresh[_-]?token|account[_-]?id|hostname|computername|user[_-]?name|gamertag|token|api[_-]?key|license[_-]?key|license|password|authorization|key|email)["\']?\s*[=:]\s*')
    parts = []; start = 0
    while match := label.search(text, start):
        value = text[match.end():]
        token = value.split(maxsplit=1)[0] if value else ''
        end = len(text) if match['label'].lower() == 'authorization' or any(c in value for c in '\\"\'') else match.end() + len(token)
        parts.append(text[start:match.start()] + REDACTED)
        start = end
    text = ''.join(parts) + text[start:]
    # UNC shares may contain foreign profile names: omit the entire path.
    text = re.sub(r'(["\'])(?:\\\\|//)[^"\'\r\n]+\1', REDACTED, str(text))
    text = re.sub(r'(?<![:\\/])(?:\\\\|//)[^\s"\'<>;,]+', REDACTED, text)
    text = re.sub(r'(?i)(?:[a-z]:[\\/]+users[\\/]+|/(?:home|users)/)[^\\/\r\n]+', '<user>', str(text))
    for pattern in [
        r'(?i)\bbearer\s+["\']?[^\s"\'<>;,]+', r'\beyJ[A-Za-z0-9_./+=-]+',
        r'\bsk[_-][A-Za-z0-9_-]+',
        r'[\w.!#$%&*+/?^`{|}~-]+@[\w.-]+', r'7656119\d{10}',
        r'(?i)\b(?:[0-9a-f]{2}[:-]){5}[0-9a-f]{2}\b',
        r'(?<!\w)\+?\d[\d ()-]{5,}\d(?!\w)',
    ]:
        text = re.sub(pattern, REDACTED, text)
    text = re.sub(r'(https?://[^\s?]+)\?[^\s]+', r'\1?<redacted>', text)

    def network(match):
        value = match.group(0)
        try:
            ipaddress.ip_address(value.strip('[]'))
            return REDACTED
        except ValueError:
            return value
    return re.sub(r'(?<![\w])\[?[0-9a-fA-F][0-9a-fA-F:.]*\]?(?![\w])', network, text)


def clean_tree(value):
    try:
        return _clean_tree(value, 0)
    except (ValueError, RecursionError):
        return REDACTED


def _clean_tree(value, depth):
    if depth >= MAX_DEPTH:
        raise ValueError('redaction_depth')
    if isinstance(value, str):
        return redact(value, depth)
    if isinstance(value, list):
        return [_clean_tree(v, depth + 1) for v in value]
    if isinstance(value, dict):
        return {redact(k, depth + 1): REDACTED if private_key(k) else _clean_tree(v, depth + 1)
                for k, v in value.items()}
    if type(value) in (int, float) and free_text(str(value)) != str(value):
        return REDACTED
    return value


def system(source):
    """Closed scalar values, including reports from old/modified clients."""
    output = {}
    def number(value):
        return type(value) in (int, float) and 0 <= value <= 1_000_000_000 and math.isfinite(value)
    if isinstance(source.get('os'), dict):
        os = source['os']; output['os'] = {}
        if 'name' in os:
            output['os']['name'] = os['name'] if os['name'] in ('Windows','Linux','macOS') else 'otro'
        if 'version' in os:
            output['os']['version'] = version(os['version'])
        if 'build' in os:
            value = os['build']
            output['os']['build'] = value if isinstance(value,str) and re.fullmatch(r'[0-9]{1,6}',value) else 'otro'
    if isinstance(source.get('cpu'), dict):
        output['cpu'] = {k:v for k,v in source['cpu'].items() if k == 'cores' and type(v) is int and 0 <= v <= 1_000_000_000}
    if isinstance(source.get('gpu'), list):
        output['gpu'] = [{'driver_version':version(g['driver_version'])} for g in source['gpu'][:8] if isinstance(g,dict) and 'driver_version' in g]
    if isinstance(source.get('displays'), list):
        output['displays'] = [{k:v for k,v in d.items() if
            (k in ('width','height','hz','dpi_scale') and number(v)) or
            (k == 'primary' and type(v) is bool)} for d in source['displays'][:16] if isinstance(d,dict)]
    for key in ['ram_gb']:
        if number(source.get(key)):
            output[key] = source[key]
    if type(source.get('obs_active')) is bool:
        output['obs_active'] = source['obs_active']
    if isinstance(source.get('overlays_active'), list):
        output['overlays_active'] = [v for v in source['overlays_active'] if v in ('OBS', 'Streamlabs', 'SimHub', 'CrewChief', 'Vantare')][:5]
    return output
