"""OpenAI streaming benchmark; no SDK, tokenizer guesses or GPU dependencies."""
import argparse
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
import hashlib
import json
import math
import os
from pathlib import Path
import random
import re
import statistics
import subprocess
import threading
import time
import urllib.request
import urllib.parse
import urllib.error

from cases import build_cases, messages
from evaluator_v2 import score_v2

TOOL = {"type": "function", "function": {"name": "get_race_fact",
        "description": "Read an authorised race fact; no side effects.",
        "parameters": {"type": "object", "properties": {"topic": {
            "type": "string", "enum": ["fuel", "tyres", "gaps"]}},
            "required": ["topic"], "additionalProperties": False}}}


def sse(response, deadline=None):
    """Parse SSE events, including comments and multiline data; bound event size."""
    data = []
    size = 0
    while True:
        if deadline is not None and time.perf_counter() >= deadline:
            raise TimeoutError("SSE deadline exceeded")
        raw = response.readline(1048577)
        if len(raw) > 1048576:
            raise ValueError("SSE line exceeds 1 MiB")
        if not raw:
            if data:
                yield "\n".join(data)
            return
        line = raw.decode("utf-8").rstrip("\r\n")
        size += len(raw)
        if size > 1048576:
            raise ValueError("SSE event exceeds 1 MiB")
        if not line:
            if data:
                yield "\n".join(data)
            data, size = [], 0
        elif line.startswith("data:"):
            data.append(line[5:].removeprefix(" "))


def strict_json(value):
    def pairs(items):
        result = {}
        for key, item in items:
            if key in result:
                raise ValueError("duplicate JSON key")
            result[key] = item
        return result

    def constant(_):
        raise ValueError("non-finite JSON number")

    def finite(value):
        number = float(value)
        if not math.isfinite(number):
            raise ValueError("non-finite JSON number")
        return number

    return json.loads(value, object_pairs_hook=pairs, parse_constant=constant, parse_float=finite)


def same(actual, expected):
    if isinstance(expected, (float, int)) and not isinstance(expected, bool):
        return (isinstance(actual, (int, float)) and not isinstance(actual, bool)
                and math.isfinite(actual) and abs(actual - expected) <= 0.01)
    if isinstance(expected, dict):
        return (isinstance(actual, dict) and actual.keys() == expected.keys()
                and all(same(actual[k], v) for k, v in expected.items()))
    return type(actual) is type(expected) and actual == expected


def score(case, content, calls):
    checks = {"format": False, "facts": False, "numeric": None,
              "language": None, "length": len(content.split()) <= case["max_words"]}
    actual = None
    try:
        if case["kind"] == "tool":
            checks["format"] = (len(calls) == 1 and not content.strip()
                and calls[0].get("type") == "function" and isinstance(calls[0].get("id"), str)
                and bool(calls[0]["id"]))
            if len(calls) == 1:
                function = calls[0]["function"]
                actual = {"name": function["name"],
                          "arguments": strict_json(function["arguments"])}
            checks["facts"] = same(actual, case["gold"])
        elif case["kind"] == "json":
            actual = strict_json(content)
            checks["format"] = isinstance(actual, dict) and not calls
            checks["facts"] = same(actual, case["gold"])
            if case["numeric"]:
                checks["numeric"] = isinstance(actual, dict) and all(
                    k in actual and same(actual[k], v) for k, v in case["numeric"].items())
            # Machine tags / numeric JSON have no natural-language compliance claim.
        elif case["kind"] == "discourse":
            checks["format"] = bool(content.strip()) and not calls
            checks["facts"] = case["gold"] in content
            checks["numeric"] = re.findall(r"\d+(?:[.,]\d+)?", content) == re.findall(
                r"\d+(?:[.,]\d+)?", case["gold"])
            # Open language/implicature is not decided by a word-list heuristic.
            checks["language"] = None
        else:
            checks["format"] = bool(content.strip()) and not calls
            checks["facts"] = " ".join(content.split()) == case["gold"]
            checks["language"] = checks["facts"]
    except (ValueError, KeyError, TypeError):
        pass
    return {"checks": checks, "automatic_pass": all(v for v in checks.values() if v is not None),
            "hallucination_proxy": not checks["facts"] if checks["format"] else None,
            "semantic_review": "pending",
            "note": "Canonical baseline / structural discourse checks only. "
                    "A mismatch is not proof of a hallucination; human semantic/language review required."}


