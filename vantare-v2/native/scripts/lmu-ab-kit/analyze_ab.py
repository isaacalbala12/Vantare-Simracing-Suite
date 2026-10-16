"""A/B LMU: lector gzip/XOR streaming y PresentMon QPC; solo biblioteca estándar."""
import argparse
import collections
import csv
import gzip
import hashlib
import json
import math
import pathlib
import struct

CORE = {"/rest/watch/standings", "/rest/watch/sessionInfo"}
EXTRA = "/rest/race/car"
KEYS = CORE | {EXTRA, "LMU_Data", "LMU_SharedMemoryLockData", ""}


def records(path):
    previous = {}
    ended = False
    last = 0
    with gzip.open(path, "rb") as stream:
        while True:
            lengths = stream.read(8)
            if not lengths:
                if not ended:
                    raise ValueError("Falta footer")
                return
            if ended or len(lengths) != 8:
                raise ValueError("Registro truncado o posterior al footer")
            meta_len, size = struct.unpack("<II", lengths)
            if meta_len > 256 << 10 or size > 16 << 20:
                raise ValueError("Registro fuera de límites")
            meta_bytes, delta = stream.read(meta_len), stream.read(size)
            if len(meta_bytes) != meta_len or len(delta) != size:
                raise ValueError("Cuerpo truncado")
            meta = json.loads(meta_bytes)
            key = meta.get("key", "")
            if key not in KEYS:
                raise ValueError(f"Fuente ajena al A/B: {key}")
            old = previous.get(key, b"")[:size]
            body = (int.from_bytes(delta, "little") ^ int.from_bytes(old, "little")).to_bytes(size, "little")
            if hashlib.sha256(body).hexdigest() != meta["sha256"]:
                raise ValueError("SHA-256 de cuerpo incorrecto")
            at = meta.get("at_ns", 0)
            if at < last:
                raise ValueError("Retroceso de at_ns")
            last = at
            previous[key] = body
            ended = meta["kind"] == "footer"
            yield meta, body


