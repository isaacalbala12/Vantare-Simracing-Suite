import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch
import normalizar


class CampaignSelectionTests(unittest.TestCase):
    def test_failed_attempts_remain_and_first_complete_is_used(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / "campana.json").write_text(json.dumps({"schema": 1, "binaries": {}, "compilation_plan": "pendiente autorizado"}))
            records = [dict(event="end", family="one", attempt=1, status="invalid"),
                       dict(event="end", family="one", attempt=2, status="complete"),
                       dict(event="end", family="one", attempt=3, status="complete"),
                       dict(event="end", family="other", attempt=1, status="cancelled")]
            (root / "intentos.jsonl").write_text("\n".join(map(json.dumps, records)))
            for attempt in (1, 2, 3):
                folder = root / str(attempt)
                folder.mkdir()
                (folder / "observacion.json").write_text(json.dumps(dict(family="one", attempt=attempt)))
            def observation(folder):
                return dict(comparison="rune", copies=1, windows=1, hz=60, load=False, id=folder.name)
            with patch.object(normalizar, "normalize_observation", side_effect=observation) as reader:
                result = normalizar.normalize(root)
            self.assertEqual(reader.call_count, 1)
            self.assertEqual(result["additional_observations"][0]["id"], "2")
            self.assertEqual([r["status"] for r in result["failed_attempts"]], ["invalid", "cancelled"])
            self.assertEqual(result["compilation"]["status"], "pending_authorized")

    def test_started_failed_repairs_preserve_budget_in_normalized_round(self):
        from test_analizar import campaign
        import copy
        with tempfile.TemporaryDirectory() as directory:
            root=Path(directory);sample=campaign()
            (root/'campana.json').write_text(json.dumps({'schema':1,'binaries':sample['binaries'],'compilation_plan':'pending'}))
            rows=[];records=[]
            for load in [False,True]:
                family=f'rune-n10-hz60-carga{int(load)}'
                records.append(dict(event='end',status='complete',family=family,attempt=1))
                for block in ['aa','ab']:
                    for original in sample['comparisons']['rune']['rounds'][0][block]:
                        row=copy.deepcopy(original)
                        row.update(normalizar.PRIMARY);row.update(load=load,comparison='rune',round=1,block=block,family=family,source_folder='synthetic')
                        rows.append(row)
                        folder=root/str(len(rows));folder.mkdir()
                        (folder/'observacion.json').write_text(json.dumps(dict(family=family,attempt=1)))
            (root/'intentos.jsonl').write_text('\n'.join(map(json.dumps,records)))
            ledger=[dict(event='start',family='rune-n10-hz60-carga1',round=1,repair_attempt=n) for n in [1,2]]
            (root/'repeticiones.jsonl').write_text('\n'.join(map(json.dumps,ledger)))
            with patch.object(normalizar,'normalize_observation',side_effect=lambda folder:rows[int(folder.name)-1]):
                result=normalizar.normalize(root)
            self.assertEqual(result['comparisons']['rune']['rounds'][0]['repair_attempts'],{'unloaded':0,'loaded':2})

    def test_primary_without_actual_loaded_companion_is_rejected(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / "campana.json").write_text(json.dumps({"schema": 1, "binaries": {}, "compilation_plan": "pendiente"}))
            (root / "intentos.jsonl").write_text(json.dumps(dict(event="end", family="one", attempt=1, status="complete")))
            (root / "observacion.json").write_text(json.dumps(dict(family="one", attempt=1)))
            row = dict(comparison="rune", **normalizar.PRIMARY)
            with patch.object(normalizar, "normalize_observation", return_value=row):
                with self.assertRaisesRegex(ValueError, "carga"):
                    normalizar.normalize(root)


if __name__ == "__main__":
    unittest.main()