def request(args, case, context_chars, concurrency, iteration, barrier=None):
    prompt = messages(case, context_chars, f"seed={args.seed};pass={iteration}")
    payload = {"model": args.model, "messages": prompt, "stream": True,
               "stream_options": {"include_usage": True}, "temperature": args.temperature,
               "seed": args.seed, "max_tokens": case["max_tokens"]}
    if case["kind"] == "json":
        payload["response_format"] = {"type": "json_object"}
    if case["kind"] == "tool":
        payload["tools"] = [TOOL]
        payload["tool_choice"] = "auto"
    raw = json.dumps(payload, ensure_ascii=False).encode("utf-8")
    headers = {"Content-Type": "application/json", "Accept": "text/event-stream"}
    key = os.environ.get("ENGINEER_BENCH_API_KEY")
    if key:
        headers["Authorization"] = "Bearer " + key
    req = urllib.request.Request(args.base_url.rstrip("/") + "/chat/completions", raw, headers)
    started_utc = datetime.now(timezone.utc).isoformat()
    start = time.perf_counter()
    first, last, done, finish = None, None, False, None
    content, reasoning, calls, usage, extras = "", "", {}, {}, []
    response_model, fingerprint = None, None
    error = None
    try:
        if barrier:
            barrier.wait(timeout=args.timeout)
            started_utc = datetime.now(timezone.utc).isoformat()
            start = time.perf_counter()
        with urllib.request.urlopen(req, timeout=args.timeout) as response:
            if "text/event-stream" not in response.headers.get("Content-Type", ""):
                raise ValueError("Expected text/event-stream")
            for event in sse(response, start + args.timeout):
                now = time.perf_counter()
                if now - start > args.timeout:
                    raise TimeoutError("request total deadline exceeded")
                if event == "[DONE]":
                    done = True
                    break
                chunk = strict_json(event)
                response_model = chunk.get("model") or response_model
                fingerprint = chunk.get("system_fingerprint") or fingerprint
                if "error" in chunk:
                    raise ValueError("Engine returned a streaming error")
                if chunk.get("usage"):
                    if not isinstance(chunk["usage"], dict):
                        raise ValueError("Invalid usage object")
                    usage = chunk["usage"]
                for choice in chunk.get("choices", []):
                    if choice.get("index", 0) != 0:
                        continue
                    delta = choice.get("delta", {})
                    part = delta.get("content") or ""
                    reasoning += delta.get("reasoning_content") or ""
                    fragments = delta.get("tool_calls", [])
                    meaningful = bool(part or any(f.get("function", {}).get("arguments") or
                                                  f.get("function", {}).get("name") for f in fragments))
                    if meaningful:
                        first = now if first is None else first
                        last = now
                    content += part
                    for fragment in fragments:
                        if not isinstance(fragment.get("index"), int) or fragment["index"] < 0:
                            raise ValueError("Invalid tool call index")
                        if fragment.get("type", "function") != "function":
                            raise ValueError("Unsupported tool call type")
                        call = calls.setdefault(fragment["index"], {"id": "", "type": "function",
                            "function": {"name": "", "arguments": ""}})
                        call["id"] += fragment.get("id", "")
                        for field in ("name", "arguments"):
                            call["function"][field] += fragment.get("function", {}).get(field, "")
                    finish = choice.get("finish_reason") or finish
                if len(content) + len(reasoning) + sum(len(c["function"]["arguments"]) for c in calls.values()) > 1048576:
                    raise ValueError("Generation exceeds 1 MiB")
                extra = {k: v for k, v in chunk.items() if k not in
                         {"choices", "usage", "id", "object", "created", "model", "system_fingerprint"}}
                if extra:
                    extras.append(extra)
            if not done or finish not in {"stop", "tool_calls"}:
                raise ValueError("Incomplete stream or truncated generation")
    except Exception as exc:  # Each failed request remains in the denominator.
        # Never persist server bodies / auth headers; retain class and safe diagnostic.
        error = {"type": type(exc).__name__, "message": str(exc)[:240]
                 if isinstance(exc, (ValueError, TimeoutError)) else "request failed; inspect server locally"}
        if isinstance(exc, urllib.error.HTTPError):
            error["http_status"] = exc.code
    end = time.perf_counter()
    ttft = (first - start) * 1000 if first is not None else None
    completion_tokens = usage.get("completion_tokens")
    prompt_tokens = usage.get("prompt_tokens")
    completion_tokens = completion_tokens if type(completion_tokens) is int and completion_tokens >= 0 else None
    prompt_tokens = prompt_tokens if type(prompt_tokens) is int and prompt_tokens >= 0 else None
    quality = score(case, content, [calls[k] for k in sorted(calls)])
    if error:
        quality["automatic_pass"] = False
        quality["hallucination_proxy"] = None
    row = {"case_id": case["id"], "kind": case["kind"], "language": case["language"],
            "cohort": case["cohort"],
            "started_utc": started_utc, "ended_utc": datetime.now(timezone.utc).isoformat(),
            "context_chars": context_chars, "concurrency": concurrency, "pass": iteration,
            "request_sha256": hashlib.sha256(raw).hexdigest(),
            "request_bytes": len(raw), "ttft_ms": ttft, "total_ms": (end - start) * 1000,
            "visible_decode_interval_ms": (last - first) * 1000 if first is not None else None,
            # Usage counts may include reasoning and multiple tokens per SSE event.
            "completion_tokens_per_generation_s_proxy": completion_tokens / (last - first)
                if isinstance(completion_tokens, int) and first is not None and last > first else None,
            "prompt_tokens_per_ttft_s_proxy": prompt_tokens / (first - start)
                if isinstance(prompt_tokens, int) and first is not None and first > start else None,
            "usage": usage, "engine_stream_metrics": extras,
            "response_model": response_model, "system_fingerprint": fingerprint,
            "engine_timings": engine_timings(extras), "content": content,
            "reasoning_content": reasoning, "tool_calls": list(calls.values()),
            "finish_reason": finish, "stream_done": done, "error": error, "quality": quality,
            "ttft_budget_ms": case["ttft_budget_ms"],
            "completion_budget_ms": case["completion_budget_ms"],
            "within_budget": not error and ttft is not None and ttft <= case["ttft_budget_ms"]
                and (end - start) * 1000 <= case["completion_budget_ms"]}
    row["quality_v2"] = score_v2(case, row, strict_json, same)
    return row