def distribution(values):
    values = sorted(values)
    if not values:
        return {"n": 0}
    return {"n": len(values), "min": values[0], "p50": values[(len(values)-1)//2],
            "p95": values[(len(values)-1)*95//100], "p99": values[(len(values)-1)*99//100], "max": values[-1]}


class Clock:
    def __init__(self):
        self.previous = None
        self.at = None
        self.intervals = []
        self.gaps = []
        self.last_seen = None
        self.unobserved = False
        self.acquisition_gaps = []

    def observe(self, at, value):
        self.unobserved |= self.last_seen is not None and at-self.last_seen >= 500_000_000
        changed = value != self.previous
        if changed:
            if self.at is not None:
                self.intervals.append((at-self.at)/1e6)
                if at-self.at >= 500_000_000:
                    (self.acquisition_gaps if self.unobserved else self.gaps).append([self.at, at])
            self.at, self.previous = at, value
            self.unobserved=False
        self.last_seen=at
        return changed

    def report(self, end, start):
        tail = self.at is not None and end-self.at >= 500_000_000 and not self.unobserved
        gaps = self.gaps + ([[self.at, end]] if tail else [])
        stale_ns = sum(max(0, b-max(a+500_000_000, start)) for a, b in gaps)
        return {"change_intervals_ms": distribution(self.intervals), "gaps_ge_500ms": len(gaps),
                "long_intervals_ns": gaps, "acquisition_gap_intervals_ns":self.acquisition_gaps,"tail_censored": tail,
                "observed_stall_time_s": stale_ns/1e9,
                "observed_stall_time_pct": 100*stale_ns/max(1, end-start)}


def read_block(folder, entry, washout):
    expected = set() if entry["mode"] == "C" else CORE | ({EXTRA} if entry["mode"] == "B" else set())
    first = True
    header = None
    footer = None
    scoring, telemetry = Clock(), Clock()
    reads, speeds, inputs = [], [], {k: [] for k in ("throttle", "brake", "steering")}
    rest = collections.defaultdict(list)
    observations, unstable, previous_read, end, last_shm = 0, 0, None, 0, 0
    player_rows=0
    scope = None
    scope_changed = False
    practice_only = True
    first_source = None
    last_source = None
    rewound = False
    for meta, body in records(folder / entry["name"] / "sesion.lmu.gz"):
        kind, key, at = meta["kind"], meta.get("key", ""), meta.get("at_ns", 0)
        if first:
            header = meta.get("details", {})
            if kind != "header" or header.get("schema") != "vantare.lmu-full.v1":
                raise ValueError("Cabecera desconocida")
            catalog = header.get("catalog", {})
            if catalog.get("experiment") != "vantare.lmu-ab.v1" or catalog.get("block") != entry["name"] or catalog.get("mode") != entry["mode"] or catalog.get("duration_s") != entry["duration_s"] or set(catalog.get("capture", [])) != expected or header.get("rest_core_production_policy") is not True:
                raise ValueError("El archivo no corresponde a la condición declarada")
            if header.get("build") not in {"1.3.0.0", "1.4.0.0", "1.4.1.3", "1.4.2.0"}:
                raise ValueError("Layout sin verificar")
            first = False
        end = at
        if kind == "footer":
            footer = meta["details"]
        if kind == "rest":
            if key not in expected:
                raise ValueError("Se consultó un endpoint fuera de la condición")
            if at >= washout:
                complete = meta.get("details", {}).get("completed_ns", at)
                started = meta.get("started_ns", at)
                if not started <= complete <= at:
                    raise ValueError("Tiempos REST inconsistentes")
                rest[key].append({"started_ns": started, "completed_ns": complete,
                                  "at_ns": at, "ok": meta.get("status") == 200 and not meta.get("error") and bool(body.strip())})
        if kind != "shm" or key != "LMU_Data" or at < washout:
            continue
        if not meta.get("details", {}).get("stable"):
            unstable += 1
            continue
        if len(body) < 324820:
            raise ValueError("SHM corta")
        last_shm = at
        if previous_read is not None:
            reads.append((at-previous_read)/1e6)
        previous_read = at
        count = struct.unpack_from("<i", body, 1736)[0]
        if not 1 <= count <= 104:
            continue
        observations += 1
        session = struct.unpack_from("<i",body,1696)[0]
        signature = hashlib.sha256(body[1632:1700]).hexdigest()
        scope_changed |= scope is not None and scope != signature
        scope = signature
        practice_only &= 1 <= session <= 4
        source = struct.unpack_from("<d", body, 1700)[0]
        if not math.isfinite(source) or source < 0:
            raise ValueError("Reloj scoring inválido")
        if first_source is None:
            first_source=source
        rewound |= last_source is not None and source < last_source
        last_source=source
        scoring.observe(at, source)
        index = body[128465]
        if body[128466] != 1 or index >= body[128464] or index >= 104:
            continue
        base = 128468+index*1888
        clock = struct.unpack_from("<d", body, base+12)[0]
        if not math.isfinite(clock) or clock <= 0:
            continue
        player_rows+=1
        if telemetry.observe(at, clock):
            speed = math.hypot(*struct.unpack_from("<ddd", body, base+184))
            if math.isfinite(speed) and 0 <= speed < 150:
                speeds.append(speed)
            for name, offset in (("throttle",420),("brake",428),("steering",404)):
                value = struct.unpack_from("<d", body, base+offset)[0]
                if math.isfinite(value) and -1 <= value <= 1:
                    inputs[name].append(value)
    if not header or not footer:
        raise ValueError("Sin cabecera/footer íntegros")
    moving = sum(s > 1 for s in speeds)/max(1, len(speeds))
    issues = []
    if scope_changed or rewound or not practice_only:
        issues.append("cambio de circuito/sesión/reloj o sesión distinta de práctica")
    if last_shm/1e9 < entry["duration_s"]-1:
        issues.append("duración incompleta")
    if not speeds or moving < 0.8:
        issues.append("jugador sin movimiento demostrado en >=80% de actualizaciones")
    if player_rows/max(1,observations) < 0.95:
        issues.append("telemetría del jugador ausente en más del 5% de lecturas activas")
    if reads and max(reads) >= 500:
        issues.append("huecos de adquisición >=500ms: no atribuirlos a publicación de LMU")
    for key in expected:
        if not rest[key]:
            issues.append(f"sin consultas observadas: {key}")
        elif key in CORE and not any(r["ok"] for r in rest[key]):
            issues.append(f"endpoint productivo sin respuesta utilizable: {key}")
    stats = {}
    for key, requests in rest.items():
        stats[key] = {"requests": len(requests), "ok": sum(r["ok"] for r in requests),
                      "latency_ms": distribution([(r["completed_ns"]-r["started_ns"])/1e6 for r in requests]),
                      "start_intervals_ms": distribution([(b["started_ns"]-a["started_ns"])/1e6 for a,b in zip(requests,requests[1:])])}
    result = {"name": entry["name"], "mode": entry["mode"], "duration_s":last_shm/1e9,"file_duration_s":end/1e9,
              "washout_s":washout/1e9,"usable_for_comparison":not issues,"issues":issues,
              "stable_active_shm":observations,"unstable_shm":unstable,"shm_read_intervals_ms":distribution(reads),
              "scoring":scoring.report(last_shm,washout),"telemetry":telemetry.report(last_shm,washout),
              "player":{"source_updates":len(speeds),"moving_fraction":moving,"speed_mps":distribution(speeds),
                        "inputs":{k:distribution(v) for k,v in inputs.items()}},"rest":stats,
              "qpc_anchor":header.get("qpc_anchor"),"source_scope_hash":scope,"first_source_s":first_source,"last_source_s":last_source,"requests":dict(rest),"integrity":"hashes_footer_gzip_crc_verified"}
    for key, requests in rest.items():
        result["rest"][key]["telemetry_gaps_overlapping_request"] = sum(any(r["started_ns"]<b and r["completed_ns"]>a for r in requests) for a,b in result["telemetry"]["long_intervals_ns"])
    return result


def presentmon(path, blocks, game_pid):
    if not path.exists():
        return {"state":"unavailable","reason":"CSV ausente"}
    counts = collections.Counter()
    try:
        with path.open(encoding="utf-8-sig", newline="") as file:
            rows = csv.DictReader(file)
            if not {"CPUStartQPC","FrameTime","ProcessID","SwapChainAddress"} <= set(rows.fieldnames or []):
                return {"state":"unavailable","reason":"faltan columnas v2 QPC verificadas"}
            for row in rows:
                if int(row["ProcessID"]) == game_pid:
                    counts[row["SwapChainAddress"]] += 1
        if not counts:
            return {"state":"unavailable","reason":"sin eventos del PID de LMU"}
        chain = counts.most_common(1)[0][0]
        by_block = {b["name"]:{"frame_ms":[],"displayed_ms":[],"near_race_car_ms":[],"away_race_car_ms":[]} for b in blocks}
        with path.open(encoding="utf-8-sig", newline="") as file:
            for row in csv.DictReader(file):
                if int(row["ProcessID"]) != game_pid or row["SwapChainAddress"] != chain:
                    continue
                stamp = int(row["CPUStartQPC"])
                frame = float(row["FrameTime"])
                if not math.isfinite(frame) or frame <= 0:
                    continue
                for block in blocks:
                    anchor = block["qpc_anchor"]
                    if not anchor or anchor.get("frequency",0) <= 0:
                        continue
                    at = (stamp-anchor["counter"])/anchor["frequency"]*1e9 + anchor["at_ns"]
                    if block["washout_s"]*1e9 <= at < block["duration_s"]*1e9:
                        dest = by_block[block["name"]]
                        dest["frame_ms"].append(frame)
                        shown = row.get("DisplayedTime", "NA")
                        if shown != "NA":
                            value = float(shown)
                            if math.isfinite(value) and value > 0:
                                dest["displayed_ms"].append(value)
                        nearby = any(at+frame*1e6 >= r["started_ns"]-50_000_000 and at <= r["completed_ns"]+250_000_000 for r in block["requests"].get(EXTRA,[]))
                        dest["near_race_car_ms" if nearby else "away_race_car_ms"].append(frame)
                        break
        for name, stats in by_block.items():
            by_block[name] = {key:distribution(values) | {"over_50ms":sum(v>50 for v in values),"over_100ms":sum(v>100 for v in values)} for key,values in stats.items()}
        matched=sum(v["frame_ms"]["n"] for v in by_block.values())
        state="unavailable" if not matched else ("evaluated" if all(v["frame_ms"]["n"] for v in by_block.values()) else "evaluated_partial")
        return {"state":state,"matched_frames":matched,"selected_swapchain":chain,"blocks":by_block,
                "note":"FrameTime CPU y DisplayedTime separados. Ventana conservadora GET: -50ms a fin+250ms, con solapamiento del intervalo de frame. Asociación, no causalidad aislada."}
    except (ValueError,KeyError,csv.Error) as error:
        return {"state":"unavailable","reason":str(error)}


def analyze(folder):
    run = json.loads((folder / "run.json").read_text(encoding="utf-8-sig"))
    if run.get("schema") != "vantare.lmu-ab-run.v1":
        raise ValueError("Manifest desconocido")
    blocks = []
    for entry in run["blocks"]:
        if pathlib.Path(entry["name"]).name != entry["name"] or entry["name"] not in {"C0","A1","A2","A3","A4","B1","B2","B3","B4"}:
            raise ValueError("Bloque inválido")
        print(f"Analizando {entry['name']} en streaming",flush=True)
        blocks.append(read_block(folder,entry,int(run.get("washout_s",10)*1e9)))
    frames = presentmon(folder / "presentmon.csv",blocks,run["game_pid"])
    for before, after in zip(blocks,blocks[1:]):
        if before["source_scope_hash"] != after["source_scope_hash"] or (after["first_source_s"] is not None and before["last_source_s"] is not None and after["first_source_s"] < before["last_source_s"]):
            after["issues"].append("sesión/reloj cambió entre bloques")
            after["usable_for_comparison"]=False
    modes = collections.Counter(b["mode"] for b in blocks)
    complete = run.get("state") == "complete" and modes["A"] == modes["B"] == 2 and all(b["usable_for_comparison"] for b in blocks)
    return {"schema":"vantare.lmu-ab-analysis.v1","state":"evaluated_requires_review" if complete else "incomplete_or_not_comparable",
            "blocks":blocks,"frametime":frames,"physical_live_certified":False,
            "note":"C controla el coste SHM; A añade los dos GET productivos juntos; B solo añade race/car. Si A empeora respecto a C, no permite atribuirlo individualmente a standings o sessionInfo: hacen falta controles separados."}


def markdown(report):
    lines=["# LMU A/B: publicación SHM y frametime", "", f"Estado: `{report['state']}`. Solo práctica; no certifica carrera/formación ni ausencia de tirones.", "", "| Bloque | Jugador móvil | Lectura p99 ms | Scoring sin avance ≥500ms | Telemetría sin avance ≥500ms | Tiempo scoring caducado | FrameTime p99 ms |", "| --- | ---: | ---: | ---: | ---: | ---: | ---: |"]
    for b in report["blocks"]:
        p=report["frametime"].get("blocks",{}).get(b["name"],{}).get("frame_ms",{})
        lines.append(f"| {b['name']} | {100*b['player']['moving_fraction']:.1f}% | {b['shm_read_intervals_ms'].get('p99','—')} | {b['scoring']['gaps_ge_500ms']} | {b['telemetry']['gaps_ge_500ms']} | {b['scoring']['observed_stall_time_pct']:.3f}% | {p.get('p99','no disponible')} |")
        for issue in b["issues"]:
            lines.append(f"\n{b['name']}: {issue}.")
    lines += ["", f"Frametime: `{report['frametime']['state']}`. DisplayedTime, p50/p95/p99, >50/>100ms y ventanas por petición en analysis.json.", "", report["note"], "", "No confundir mDeltaTime de física ni cadencia SHM con frametime de renderizado. Primeros 10 s de cada bloque excluidos por transición. Una coincidencia temporal no demuestra causalidad por sí sola."]
    return "\n".join(lines)+"\n"


def main():
    parser=argparse.ArgumentParser()
    parser.add_argument("run",type=pathlib.Path)
    parser.add_argument("--output",type=pathlib.Path,required=True)
    args=parser.parse_args()
    args.output.mkdir(parents=True,exist_ok=False)
    try:
        report=analyze(args.run)
    except (OSError,ValueError,EOFError,KeyError,struct.error) as error:
        report={"schema":"vantare.lmu-ab-analysis.v1","state":"failed","error":str(error),"physical_live_certified":False}
        (args.output/"analysis.json").write_text(json.dumps(report,indent=2,ensure_ascii=False)+"\n",encoding="utf8")
        (args.output/"report.md").write_text("# A/B no verificable\n\n"+str(error)+"\n",encoding="utf8")
        raise SystemExit(1) from error
    (args.output/"analysis.json").write_text(json.dumps(report,indent=2,ensure_ascii=False)+"\n",encoding="utf8")
    (args.output/"report.md").write_text(markdown(report),encoding="utf8")
    print(report["state"])
    if report["state"] != "evaluated_requires_review":
        raise SystemExit(2)


if __name__ == "__main__":
    main()
