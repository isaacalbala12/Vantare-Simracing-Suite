"""Second redaction. Standard library only; no identifiers or full logs to the model."""
import ipaddress
import json
import re

REDACTED = '<redacted>'
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
    # Embedded, truncated or multiply escaped JSON is ambiguous. Keep only
    # the free-text prefix of each line; never normalize JSON quote escapes.
    lines = []
    for line in text.split('\n'):
        starts = [line.find(mark) for mark in ('{', '[', r'\"', r'\u0022') if mark in line]
        if starts:
            prefix = free_text(line[:min(starts)])
            lines.append(prefix if prefix.endswith(REDACTED) else prefix + REDACTED)
        elif line.lstrip().startswith(('[', '"', r'\"', r'\u0022')):
            lines.append(REDACTED)
        else:
            lines.append(free_text(line))
    return '\n'.join(lines)


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
    """Project whitelist, independently of whether an old client enforced it."""
    output = {}
    for key, fields in [('os', ('name', 'version', 'build')), ('cpu', ('model', 'cores'))]:
        if isinstance(source.get(key), dict):
            output[key] = {k: source[key][k] for k in fields if k in source[key]}
    for key, fields, limit in [('gpu', ('model', 'driver_version'), 8),
                              ('displays', ('width', 'height', 'hz', 'dpi_scale', 'primary'), 16)]:
        if isinstance(source.get(key), list):
            output[key] = [{k: item[k] for k in fields if k in item} for item in source[key][:limit] if isinstance(item, dict)]
    for key in ['ram_gb', 'obs_active']:
        if isinstance(source.get(key), (int, float, bool)):
            output[key] = source[key]
    if isinstance(source.get('overlays_active'), list):
        output['overlays_active'] = [v for v in source['overlays_active'] if v in ('OBS', 'Streamlabs', 'SimHub', 'CrewChief', 'Vantare')][:5]
    return clean_tree(output)