def engine_timings(extras):
    """Recognise documented llama.cpp/Ollama-style per-request timing units only."""
    result = {"prefill_tokens_s": None, "decode_tokens_s": None, "load_ms": None}
    for extra in extras:
        timing = extra.get("timings", {})
        if isinstance(timing, dict):
            for name, count, duration in (("prefill_tokens_s", "prompt_n", "prompt_ms"),
                                          ("decode_tokens_s", "predicted_n", "predicted_ms")):
                n, ms = timing.get(count), timing.get(duration)
                if isinstance(n, (int, float)) and isinstance(ms, (int, float)) and ms > 0:
                    result[name] = n * 1000 / ms
        for name, count, duration in (("prefill_tokens_s", "prompt_eval_count", "prompt_eval_duration"),
                                      ("decode_tokens_s", "eval_count", "eval_duration")):
            n, ns = extra.get(count), extra.get(duration)
            if isinstance(n, (int, float)) and isinstance(ns, (int, float)) and ns > 0:
                result[name] = n * 1e9 / ns
        if isinstance(extra.get("load_duration"), (int, float)):
            result["load_ms"] = extra["load_duration"] / 1e6
    return result


def stats(values):
    values = sorted(v for v in values if v is not None)
    if not values:
        return None
    return {"n": len(values), "min": values[0], "median": statistics.median(values),
            "p95": values[math.ceil(len(values) * 0.95) - 1], "max": values[-1],
            "mean": statistics.mean(values), "stdev": statistics.pstdev(values)}


def source_revision():
    """Read Git identity without starting a second process during quiet-window validation."""
    try:
        root = Path(__file__).resolve().parents[2]
        git = root / ".git"
        if git.is_file():
            git = (root / git.read_text(encoding="utf-8").strip().removeprefix("gitdir: ")).resolve()
        head = (git / "HEAD").read_text(encoding="utf-8").strip()
        if not head.startswith("ref: "):
            return head
        ref = head.removeprefix("ref: ")
        common = (git / (git / "commondir").read_text(encoding="utf-8").strip()).resolve() if (git / "commondir").exists() else git
        if (common / ref).exists():
            return (common / ref).read_text(encoding="utf-8").strip()
        for line in (common / "packed-refs").read_text(encoding="utf-8").splitlines():
            if line.endswith(" " + ref):
                return line.split()[0]
    except OSError:
        pass
    return None


