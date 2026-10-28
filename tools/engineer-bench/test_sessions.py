"""Contract/negative tests; never treat generated answers as model quality evidence."""
import copy
import io
import hashlib
import json
from pathlib import Path
import sys
import threading
import unittest
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parent))
from sessions.cases import build_cases, messages
from sessions.client import Client, loopback
from sessions.evaluate import evaluate, schema_matches
from sessions.generate import CONTRACT, build_session, current, player_car, variants
from sessions.project import active_flags, fuel_intent, project
from sessions.run import run_reserved
from sessions.wire import validate


class SyntheticContractTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.session = build_session()
        cls.cases = build_cases()

    def test_seed_reproduces_whole_sequence_but_other_seed_changes_it(self):
        self.assertEqual(self.session, build_session())
        self.assertNotEqual(self.session, build_session(seed=125))

    def test_reviewed_wire_contract_tracks_the_native_source(self):
        source = Path(__file__).resolve().parents[2] / CONTRACT['source_path']
        self.assertEqual(hashlib.sha256(source.read_bytes()).hexdigest(), CONTRACT['source_sha256'])

    def test_all_source_photos_and_temporal_variants_fit_wire(self):
        for track in ('Le Mans', 'Spa', 'Monza'):
            for car_class in ('LMGT3', 'Hypercar'):
                for kind in ('practice', 'qualifying', 'race'):
                    session = build_session(track=track, car_class=car_class, kind=kind)
                    self.assertEqual(len(session['snapshots']), 83)
                    for photo in session['snapshots']:
                        self.assertTrue(validate(photo))
                    for variant in variants(session):
                        self.assertTrue(validate(variant['snapshots'][-1]))

    def test_player_not_first_and_laps_time_cursor_monotonic(self):
        photos = self.session['snapshots']
        self.assertTrue(any(photo['state']['cars'][0]['id'] != 7 for photo in photos))
        self.assertEqual([photo['sequence'] for photo in photos], list(range(1, 84)))
        self.assertEqual(sorted(current(player_car(photo)['laps']) for photo in photos),
                         [current(player_car(photo)['laps']) for photo in photos])
        self.assertEqual(sorted(photo['origin']['received_at']['secs'] for photo in photos),
                         [photo['origin']['received_at']['secs'] for photo in photos])

    def test_fuel_conservation_and_pit_refill(self):
        photos = self.session['snapshots']
        initial = 15 * 3.7 + .8
        final = photos[-1]['state']['player']['fuel_level_l']['reliable']
        self.assertAlmostEqual(final, initial + 5 * 3.7 - 20 * 3.7)
        context = project(photos[:71], 60)
        kinds = {item['event'] for item in context['recent']['events']}
        self.assertTrue({'pit_entry', 'pit_exit', 'refuel_observed', 'flags_changed',
                         'rain_changed', 'body_integrity_changed'} <= kinds)
        self.assertNotEqual(context['recent']['gap_ahead_s']['first'], context['recent']['gap_ahead_s']['latest'])
        self.assertIsNotNone(context['current']['gap_classification_behind']['value'])

    def test_sector_yellow_does_not_become_session_yellow(self):
        photo = self.session['snapshots'][75]
        self.assertEqual(active_flags(photo), [])
        photo = copy.deepcopy(photo)
        photo['state']['flags'] = {'estimated': [{'kind': 'yellow', 'scope': 'session'}]}
        self.assertEqual(active_flags(photo), [])

    def test_stale_and_epoch_reset_never_reuse_old_current_fuel(self):
        stale, reset = variants(self.session)
        self.assertIsNone(project(stale['snapshots'], 60)['current']['fuel_l']['value'])
        context = project(reset['snapshots'], 60)
        self.assertEqual(context['current']['fuel_l']['value'], 1.25)
        self.assertEqual(context['recent']['same_context_photos'], 1)
        self.assertEqual(context['recent']['excluded_context_photos'], 59)
        self.assertEqual(context['recent']['consumption_l_per_lap']['measured_laps'], 0)
        self.assertIsNone(context['code_policy']['proposed_pit_plan']['pit_in_laps'])

    def test_short_history_rejected_instead_of_shortened(self):
        with self.assertRaises(ValueError):
            project(self.session['snapshots'][:20], 60)

    def test_invalid_wire_version_quality_duration_and_player_rejected(self):
        mutations = [lambda p: p.update(version=10),
                     lambda p: p['state']['player'].update(fuel_level_l={'fresh': 1}),
                     lambda p: p['origin']['received_at'].update(nanos=1000000000),
                     lambda p: p['state']['player'].update(car=999),
                     lambda p: p['state']['player'].update(fuel_level_l={'reliable': float('nan')})]
        for mutate in mutations:
            photo = copy.deepcopy(self.session['snapshots'][0])
            mutate(photo)
            with self.assertRaises(ValueError):
                validate(photo)

    def test_case_coverage_last_user_task_and_no_gold_in_model_message(self):
        self.assertEqual(len(self.cases), 900)
        self.assertEqual(len({case['id'] for case in self.cases}), 900)
        self.assertEqual(sum(case['kind'] == 'raw_current_dto' for case in self.cases), 36)
        for case in self.cases:
            prompt = messages(case)
            self.assertEqual(prompt[-1]['role'], 'user')
            source_message = json.loads(prompt[1]['content'].split('\n', 1)[1])
            self.assertNotIn('gold', source_message)
            self.assertNotIn('required_number', source_message)
            if case['kind'] == 'radio_fuel':
                self.assertIsNotNone(case['code_intent'])
            if case['kind'] == 'radio_lap':
                self.assertIn('completed' if case['locale'] == 'en' else 'completadas', prompt[-1]['content'])
            if 'context' in case:
                self.assertEqual(case['source_cursor'], [case['context']['current']['epoch'], case['context']['current']['sequence']])
                self.assertNotIn('snapshots', case['context'])


class EvaluatorAndClientTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.cases = {case['id']: case for case in build_cases()}
        cls.fuel = cls.cases['le-mans-lmgt3-race-pilot_fuel-en-h60']
        cls.radio = cls.cases['le-mans-lmgt3-race-radio_fuel-en-h60']

    def test_current_numeric_answer_passes_but_old_fuel_and_extra_figure_fail(self):
        gold = self.fuel['gold']
        value = gold | {'text': f"Fuel remaining: {gold['fuel_l']} litres."}
        self.assertTrue(evaluate(self.fuel, json.dumps(value))['verifiable_pass'])
        value['fuel_l'] = self.fuel['context']['recent']['fuel_l']['first']
        self.assertFalse(evaluate(self.fuel, json.dumps(value))['verifiable_pass'])
        value = gold | {'text': f"Fuel remaining: {gold['fuel_l']} litres. Pit in 99 laps."}
        self.assertFalse(evaluate(self.fuel, json.dumps(value))['verifiable_pass'])

    def test_duplicate_keys_null_string_boolean_and_schema_extra_fail(self):
        value = self.fuel['gold'] | {'text': 'Fuel unavailable.'}
        for key, wrong in [('fuel_l', True), ('fuel_l', 'null'), ('extra', 1)]:
            altered = value | {key: wrong}
            self.assertFalse(evaluate(self.fuel, json.dumps(altered))['verifiable_pass'])
        self.assertFalse(evaluate(self.fuel, '{"fuel_l":1,"fuel_l":2}')['verifiable_pass'])

    def test_radio_not_exact_phrase_but_required_figure_and_family(self):
        value = self.radio['gold']['required_number']
        text = f"You have {value} litres of fuel remaining."
        self.assertTrue(evaluate(self.radio, text)['verifiable_pass'])
        self.assertFalse(evaluate(self.radio, text + ' Two? 2 laps.')['verifiable_pass'])
        self.assertFalse(evaluate(self.radio, text, error={'type': 'truncated'})['verifiable_pass'])
        self.assertFalse(evaluate(self.radio, json.dumps({'text': text}))['verifiable_pass'])

    def test_schema_has_no_answer_constants(self):
        self.assertNotIn('const', json.dumps(self.fuel['schema']))
        self.assertTrue(schema_matches(self.fuel['gold'] | {'text': 'Fuel'}, self.fuel['schema']))

    def test_only_loopback_and_payload_contract(self):
        for url in ('https://127.0.0.1:1/v1', 'http://example.com/v1', 'http://127.0.0.1:1/admin',
                    'http://user:password@127.0.0.1/v1'):
            with self.assertRaises(ValueError):
                loopback(url)
        client = Client('http://127.0.0.1:18081/v1', 'model')
        payload = client.payload(self.fuel)
        self.assertEqual(payload['response_format']['type'], 'json_schema')
        self.assertEqual(payload['seed'], 124)
        self.assertTrue(payload['stream_options']['include_usage'])
        self.assertFalse(payload['chat_template_kwargs']['enable_thinking'])
        self.assertEqual(payload['max_tokens'], 512)

    def test_actual_token_preflight_rejects_overflow_without_request(self):
        client = Client('http://127.0.0.1:1/v1', 'model', slot_context=8192)
        seen = []
        def post(path, payload):
            seen.append(path)
            return {'prompt': 'rendered'} if path == '/apply-template' else {'tokens': [1] * 8000}
        client.post = post
        with self.assertRaises(ValueError):
            client.preflight(client.payload(self.fuel))
        self.assertEqual(seen, ['/apply-template', '/tokenize'])

    def test_stream_contract_preserves_usage_and_rejects_truncation_or_missing_done(self):
        client = Client('http://127.0.0.1:1/v1', 'model')
        content = json.dumps(self.fuel['gold'] | {'text': f"Fuel: {self.fuel['gold']['fuel_l']} litres."})
        for finish, done, usage, expected_error in [('stop', True, True, False),
                ('length', True, True, True), ('stop', False, True, True), ('stop', True, False, True)]:
            chunks = [{'choices': [{'delta': {'content': content}, 'finish_reason': finish}]}]
            if usage:
                chunks.append({'choices': [], 'usage': {'prompt_tokens': 1000, 'completion_tokens': 30}})
            wire = ''.join('data: ' + json.dumps(chunk) + '\n\n' for chunk in chunks)
            if done:
                wire += 'data: [DONE]\n\n'
            with patch.object(client, 'preflight', return_value=1000), patch('urllib.request.urlopen',
                    return_value=io.BytesIO(wire.encode())):
                row = client.request(self.fuel, 0, 'long')
            self.assertEqual(bool(row['error']), expected_error)
            self.assertEqual(row['content'], content)
            self.assertEqual(row['quality']['verifiable_pass'], not expected_error)

    def test_reserved_scheduler_allows_radio_while_exactly_three_longs_block(self):
        group = [copy.deepcopy(case) for case in self.cases.values()
                 if case.get('source_session') == 'le-mans-lmgt3-race'
                 and case['locale'] == 'en' and case['source_history_count'] == 60]
        active = 0
        maximum = 0
        lock = threading.Lock()
        barrier = threading.Barrier(3)
        release = threading.Event()
        observed = []
        def request(case, iteration, lane, active_longs=0, first_visible=None):
            nonlocal active, maximum
            if lane == 'long':
                with lock:
                    active += 1
                    maximum = max(maximum, active)
                barrier.wait(timeout=5)
                first_visible.set()
                self.assertTrue(release.wait(timeout=5))
                with lock:
                    active -= 1
            else:
                observed.append(active_longs)
                release.set()
            return {'id': case['id']}
        rows = []
        run_reserved(group, request, 0, rows.append, lambda: None)
        self.assertEqual(maximum, 3)
        self.assertEqual(observed[0], 3)
        self.assertEqual(len(rows), 8)


if __name__ == '__main__':
    unittest.main()
