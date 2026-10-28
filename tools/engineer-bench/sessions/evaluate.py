"""Verifiable checks, with language and unrestricted prose kept explicitly provisional."""
import math
import re

from bench import strict_json


def numeric_equal(actual, expected, tolerance=.02):
    return (isinstance(actual, (int, float)) and not isinstance(actual, bool)
            and math.isfinite(actual) and abs(actual - expected) <= tolerance)


def matches(actual, expected):
    if isinstance(expected, (int, float)) and not isinstance(expected, bool):
        return numeric_equal(actual, expected, 0 if isinstance(expected, int) else .02)
    if isinstance(expected, list):
        return (isinstance(actual, list) and len(actual) == len(expected)
                and sorted(actual) == sorted(expected))
    return type(actual) is type(expected) and actual == expected


def schema_matches(value, schema):
    """Validate precisely the small JSON schema subset emitted by cases.py."""
    kinds = schema['type'] if isinstance(schema['type'], list) else [schema['type']]
    types = {'null': value is None, 'boolean': type(value) is bool,
             'integer': type(value) is int,
             'number': type(value) in (int, float) and math.isfinite(value),
             'string': isinstance(value, str), 'array': isinstance(value, list),
             'object': isinstance(value, dict)}
    if not any(types[kind] for kind in kinds):
        return False
    if 'enum' in schema and not any(type(value) is type(item) and value == item for item in schema['enum']):
        return False
    if isinstance(value, dict):
        properties = schema['properties']
        return (set(schema['required']) <= value.keys()
                and (schema.get('additionalProperties', True) or value.keys() <= properties.keys())
                and all(schema_matches(item, properties[key]) for key, item in value.items()))
    if isinstance(value, list):
        return all(schema_matches(item, schema['items']) for item in value)
    return True


def numbers(text):
    # Decimal comma and dot accepted; no rounding of the source gold.
    return [float(token.replace(',', '.')) for token in re.findall(r'(?<!\w)[+-]?\d+(?:[.,]\d+)?', text)]


def language_proxy(text, locale):
    words = set(re.findall(r'[^\W\d_]+', text.casefold()))
    es = words & {'quedan', 'combustible', 'gasolina', 'vueltas', 'vuelta', 'litros', 'delante', 'obsoleto', 'disponible', 'datos', 'resumen'}
    en = words & {'remaining', 'fuel', 'litres', 'liters', 'laps', 'lap', 'ahead', 'stale', 'unavailable', 'data', 'summary'}
    desired, other = (es, en) if locale == 'es' else (en, es)
    return True if desired and not other else False if other and not desired else None


def evaluate(case, content, *, error=None, tool_calls=None):
    checks = {'request_complete': error is None, 'format': False, 'facts': False,
              'numeric_text': False, 'length': False, 'semantic_family_proxy': None}
    text = content
    try:
        if case['kind'].startswith('radio'):
            checks['format'] = bool(content.strip()) and not tool_calls and not content.lstrip().startswith(('{', '[', '```'))
            required = case['gold']['required_number']
            found = numbers(text)
            checks['facts'] = required is not None and any(numeric_equal(item, required) for item in found)
            checks['numeric_text'] = bool(found) and all(numeric_equal(item, required) for item in found)
            family = case['gold']['semantic_family']
            words = text.casefold()
            checks['semantic_family_proxy'] = (bool(re.search(r'combustible|gasolina|litros?|fuel|lit[er]{2}s?', words))
                if family == 'fuel' else bool(re.search(r'vueltas?|laps?', words)))
        else:
            value = strict_json(content)
            checks['format'] = schema_matches(value, case['schema']) and not tool_calls
            checks['facts'] = isinstance(value, dict) and all(key in value and matches(value[key], expected)
                for key, expected in case['gold'].items())
            text = value.get('text', '') if isinstance(value, dict) else ''
            if not isinstance(text, str):
                text = ''
            allowed = [float(item) for key, item in case['gold'].items()
                       if not key.startswith('source_') and type(item) in (int, float)]
            if case['kind'] == 'summary':
                allowed += [float(event['lap']) for event in case['context']['recent']['events'] if event['lap'] is not None]
            found = numbers(text)
            checks['numeric_text'] = all(any(numeric_equal(item, expected) for expected in allowed) for item in found)
            # Fuel/gap answers must communicate their numeric value, not hide it only in JSON.
            primary = 'fuel_l' if 'fuel_l' in case['gold'] else 'gap_value' if 'gap_value' in case['gold'] else None
            if primary and case['gold'][primary] is not None:
                checks['numeric_text'] &= any(numeric_equal(item, case['gold'][primary]) for item in found)
        checks['length'] = bool(text.strip()) and len(text.split()) <= case['max_words']
    except (ValueError, KeyError, TypeError, OverflowError):
        pass
    proxy = language_proxy(text, case['locale']) if isinstance(text, str) else None
    return {'checks': checks, 'verifiable_pass': all(value for value in checks.values() if value is not None),
            'language_proxy': proxy, 'human_language': 'pending', 'human_semantics': 'pending',
            'note': 'Numeric/schema checks are not proof of natural language truth, units or absence of implied actions. '
                    'Number words and causal claims require manual review; language proxy is not a model selection score.'}