def summarize(rows):
    groups = {}
    for row in rows:
        key = (row["case_id"], row["context_chars"], row["concurrency"])
        groups.setdefault(key, []).append(row)
    return [{"case_id": key[0], "context_chars": key[1], "concurrency": key[2],
             "attempts": len(items), "errors": sum(bool(r["error"]) for r in items),
             "automatic_passes": sum(r["quality"]["automatic_pass"] for r in items),
             "v2_semantic_projection_passes": sum(r.get("quality_v2", {}).get("semantic_pass", False) for r in items)
                 if all("quality_v2" in r for r in items) else None,
             "quality_checks": {name: {"pass": sum(r["quality"]["checks"].get(name) is True for r in items),
                 "fail": sum(r["quality"]["checks"].get(name) is False for r in items),
                 "not_applicable_or_manual": sum(r["quality"]["checks"].get(name) is None for r in items)}
                 for name in {name for r in items for name in r["quality"]["checks"]}},
             "within_budget": sum(r["within_budget"] for r in items),
             "prompt_tokens": stats([r.get("usage", {}).get("prompt_tokens") for r in items
                                     if type(r.get("usage", {}).get("prompt_tokens")) is int]),
             "ttft_ms": stats([r["ttft_ms"] for r in items if not r["error"]]),
             "total_ms": stats([r["total_ms"] for r in items if not r["error"]]),
             "failed_request_ms": stats([r["total_ms"] for r in items if r["error"]]),
             "decode_proxy": stats([r["completion_tokens_per_generation_s_proxy"] for r in items]),
             "prefill_tokens_s": stats([r.get("engine_timings", {}).get("prefill_tokens_s") for r in items]),
             "decode_tokens_s": stats([r.get("engine_timings", {}).get("decode_tokens_s") for r in items]),
             "quality_variation": len({json.dumps(r["quality"]["checks"], sort_keys=True) for r in items}),
             "distinct_answers": len({json.dumps([r["content"], r["tool_calls"]], sort_keys=True) for r in items})}
            for key, items in sorted(groups.items())]


def metrics_sample(url, format_="json"):
    try:
        with urllib.request.urlopen(url, timeout=2) as response:
            raw = response.read(1048577)
        if len(raw) > 1048576:
            raise ValueError("metrics exceed 1 MiB")
        return {"data": strict_json(raw) if format_ == "json" else raw.decode("utf-8"), "error": None}
    except Exception as exc:
        return {"data": None, "error": type(exc).__name__}


def sample_metrics(url, stop, path, format_):
    with path.open("w", encoding="utf-8") as output:
        while not stop.is_set():
            output.write(json.dumps({"utc": datetime.now(timezone.utc).isoformat(),
                         **metrics_sample(url, format_)}) + "\n")
            output.flush()
            stop.wait(1)
        output.write(json.dumps({"utc": datetime.now(timezone.utc).isoformat(),
                     "phase": "after", **metrics_sample(url, format_)}) + "\n")


def read_samples(path):
    samples, failures = [], []
    for number, line in enumerate(path.read_bytes().splitlines(), 1):
        if not line:
            continue
        try:
            sample = strict_json(line.decode("utf-8-sig"))
            if not isinstance(sample, dict):
                raise ValueError("sample is not an object")
            samples.append(sample)
        except (ValueError, UnicodeError):
            failures.append(number)
    return samples, failures


