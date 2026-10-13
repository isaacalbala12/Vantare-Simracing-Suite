"""Second redaction. Standard library only; no identifiers or full logs to the model."""
import ipaddress
import re

REDACTED = '<redacted>'


def redact(text):
    text = re.sub(r'(?i)(?:[a-z]:[\\/]+users[\\/]+|/(?:home|users)/)[^\\/\r\n]+', '<user>', str(text))
    for pattern in [
        r'(?i)\bbearer\s+["\']?[^\s"\'<>;,]+', r'\beyJ[A-Za-z0-9_./+=-]+',
        r'\bsk_[A-Za-z0-9_-]+', r'(?i)\b(?:access[_-]?token|refresh[_-]?token|account_id|token|api[_-]?key|license[_-]?key|license|password|authorization|key)["\']?\s*[=:]\s*["\']?[^\s"\',;]+',
        r'[\w.!#$%&*+/?^`{|}~-]+@[\w.-]+', r'7656119\d{10}',
        r'(?i)\b(?:[0-9a-f]{2}[:-]){5}[0-9a-f]{2}\b',
        r'(?i)\b(?:hostname|computername|username|gamertag)\s*[=:]\s*[^\s,;]+',
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
    if isinstance(value, str):
        return redact(value)
    if isinstance(value, list):
        return [clean_tree(v) for v in value]
    if isinstance(value, dict):
        return {k: clean_tree(v) for k, v in value.items()}
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
