"""Regresiones de archivos completos, movimiento, atribución y reloj PresentMon."""
import csv
import gzip
import hashlib
import importlib.util
import json
import pathlib
import struct
import subprocess
import sys
import tempfile
import unittest

MODULE=pathlib.Path(__file__).resolve().parents[1]/"lmu-ab-kit/analyze_ab.py"
spec=importlib.util.spec_from_file_location("ab",MODULE)
ab=importlib.util.module_from_spec(spec)
spec.loader.exec_module(ab)


def write(path, rows):
    previous={}
    with gzip.open(path,"wb") as file:
        for meta,body in sorted(rows,key=lambda row:row[0].get("at_ns",0)):
            meta=dict(meta,key=meta.get("key",""),sha256=hashlib.sha256(body).hexdigest())
            old=previous.get(meta["key"],b"")
            delta=bytes(b ^ (old[i] if i<len(old) else 0) for i,b in enumerate(body))
            text=json.dumps(meta).encode()
            file.write(struct.pack("<II",len(text),len(delta))+text+delta)
            previous[meta["key"]]=body


def block(folder,name,mode,anchor,moving=True,footer=True,unexpected=False):
    root=folder/name; root.mkdir()
    paths=[] if mode=="C" else sorted(ab.CORE|({ab.EXTRA} if mode=="B" else set()))
    header={"schema":"vantare.lmu-full.v1","build":"1.4.2.0","rest_core_production_policy":True,
            "catalog":{"experiment":"vantare.lmu-ab.v1","block":name,"mode":mode,"duration_s":2,"capture":paths},
            "qpc_anchor":{"counter":anchor,"frequency":1000,"at_ns":0,"uncertainty_ns":20}}
    rows=[({"kind":"header","details":header},b"")]
    # Frontera sintética explícita: offsets del SDK, no una nueva captura física.
    for i in range(21):
        body=bytearray(324820)
        struct.pack_into("<i",body,1736,1)
        struct.pack_into("<i",body,1696,1)
        body[128464:128467]=bytes([1,0,1])
        source=anchor+(0.2 if mode=="B" and 2<=i<13 else i/10)
        struct.pack_into("<d",body,1700,source)
        struct.pack_into("<d",body,128480,source)
        struct.pack_into("<d",body,128468+184,50.0 if moving else 0)
        struct.pack_into("<d",body,128468+420,0.5 if moving else 0)
        rows.append(({"kind":"shm","key":"LMU_Data","at_ns":i*100_000_000,"details":{"stable":True}},bytes(body)))
    for key in paths+([ab.EXTRA] if unexpected else []):
        rows.append(({"kind":"rest","key":key,"at_ns":1_100_000_000,"started_ns":250_000_000,"status":200,"details":{"completed_ns":1_000_000_000}},b"{}"))
    if footer:
        # Cierre deliberadamente tardío: no debe inventar un stall al drenar REST.
        rows.append(({"kind":"footer","at_ns":3_000_000_000,"details":{"state":"complete"}},b""))
    write(root/"sesion.lmu.gz",rows)
    return {"name":name,"mode":mode,"duration_s":2,"state":"closed","exit_code":0}