def resource_summary(path, rows):
    if not path.exists():
        return {"available": False, "reason": "No resource samples file; sampler unconfigured or failed"}
    samples, malformed = read_samples(path)
    def aggregate(items):
        fields = ("process_working_set_bytes", "process_private_bytes", "process_peak_working_set_bytes",
                  "process_cpu_percent_machine", "process_cpu_percent_one_core", "system_cpu_percent")
        result = {key: stats([s.get(key) for s in items]) for key in fields}
        result["process_gpu_dedicated_bytes"] = stats([
            sum(v["DedicatedUsage"] for v in s["gpu_process_memory"])
            for s in items if s.get("gpu_process_counters_available")])
        result["adapter_gpu_dedicated_bytes"] = stats([
            sum(v["DedicatedUsage"] for v in s["gpu_adapter_memory"])
            for s in items if s.get("gpu_adapter_counters_available")])
        result["samples"] = len(items)
        result["errors"] = sum(bool(s.get("process_error") or s.get("gpu_error")) for s in items)
        return result
    groups = {}
    for context, concurrency in sorted({(r["context_chars"], r["concurrency"]) for r in rows}):
        intervals = [(r["started_utc"], r["ended_utc"]) for r in rows
                     if r["context_chars"] == context and r["concurrency"] == concurrency]
        points = [s for s in samples if any(datetime.fromisoformat(start) <=
            datetime.fromisoformat(s["utc"]) <= datetime.fromisoformat(end) for start, end in intervals)]
        groups[f"context={context},concurrency={concurrency}"] = aggregate(points)
    return {"available": bool(samples), "all": aggregate(samples), "groups": groups,
            "malformed_lines": malformed,
            "weights_bytes": None, "kv_cache_bytes": None,
            "note": "WDDM dedicated bytes are process/adapter usage, not weights or KV attribution. "
                    "1 Hz sampled peaks may miss short spikes; process peak working set includes earlier lifetime."}


def engine_metrics_summary(path, mapping, rows=None):
    if not path.exists():
        return {"available": False}
    samples, malformed = read_samples(path)
    fields = ("weights_bytes", "kv_cache_bytes", "gpu_memory_bytes", "process_ram_bytes", "load_duration_ns")
    def aggregate(points):
        values = {name: [] for name in fields}
        for sample in points:
            data = sample.get("data")
            if not isinstance(data, dict):
                continue
            for field in fields:
                pointer = mapping.get(field, "/" + field)
                value = data
                try:
                    for part in pointer.lstrip("/").split("/"):
                        value = value[part.replace("~1", "/").replace("~0", "~")]
                except (TypeError, KeyError):
                    value = None
                if isinstance(value, (int, float)) and not isinstance(value, bool) and math.isfinite(value):
                    values[field].append(value)
        return {k: stats(v) for k, v in values.items()}
    groups = {}
    for context, concurrency in sorted({(r["context_chars"], r["concurrency"]) for r in rows or []}):
        intervals = [(r["started_utc"], r["ended_utc"]) for r in rows
                     if r["context_chars"] == context and r["concurrency"] == concurrency]
        points = [s for s in samples if any(datetime.fromisoformat(start) <=
            datetime.fromisoformat(s["utc"]) <= datetime.fromisoformat(end) for start, end in intervals)]
        groups[f"context={context},concurrency={concurrency}"] = aggregate(points)
    return {"available": True, "fields": aggregate(samples), "groups": groups,
            "samples": len(samples), "errors": sum(s.get("error") is not None for s in samples),
            "malformed_lines": malformed,
            "note": "Byte/ns units required. Prometheus is preserved raw, not guessed or converted."}


