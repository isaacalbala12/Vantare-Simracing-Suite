"""Loopback llama-server client; actual template/tokenizer preflight, no retry or fallback."""
from datetime import datetime, timezone
import hashlib
import ipaddress
import json
import threading
import time
import urllib.parse
import urllib.request

from bench import sse, strict_json
from .cases import messages
from .evaluate import evaluate


def loopback(base_url):
    parsed = urllib.parse.urlparse(base_url)
    if (parsed.scheme != 'http' or not parsed.hostname or parsed.username or parsed.password
            or not ipaddress.ip_address(parsed.hostname).is_loopback
            or parsed.path.rstrip('/') != '/v1' or parsed.query or parsed.fragment):
        raise ValueError('Expected http://127.0.0.1:PORT/v1 loopback URL')
    return base_url.rstrip('/')


class Client:
    def __init__(self, base_url, model, timeout=60, slot_context=8192):
        self.base_url = loopback(base_url)
        self.model, self.timeout, self.slot_context = model, timeout, slot_context
        self.preflight_lock = threading.Lock()
        self.preflight_cache = {}

    def post(self, path, payload):
        raw = json.dumps(payload, ensure_ascii=False, allow_nan=False).encode()
        request = urllib.request.Request(self.base_url.removesuffix('/v1') + path, raw,
                                        {'Content-Type': 'application/json'})
        with urllib.request.urlopen(request, timeout=self.timeout) as response:
            return strict_json(response.read())

    def payload(self, case):
        result = {'model': self.model, 'messages': messages(case), 'seed': 124, 'temperature': 0,
                  'stream': True, 'stream_options': {'include_usage': True},
                  'max_tokens': case['max_tokens'], 'cache_prompt': True,
                  'chat_template_kwargs': {'enable_thinking': False}}
        if case['schema']:
            result['response_format'] = {'type': 'json_schema', 'json_schema': {
                'name': 'engineer_answer', 'strict': True, 'schema': case['schema']}}
        return result

    def preflight(self, payload):
        key = hashlib.sha256(json.dumps(payload['messages'], ensure_ascii=False).encode()).hexdigest()
        with self.preflight_lock:
            if key not in self.preflight_cache:
                rendered = self.post('/apply-template', {'messages': payload['messages'],
                    'add_generation_prompt': True, 'chat_template_kwargs': {'enable_thinking': False}})
                prompt = rendered['prompt']
                tokenized = self.post('/tokenize', {'content': prompt, 'add_special': True})
                self.preflight_cache[key] = len(tokenized['tokens'])
            count = self.preflight_cache[key]
        if count + payload['max_tokens'] > self.slot_context:
            raise ValueError(f'Prompt {count} + output {payload["max_tokens"]} exceeds slot {self.slot_context}; no truncation')
        return count

    def request(self, case, iteration, lane, active_longs=0, first_visible=None):
        payload = self.payload(case)
        raw = json.dumps(payload, ensure_ascii=False, allow_nan=False).encode()
        row = {'case_id': case['id'], 'kind': case['kind'], 'locale': case['locale'],
               'history': case['source_history_count'], 'pass': iteration, 'lane': lane,
               'active_longs_at_admission': active_longs, 'request': payload,
               'request_sha256': hashlib.sha256(raw).hexdigest(),
               'source_cursor': case['source_cursor'], 'content': '', 'reasoning': '',
               'tool_calls': [], 'usage': {}, 'finish_reason': None, 'error': None,
               'ttft_ms': None, 'context_chars': 0, 'concurrency': 4}
        # Preflight is outside latency measurements and cached across five repetitions.
        try:
            row['prompt_tokens_preflight'] = self.preflight(payload)
        except Exception as error:
            row['error'] = {'type': type(error).__name__, 'message': str(error), 'phase': 'preflight'}
            row['quality'] = evaluate(case, '', error=row['error'])
            return row
        request = urllib.request.Request(self.base_url + '/chat/completions', raw,
                     {'Content-Type': 'application/json', 'Accept': 'text/event-stream'})
        row['started_utc'] = datetime.now(timezone.utc).isoformat()
        started = time.perf_counter()
        events, done = [], False
        try:
            with urllib.request.urlopen(request, timeout=self.timeout) as response:
                for event in sse(response, deadline=started + self.timeout):
                    if event == '[DONE]':
                        done = True
                        break
                    item = strict_json(event)
                    events.append(item)
                    if item.get('usage'):
                        row['usage'] = item['usage']
                    for choice in item.get('choices', []):
                        delta = choice.get('delta', {})
                        visible = delta.get('content') or ''
                        if visible and row['ttft_ms'] is None:
                            row['ttft_ms'] = (time.perf_counter() - started) * 1000
                            if first_visible:
                                first_visible.set()
                        row['content'] += visible
                        row['reasoning'] += delta.get('reasoning_content') or ''
                        row['tool_calls'].extend(delta.get('tool_calls') or [])
                        if choice.get('finish_reason'):
                            row['finish_reason'] = choice['finish_reason']
            if not done or row['finish_reason'] is None:
                raise ValueError('Incomplete stream')
            if row['finish_reason'] != 'stop':
                raise ValueError('Non-stop finish: ' + row['finish_reason'])
            if not row['usage']:
                raise ValueError('Missing requested usage')
        except Exception as error:
            row['error'] = {'type': type(error).__name__, 'message': str(error), 'phase': 'stream'}
        row['ended_utc'] = datetime.now(timezone.utc).isoformat()
        row['total_ms'] = (time.perf_counter() - started) * 1000
        duration = row['total_ms'] - row['ttft_ms'] if row['ttft_ms'] is not None else None
        completion = row['usage'].get('completion_tokens')
        row['completion_tokens_per_generation_s_proxy'] = (completion * 1000 / duration
            if type(completion) is int and duration and duration > 0 else None)
        row['raw_events'] = events
        row['quality'] = evaluate(case, row['content'], error=row['error'], tool_calls=row['tool_calls'])
        return row