class ABTests(unittest.TestCase):
    @unittest.skipUnless(sys.platform=="win32","Windows PowerShell 5")
    def test_ps5_child_exit_codes_survive_polling_and_wait(self):
        helper=MODULE.parent/"Process-AB.ps1"
        with tempfile.TemporaryDirectory(prefix="1638 child '") as directory:
            folder=pathlib.Path(directory)
            script=folder/"probe.ps1"
            script.write_text('''param([string]$Helper,[string]$Folder)
$ErrorActionPreference='Stop'
. $Helper
foreach($expected in @(0,7)) {
    $child=Start-ABChild -File "$env:SystemRoot/System32/cmd.exe" -Arguments @('/c','exit',[string]$expected) -Stdout (Join-Path $Folder "$expected.out") -Stderr (Join-Path $Folder "$expected.err")
    while(-not $child.HasExited){Start-Sleep -Milliseconds 25;$child.Refresh()}
    $child.WaitForExit()
    if($null -eq $child.ExitCode -or $child.ExitCode -ne $expected){throw 'ExitCode no fiable en PS5'}
}
''',encoding="utf-8-sig")
            subprocess.run(["powershell.exe","-NoProfile","-ExecutionPolicy","Bypass","-File",str(script),"-Helper",str(helper),"-Folder",str(folder)],check=True,capture_output=True,timeout=30)

    def test_a_reading_gap_is_not_evidence_that_the_producer_stopped(self):
        clock=ab.Clock(); clock.observe(0,100); clock.observe(1_000_000_000,101)
        result=clock.report(1_000_000_000,0)
        self.assertEqual(result["gaps_ge_500ms"],0)
        self.assertEqual(len(result["acquisition_gap_intervals_ns"]),1)

    def test_complete_run_separates_moving_player_source_gaps_and_render_frames(self):
        with tempfile.TemporaryDirectory() as directory:
            folder=pathlib.Path(directory)
            entries=[block(folder,name,mode,10000+i*5000) for i,(name,mode) in enumerate([("C0","C"),("A1","A"),("B2","B"),("A3","A"),("B4","B")])]
            (folder/"run.json").write_text(json.dumps({"schema":"vantare.lmu-ab-run.v1","state":"complete","game_pid":123,"washout_s":0,"blocks":entries}),encoding="utf8")
            with (folder/"presentmon.csv").open("w",newline="") as file:
                writer=csv.writer(file); writer.writerow(["ProcessID","SwapChainAddress","CPUStartQPC","FrameTime","DisplayedTime"])
                for i,entry in enumerate(entries):
                    for j in range(10):
                        writer.writerow([123,"primary",10000+i*5000+100+j*100,800 if entry["mode"]=="B" and j==2 else 16,16])
                    writer.writerow([123,"secondary",10000+i*5000+200,9999,9999])
                    writer.writerow([999,"primary",10000+i*5000+200,9999,9999])
            result=ab.analyze(folder)
            self.assertEqual(result["state"],"evaluated_requires_review")
            self.assertFalse(result["physical_live_certified"])
            for item in result["blocks"]:
                self.assertEqual(item["player"]["moving_fraction"],1)
                self.assertEqual(item["scoring"]["gaps_ge_500ms"],1 if item["mode"]=="B" else 0)
                self.assertFalse(item["scoring"]["tail_censored"])
                self.assertEqual(item["duration_s"],2)
            self.assertEqual(result["frametime"]["selected_swapchain"],"primary")
            self.assertEqual(result["frametime"]["blocks"]["B2"]["near_race_car_ms"]["over_100ms"],1)
            self.assertEqual(result["frametime"]["blocks"]["A1"]["frame_ms"]["over_100ms"],0)

    def test_stationary_player_is_not_a_valid_driving_comparison(self):
        with tempfile.TemporaryDirectory() as directory:
            folder=pathlib.Path(directory); entry=block(folder,"A1","A",10000,moving=False)
            result=ab.read_block(folder,entry,0)
            self.assertFalse(result["usable_for_comparison"])
            self.assertEqual(result["player"]["moving_fraction"],0)

    def test_partial_recording_and_an_extra_endpoint_in_control_are_rejected(self):
        for options in ({"footer":False},{"unexpected":True}):
            with self.subTest(options=options), tempfile.TemporaryDirectory() as directory:
                folder=pathlib.Path(directory); entry=block(folder,"C0","C",10000,**options)
                with self.assertRaises(ValueError): ab.read_block(folder,entry,0)

    def test_missing_or_non_qpc_presentmon_is_unavailable_not_zero_frametime(self):
        with tempfile.TemporaryDirectory() as directory:
            path=pathlib.Path(directory)/"frames.csv"
            self.assertEqual(ab.presentmon(path,[],123)["state"],"unavailable")
            path.write_text("ProcessID,SwapChainAddress,CPUStartTime,FrameTime\n123,0x1,0,16\n")
            self.assertEqual(ab.presentmon(path,[],123)["state"],"unavailable")

    def test_body_hash_failure_is_rejected_even_with_a_valid_gzip(self):
        with tempfile.TemporaryDirectory() as directory:
            folder=pathlib.Path(directory); block(folder,"A1","A",10000)
            path=folder/"A1/sesion.lmu.gz"
            raw=bytearray(gzip.decompress(path.read_bytes()))
            cursor=0
            while cursor<len(raw):
                meta,size=struct.unpack_from("<II",raw,cursor)
                if size:
                    raw[cursor+8+meta]^=1
                    break
                cursor+=8+meta+size
            path.write_bytes(gzip.compress(raw))
            with self.assertRaises(ValueError): list(ab.records(path))


if __name__=="__main__": unittest.main()