def markdown(reports):
    lines = ["# Engineer benchmark comparison", "",
             "No model winner is inferred automatically. Error counts and latency of failed requests "
             "are separate from successful-request latency.", "",
             "TTFT is end-to-end to first visible content/tool fragment; role/reasoning chunks excluded.",
             "Token rates below are usage-based proxies, never pure prefill/decode. "
             "Use engine timing counts/durations for pure rates. Quality is an exact canonical baseline; "
             "language of numeric-only JSON is not applicable. Human semantic review is pending.", "",
             "V2 is a separately labelled semantic projection. It can require extracting verified answer fields; "
             "it does not prove native instruction/schema compliance, alter measured latency, or simulate a changed prompt.", ""]
    for report in reports:
        meta = report["metadata"]
        lines += [f"## {meta['label']}", "", f"Mode: {meta['mode']}; model: {meta['model']}; "
                  f"seed: {meta['seed']}; temperature: {meta['temperature']}.", "",
                  "| Case | Context chars | Prompt tokens median | Concurrent | V1 strict / attempts | V2 semantic projection | Errors | TTFT median / p95 ms | Total p95 ms |",
                  "| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |"]
        for group in report["summary"]:
            ttft = group["ttft_ms"]
            total = group["total_ms"]
            latency = f"{ttft['median']:.1f} / {ttft['p95']:.1f}" if ttft else "unavailable"
            tokens = group.get("prompt_tokens")
            tokens = tokens["median"] if tokens else "unavailable"
            total_p95 = f"{total['p95']:.1f}" if total else "unavailable"
            semantic = group.get("v2_semantic_projection_passes")
            semantic = str(semantic) if semantic is not None else "not rescored"
            lines.append(f"| {group['case_id']} | {group['context_chars']} | {tokens} | {group['concurrency']} | "
                         f"{group['automatic_passes']} / {group['attempts']} | {semantic} | {group['errors']} | "
                         f"{latency} | {total_p95} |")
        if meta["mode"] == "mock":
            lines += ["", "MOCK: artificial answers and token usage. Validates plumbing only."]
        lines += ["", "Resource samples: resources.jsonl; engine metrics: engine-metrics.jsonl (if configured).",
                  "Model load time, weights/KV memory and disk size are unavailable unless supplied by "
                  "engine metrics / model metadata. Request latency is not model load time.", ""]
        if meta.get("model_metadata"):
            lines += ["Configuration supplied by engine worker:", "", "```json",
                      json.dumps(meta["model_metadata"], ensure_ascii=False, indent=2), "```", ""]
        if meta.get("model_disk_bytes") is not None:
            lines += [f"Model artifacts logical bytes: {meta['model_disk_bytes']}.", ""]
        resources = report.get("resources", {})
        if resources.get("available"):
            for key, value in resources["all"].items():
                if isinstance(value, dict) and "max" in value:
                    lines.append(f"- {key}: peak {value['max']:.2f}, median {value['median']:.2f} ({value['n']} samples).")
            lines.append("")
        for group in report["summary"]:
            for metric in ("prefill_tokens_s", "decode_tokens_s"):
                value = group.get(metric)
                if value:
                    lines.append(f"- {group['case_id']} context={group['context_chars']} "
                                 f"concurrency={group['concurrency']} engine {metric}: "
                                 f"median {value['median']:.2f}, p95 {value['p95']:.2f}.")
        engine = report.get("engine_metrics", {})
        for key, value in engine.get("fields", {}).items():
            if value:
                lines.append(f"- Engine {key}: peak {value['max']:.2f}, median {value['median']:.2f}.")
        lines.append("")
    return "\n".join(lines)


