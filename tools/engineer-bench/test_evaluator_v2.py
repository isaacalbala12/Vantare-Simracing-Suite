import copy, json, pathlib, sys, unittest, tempfile, hashlib
from unittest.mock import patch
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
from bench import score, strict_json, same, rescore_report
from cases import build_cases, messages
from evaluator_v2 import score_v2

class SemanticRescoreTests(unittest.TestCase):

    @classmethod
    def setUpClass(cls):
        cls.cases = {x['id']: x for x in build_cases()}

    def evaluate(self, id, answer, error=None, legacy=False):
        case = copy.deepcopy(self.cases[id])
        if legacy:
            case.pop('field_enums', None)
        content = answer if isinstance(answer, str) else json.dumps(answer)
        row = {'content': content, 'tool_calls': [], 'error': error, 'quality': score(case, content, [])}
        before = copy.deepcopy(row)
        result = score_v2(case, row, strict_json, same)
        self.assertEqual(row, before)
        return result

    def test_true_extra_metadata(self):
        self.assertTrue(self.evaluate('acc-consumption-es', {'fuel_per_lap_l': 3.6, 'case_id': 'acc-consumption-es'})['semantic_pass'])

    def test_false_extra_not_ignored(self):
        self.assertFalse(self.evaluate('acc-consumption-es', {'fuel_per_lap_l': 3.6, 'fuel_l': 999})['semantic_pass'])

    def test_arbitrary_extra_not_assumed_true(self):
        self.assertFalse(self.evaluate('acc-consumption-es', {'fuel_per_lap_l': 3.6, 'pit_now': True})['semantic_pass'])

    def test_repeated_true_number(self):
        self.assertTrue(self.evaluate('open-discourse-en', '1 litre remaining. Yes, 1 litre remaining.')['semantic_pass'])

    def test_new_number_rejected(self):
        self.assertFalse(self.evaluate('open-discourse-en', '1 litre remaining. Two laps: 2.')['semantic_pass'])

    def test_english_thousand_is_not_one(self):
        self.assertFalse(self.evaluate('open-discourse-en', '1 litre remaining. Also 1,000 litres.')['semantic_pass'])

    def test_enum_pool_ambiguity(self):
        self.assertTrue(self.evaluate('lmu-no-lap-history-en', {'status': 'missing_laps_and_consumption', 'reason': 'missing_laps_and_consumption'}, legacy=True)['semantic_pass'])

    def test_explicit_field_enum_is_not_reinterpreted(self):
        self.assertFalse(self.evaluate('lmu-no-lap-history-en', {'status': 'missing_laps_and_consumption', 'reason': 'missing_laps_and_consumption'})['semantic_pass'])

    def test_wrong_reason_not_repaired(self):
        self.assertFalse(self.evaluate('lmu-no-lap-history-en', {'status': 'no_race_interval', 'reason': 'no_race_interval'})['semantic_pass'])

    def test_null_string_not_coerced(self):
        self.assertFalse(self.evaluate('injection-es', {'status': 'unavailable', 'action': 'null'})['semantic_pass'])

    def test_wrong_nested_status_type_does_not_crash(self):
        self.assertFalse(self.evaluate('injection-es', {'status': {}, 'action': None})['semantic_pass'])

    def test_radio_projection_is_explicit_not_counterfactual(self):
        case = self.cases['lmu-fuel-es']
        r = self.evaluate('lmu-fuel-es', case['inputs']['canonical'])
        self.assertTrue(r['semantic_pass'])
        self.assertTrue(r['projection_required'])
        self.assertFalse(r['source_prompt_changed'])
        self.assertEqual(r['task_specific_prompt_effect'], 'not_evaluable_offline')

    def test_false_radio_metadata_rejected(self):
        self.assertFalse(self.evaluate('lmu-fuel-es', {'canonical': self.cases['lmu-fuel-es']['inputs']['canonical'], 'capacity_l': 999})['semantic_pass'])

    def test_truncated_correct_prefix_still_error(self):
        self.assertFalse(self.evaluate('lmu-fuel-es', 'Quedan 99.59 litros.', {'type': 'ValueError'})['semantic_pass'])

    def test_explicit_nested_answer(self):
        c = self.cases['fuel-finish-es']
        self.assertTrue(self.evaluate(c['id'], {'answer': c['gold'], 'facts': c['inputs']})['semantic_pass'])

    def test_input_echo_not_calculation_credit(self):
        c = self.cases['fuel-finish-es']
        self.assertFalse(self.evaluate(c['id'], {'facts': c['inputs']})['semantic_pass'])

    def test_wrong_calculation_not_repaired(self):
        self.assertFalse(self.evaluate('math-fuel-save-en', {'target_l_per_lap': 26, 'saving_percent': 4})['semantic_pass'])

    def test_markdown_fence(self):
        self.assertTrue(self.evaluate('acc-consumption-es', '```json\n{"fuel_per_lap_l":3.6}\n```')['semantic_pass'])

    def test_duplicate_json_key_rejected(self):
        self.assertFalse(self.evaluate('acc-consumption-es', '{"fuel_per_lap_l":3.6,"fuel_per_lap_l":99}')['semantic_pass'])

    def test_boolean_not_number(self):
        self.assertFalse(self.evaluate('acc-consumption-es', {'fuel_per_lap_l': True})['semantic_pass'])

    def test_missing_canonical_not_verified_metadata(self):
        self.assertFalse(self.evaluate('acc-consumption-es', {'fuel_per_lap_l': 3.6, 'es': None})['semantic_pass'])

    def test_radio_task_is_explicit_in_last_user(self):
        case = self.cases['lmu-fuel-es']
        body = json.loads(messages(case)[-1]['content'])
        self.assertIn('facts.canonical.es', body['task'])
        self.assertNotIn('Allowed status', messages(case)[0]['content'])

    def test_field_enums_are_not_a_global_pool(self):
        prompt = messages(self.cases['lmu-no-lap-history-en'])[0]['content']
        self.assertIn('Allowed status values: unavailable, open, closed.', prompt)
        self.assertIn('Allowed reason values:', prompt)
        self.assertNotIn('Allowed quality values:', prompt)

    def test_offline_rescore_preserves_raw_bytes_and_calls_no_endpoint(self):
        case = self.cases['acc-consumption-es']
        content = json.dumps({'fuel_per_lap_l': 3.6, 'case_id': case['id']})
        row = {'case_id': case['id'], 'context_chars': 0, 'concurrency': 1, 'quality': score(case, content, []), 'error': None, 'within_budget': True, 'ttft_ms': 1, 'total_ms': 2, 'content': content, 'tool_calls': [], 'usage': {}, 'completion_tokens_per_generation_s_proxy': None}
        with tempfile.TemporaryDirectory() as directory:
            root = pathlib.Path(directory)
            source = root / 'results.json'
            frozen = root / 'cases.json'
            output = root / 'v2.json'
            source.write_text(json.dumps({'metadata': {}, 'requests': [row]}), encoding='utf-8')
            frozen.write_text(json.dumps([case]), encoding='utf-8')
            before = source.read_bytes()
            case_before = frozen.read_bytes()
            with patch('bench.urllib.request.urlopen', side_effect=AssertionError('Offline must not call a server')):
                result = rescore_report(source, frozen, output)
            self.assertEqual(source.read_bytes(), before)
            self.assertEqual(frozen.read_bytes(), case_before)
            self.assertFalse(result['requests'][0]['quality']['automatic_pass'])
            self.assertTrue(result['requests'][0]['quality_v2']['semantic_pass'])
            self.assertEqual(result['metadata']['offline_rescore']['source_report_sha256'], hashlib.sha256(before).hexdigest())
            self.assertNotIn('quality_v2', strict_json(source.read_bytes())['requests'][0])
            with self.assertRaises(FileExistsError):
                rescore_report(source, frozen, output)
            with self.assertRaises(ValueError):
                rescore_report(source, frozen, source)
if __name__ == '__main__':
    unittest.main()
