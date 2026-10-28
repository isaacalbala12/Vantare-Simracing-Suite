"""Offline semantic projection. It never rewrites a recorded prompt or response."""
import copy
import re
import unicodedata
from decimal import Decimal

FIELD_ENUMS = {
    'status': ('unavailable', 'open', 'closed'),
    'quality': ('fresh', 'stale', 'unavailable', 'estimated', 'reliable'),
    'reason': ('no_race_interval', 'missing_laps_and_consumption', 'stale_telemetry'),
}
REASONS = set(FIELD_ENUMS['reason'])

def _text(value):
    value = unicodedata.normalize('NFC', value).strip()
    if value.startswith('```') and value.endswith('```'):
        value = re.sub(r'^```(?:json|text)?\s*|\s*```$', '', value)
    value = value.replace('**', '').replace('__', '')
    value = ' '.join(value.split()).casefold().strip('"\' .!?')
    return re.sub(r'\bliters?\b', lambda m: 'litres' if m[0].endswith('s') else 'litre', value)

def _numbers(value, language):
    values = set()
    for token in re.findall(r'[-+]?\d+(?:[.,]\d+)?', value):
        if language == 'en' and re.fullmatch(r'[-+]?\d{1,3},\d{3}', token):
            token = token.replace(',', '')
        values.add(Decimal(token.replace(',', '.')))
    return values

def _facts(case):
    result = copy.deepcopy(case['inputs'])
    if isinstance(result.get('pilot_text'), dict):
        result['pilot_text'] = result['pilot_text'][case['language']]
    return result

def _source_task(case):
    if 'task' in case:
        return case['task']
    value = 'Answer the requested fields from current facts only.'
    if case['id'].startswith('math-'):
        value += (' This is an isolated arithmetic probe. Calculate from the supplied samples; '
                  'required fuel includes reserve; deficit is required minus fuel; saving is vs current consumption; '
                  'rear-minus-front compares axle means. Round quantities to two decimals.')
    return value

def _extra_is_true(key, value, case, same):
    facts = _facts(case)
    if key == 'case_id':
        return value == case['id']
    if key == 'task':
        return value == _source_task(case)
    if key == 'facts':
        return same(value, facts)
    if key in facts:
        return same(value, facts[key])
    if key in ('es', 'en'):
        canonical = facts.get('canonical', {})
        return isinstance(canonical, dict) and key in canonical and value == canonical[key]
    if key in ('canonical_es', 'canonical_en'):
        canonical = facts.get('canonical', {})
        return isinstance(canonical, dict) and key[-2:] in canonical and value == canonical[key[-2:]]
    return False

def score_v2(case, row, parse_json, same):
    """Return a separate score; strict v1 and source bytes remain authoritative evidence.

    Additional fields must be verifiable against the supplied facts. Numeric
    repetition is deduplicated only for discourse. Prompt changes are explicitly
    counterfactual, and are never credited as though they had been sent.
    """
    changes = []
    result = {'version': 2, 'semantic_pass': False, 'normalizations': changes,
              'source_prompt_changed': False, 'task_specific_prompt_effect': 'not_evaluable_offline',
              'human_semantic_acceptance': 'pending', 'projection_required': False,
              'strict_v1_pass': row['quality']['automatic_pass']}
    if row.get('error'):
        result['reason'] = 'request_error_or_truncation_preserved'
        return result
    content, calls = row['content'], row['tool_calls']
    if case['kind'] == 'tool':
        result['semantic_pass'] = row['quality']['automatic_pass']
        result['reason'] = 'tool_contract_unchanged'
        return result
    if case['kind'] == 'discourse':
        factual = case['gold'] in content
        numbers = _numbers(content, case['language']) == _numbers(case['gold'], case['language'])
        if numbers and re.findall(r'\d+(?:[.,]\d+)?', content) != re.findall(r'\d+(?:[.,]\d+)?', case['gold']):
            changes.append('repeated_true_number')
        result['semantic_pass'] = bool(content.strip()) and not calls and factual and numbers and len(content.split()) <= case['max_words']
        result['reason'] = 'discourse_structure_only; naturalness_and_implicature_pending'
        return result
    if case['kind'] == 'radio':
        candidate = content
        try:
            obj = parse_json(content)
        except (ValueError, TypeError):
            obj = None
        if isinstance(obj, str):
            candidate = obj
            changes.append('quoted_sentence')
        elif isinstance(obj, dict):
            if not all(_extra_is_true(k, v, case, same) for k, v in obj.items()):
                result['reason'] = 'unverified_extra_radio_fields'
                return result
            language = case['language']
            candidates = [obj.get(language), obj.get('canonical_' + language),
                          obj.get('canonical', {}).get(language) if isinstance(obj.get('canonical'), dict) else None]
            if isinstance(obj.get('facts'), dict) and isinstance(obj['facts'].get('canonical'), dict):
                candidates.append(obj['facts']['canonical'].get(language))
            candidate = next((x for x in candidates if isinstance(x, str)), '')
            changes.append('radio_target_language_projection')
            result['projection_required'] = True
        result['semantic_pass'] = not calls and _text(candidate) == _text(case['gold'])
        if result['semantic_pass'] and candidate != case['gold']:
            changes.append('case_whitespace_or_punctuation')
        result['reason'] = 'answer_present; does_not_prove_original_radio_instruction_followed'
        return result
    cleaned = content.strip()
    if cleaned.startswith('```') and cleaned.endswith('```'):
        cleaned = re.sub(r'^```(?:json)?\s*|\s*```$', '', cleaned)
        changes.append('markdown_fence')
    try:
        obj = parse_json(cleaned)
    except (ValueError, TypeError):
        result['reason'] = 'invalid_json'
        return result
    if not isinstance(obj, dict) or calls:
        result['reason'] = 'expected_object_without_tools'
        return result
    candidate = obj
    if not set(case['gold']).issubset(candidate) and isinstance(obj.get('answer'), dict):
        if not all(_extra_is_true(k, v, case, same) for k, v in obj.items() if k != 'answer'):
            result['reason'] = 'unverified_outer_metadata'
            return result
        candidate = obj['answer']
        changes.append('explicit_answer_projection')
        result['projection_required'] = True
    if not set(case['gold']).issubset(candidate):
        result['reason'] = 'missing_answer_fields; input_echo_not_credited'
        return result
    extras = set(candidate) - set(case['gold'])
    if not all(_extra_is_true(k, candidate[k], case, same) for k in extras):
        result['reason'] = 'unverified_or_false_extra_fields'
        return result
    if extras:
        changes.append('verified_true_extra_fields')
        result['projection_required'] = True
    projected = {k: copy.deepcopy(candidate[k]) for k in case['gold']}
    if (not case.get('field_enums') and isinstance(projected.get('status'), str)
            and projected['status'] in REASONS and projected['status'] == projected.get('reason')):
        projected['status'] = 'unavailable'
        changes.append('ambiguous_global_tag_pool_status_projection')
        result['projection_required'] = True
    result['semantic_pass'] = same(projected, case['gold'])
    result['reason'] = 'typed_answer_comparison; no_null_string_coercion_or_numeric_repair'
    return result