def run(args):
    if args.passes < 5:
        raise ValueError("At least five measured passes required")
    if args.mode == "real" and not args.quiet_window:
        raise ValueError("Real runs require an orchestrator-confirmed --quiet-window reference")
    if args.engine_pid and os.name != "nt":
        raise ValueError("Bundled resource sampler requires Windows; use engine metrics on other hosts")
    for url in (args.base_url, args.metrics_url):
        if url:
            parsed = urllib.parse.urlsplit(url)
            if parsed.scheme not in {"http", "https"} or not parsed.netloc or parsed.username or parsed.password or parsed.query or parsed.fragment:
                raise ValueError("Use an HTTP URL without credentials, query or fragment")
    cases = build_cases()
    selected = [c for c in cases if not args.case or c["id"] in args.case]
    if not selected:
        raise ValueError("No matching cases")
    output = Path(args.output)
    output.mkdir(parents=True, exist_ok=False)
    (output / "cases.json").write_text(json.dumps(cases, ensure_ascii=False, indent=2), encoding="utf-8")
    metadata = vars(args).copy()
    metadata.update({"started_utc": datetime.now(timezone.utc).isoformat(),
                     "schema_version": 1, "python": os.sys.version, "pid": os.getpid()})
    metadata["protocol_revision"] = "engineer-bench.v2"
    metadata["git_head"] = source_revision()
    metadata["source_sha256"] = {name: hashlib.sha256(Path(__file__).with_name(name).read_bytes()).hexdigest()
                                 for name in ("bench.py", "cases.py", "resources.ps1", "evaluator_v2.py")}
    metadata["corpus_sha256"] = hashlib.sha256(json.dumps(cases, sort_keys=True,
                                                         ensure_ascii=False).encode()).hexdigest()
    if args.model_metadata:
        metadata["model_metadata"] = strict_json(Path(args.model_metadata).read_text(encoding="utf-8"))
    if args.model_path:
        path = Path(args.model_path)
        if not path.exists():
            raise ValueError("Model artifact path does not exist")
        metadata["model_disk_bytes"] = path.stat().st_size if path.is_file() else sum(
            p.stat().st_size for p in path.rglob("*") if p.is_file())
    stop = threading.Event()
    sampler = None
    monitor = None
    rows = []
    run_error = None
    rng = random.Random(args.seed)
    try:
        if args.metrics_url:
            sampler = threading.Thread(target=sample_metrics, args=(args.metrics_url, stop,
                output / "engine-metrics.jsonl", args.metrics_format))
            sampler.start()
        if args.engine_pid:
            monitor = subprocess.Popen(["pwsh", "-NoProfile", "-File",
                str(Path(__file__).with_name("resources.ps1")), "-EnginePid", str(args.engine_pid),
                "-Output", str((output / "resources.jsonl").resolve()),
                "-StopFile", str((output / "stop-sampler").resolve())],
                creationflags=subprocess.CREATE_NO_WINDOW)
        # Warmups use the same endpoint but remain separate from measured pass statistics.
        warmup = [request(args, selected[0], 0, 1, -1) for _ in range(args.warmups)]
        (output / "warmup.json").write_text(json.dumps(warmup, indent=2), encoding="utf-8")
        with (output / "requests.jsonl").open("w", encoding="utf-8") as log:
            for iteration in range(args.passes):
                jobs = [(c, context) for c in selected for context in args.context_chars]
                rng.shuffle(jobs)
                for case, context in jobs:
                    row = request(args, case, context, 1, iteration)
                    rows.append(row)
                    log.write(json.dumps(row, ensure_ascii=False) + "\n")
                    log.flush()
                if args.concurrency:
                    radio = next(c for c in cases if c["id"] == "lmu-fuel-es")
                    strategy = next(c for c in cases if c["id"] == "fuel-finish-en")
                    for context in args.context_chars:
                        barrier = threading.Barrier(2)
                        with ThreadPoolExecutor(max_workers=2) as pool:
                            futures = [pool.submit(request, args, c, context, 2, iteration, barrier)
                                       for c in (radio, strategy)]
                            for future in futures:
                                row = future.result()
                                rows.append(row)
                                log.write(json.dumps(row, ensure_ascii=False) + "\n")
                        log.flush()
    except Exception as exc:
        run_error = {"type": type(exc).__name__, "message": "Run incomplete; inspect incremental request log"}
    finally:
        stop.set()
        if sampler:
            sampler.join(timeout=5)
        if monitor:
            (output / "stop-sampler").touch()
            try:
                monitor.wait(timeout=8)
            except subprocess.TimeoutExpired:
                monitor.terminate()
                monitor.wait(timeout=5)
            metadata["resource_sampler_exit_code"] = monitor.returncode
    metadata["ended_utc"] = datetime.now(timezone.utc).isoformat()
    metadata["run_error"] = run_error
    report = {"metadata": metadata, "summary": summarize(rows), "requests": rows,
              "resources": resource_summary(output / "resources.jsonl", rows),
              "engine_metrics": engine_metrics_summary(output / "engine-metrics.jsonl",
                strict_json(Path(args.metrics_fields).read_text(encoding="utf-8")) if args.metrics_fields else {}, rows)}
    (output / "results.json").write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    (output / "report.md").write_text(markdown([report]), encoding="utf-8")
    print(json.dumps({"output": str(output), "attempts": len(rows),
                      "errors": sum(bool(r["error"]) for r in rows)}))
    if run_error:
        raise RuntimeError("Run incomplete; partial results saved")


def validate_comparison(reports):
    """Reject mismatched test protocols; model/engine/quantisation may differ by design."""
    first = reports[0]
    fields = ("mode", "seed", "temperature", "passes", "warmups", "context_chars", "concurrency", "case", "protocol_revision")
    expected = {key: first["metadata"].get(key) for key in fields}
    expected_sources = first["metadata"].get("source_sha256")
    expected_groups = {(r["case_id"], r["context_chars"], r["concurrency"], r["attempts"])
                       for r in first["summary"]}
    for report in reports:
        if report["metadata"].get("run_error"):
            raise ValueError("Cannot compare an incomplete run")
        if {key: report["metadata"].get(key) for key in fields} != expected:
            raise ValueError("Comparison protocols differ (mode/seed/passes/context/concurrency/filter)")
        if report["metadata"].get("source_sha256") != expected_sources:
            raise ValueError("Comparison benchmark source fingerprints differ")
        if report["metadata"].get("corpus_sha256") != first["metadata"].get("corpus_sha256"):
            raise ValueError("Comparison telemetry corpus fingerprints differ")
        if not report["metadata"].get("model"):
            raise ValueError("Comparison model ID is missing")
        if {(r["case_id"], r["context_chars"], r["concurrency"], r["attempts"])
                for r in report["summary"]} != expected_groups:
            raise ValueError("Comparison cases/cohorts/attempts differ")


def rescore_report(report_path, cases_path, output_path):
    """Write derived evaluation only; frozen source reports and prompts stay unchanged."""
    source, frozen, output = map(Path, (report_path, cases_path, output_path))
    if output.resolve() in (source.resolve(), frozen.resolve()):
        raise ValueError("Rescore output must differ from the source report and frozen cases")
    report_bytes, case_bytes = source.read_bytes(), frozen.read_bytes()
    report = strict_json(report_bytes)
    cases = {case["id"]: case for case in strict_json(case_bytes)}
    for row in report["requests"]:
        row["quality_v2"] = score_v2(cases[row["case_id"]], row, strict_json, same)
    report["summary"] = summarize(report["requests"])
    report["metadata"]["offline_rescore"] = {
        "source_report": str(source.resolve()), "source_report_sha256": hashlib.sha256(report_bytes).hexdigest(),
        "frozen_cases_sha256": hashlib.sha256(case_bytes).hexdigest(),
        "evaluator_sha256": hashlib.sha256(Path(__file__).with_name("evaluator_v2.py").read_bytes()).hexdigest(),
        "source_prompt_changed": False, "latencies_remeasured": False,
        "note": "Task/enum prompt changes require a new run; semantic projection is not counterfactual inference.",
    }
    with output.open("x", encoding="utf-8") as stream:
        json.dump(report, stream, ensure_ascii=False, indent=2)
    return report


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    sub = parser.add_subparsers(dest="command", required=True)
    command = sub.add_parser("run")
    command.add_argument("--base-url", required=True)
    command.add_argument("--model", required=True)
    command.add_argument("--label", required=True)
    command.add_argument("--output", required=True)
    command.add_argument("--mode", choices=["mock", "real"], default="real")
    command.add_argument("--quiet-window", help="Orchestrator window/reference; not automatic permission")
    command.add_argument("--passes", type=int, default=5)
    command.add_argument("--warmups", type=int, default=1)
    command.add_argument("--context-chars", type=int, nargs="+", default=[0, 4096, 16384])
    command.add_argument("--case", action="append", help="Exact case ID; repeat to filter")
    command.add_argument("--concurrency", action="store_true")
    command.add_argument("--seed", type=int, default=124)
    command.add_argument("--temperature", type=float, default=0)
    command.add_argument("--timeout", type=float, default=30)
    command.add_argument("--metrics-url", help="Optional HTTP JSON metrics, sampled at 1 Hz")
    command.add_argument("--metrics-format", choices=["json", "prometheus"], default="json")
    command.add_argument("--metrics-fields", help="JSON mapping canonical byte/ns metric names to JSON pointers")
    command.add_argument("--engine-pid", type=int)
    command.add_argument("--model-metadata", help="JSON engine/config/revision/quantization/load metadata")
    command.add_argument("--model-path", help="Model artifact directory for disk size; no contents read")
    compare = sub.add_parser("compare")
    compare.add_argument("reports", nargs="+")
    compare.add_argument("--output", required=True)
    rescore = sub.add_parser("rescore", help="Offline v2 column over a frozen report; no endpoint calls")
    rescore.add_argument("report")
    rescore.add_argument("--cases", required=True, help="Frozen cases.json from that source run")
    rescore.add_argument("--output", required=True, help="New output JSON; existing files are never overwritten")
    args = parser.parse_args(argv)
    if args.command == "run":
        if any(c < 0 for c in args.context_chars) or args.warmups < 0 or args.timeout <= 0:
            parser.error("Invalid context/warmup/timeout")
        run(args)
    elif args.command == "rescore":
        report = rescore_report(args.report, args.cases, args.output)
        print(json.dumps({"output": args.output, "requests": len(report["requests"]), "offline": True}))
    else:
        reports = [strict_json(Path(p).read_text(encoding="utf-8")) for p in args.reports]
        validate_comparison(reports)
        Path(args.output).write_text(markdown(reports), encoding="utf-8")
        Path(args.output).with_suffix(".json").write_text(json.dumps(
            [{key: value for key, value in r.items() if key != "requests"} for r in reports],
            ensure_ascii=False, indent=2), encoding="utf-8")


if __name__ == "__main__":
    main()
