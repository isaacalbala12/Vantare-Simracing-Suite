"""Cruce QPC estricto. Envío a presentar no equivale a imagen mostrada."""
import csv
import io
import math


def read_trace(text):
    lines = text.splitlines()
    if len(lines) < 3 or not lines[0].startswith("# latency-v1,"):
        raise ValueError("traza sin cabecera")
    metadata = dict(value.split("=", 1) for value in lines[0].split(",")[1:])
    hz = int(metadata["frequency"])
    if hz <= 0 or int(metadata["overflow"]) != 0:
        raise ValueError("reloj inválido o desbordamiento")
    if not lines[-1].startswith("# end,rows="):
        raise ValueError("traza incompleta")
    rows = list(csv.DictReader(io.StringIO("\n".join(lines[1:-1]))))
    if len(rows) != int(lines[-1].split("=")[1]):
        raise ValueError("recuento incorrecto")
    for row in rows:
        for key in ("qpc", "epoch", "sequence", "window"):
            row[key] = int(row[key])
            if row[key] < 0:
                raise ValueError("identidad o reloj negativo")
        if row["qpc"] == 0:
            raise ValueError("QPC ausente")
    return hz, rows


def complete_replay(origin_rows, received_rows):
    def identities(rows, phase):
        result = [(row["epoch"], row["sequence"]) for row in rows if row["phase"] == phase]
        if not result or len(result) != len(set(result)):
            raise ValueError("fotos ausentes o repetidas")
        return result
    origin = identities(origin_rows, "origin")
    sent = identities(origin_rows, "sent")
    received = identities(received_rows, "received")
    if sent != received or not set(sent).issubset(origin):
        raise ValueError("fotos emitidas y recibidas distintas: ronda anulada")
    return len(sent)


def cross_display(origin_rows, submissions, presents, frequency, tolerance_ms=2.0):
    """PresentMon normalizado: submit_qpc, display_qpc, chain y process_id.

    La normalización conserva solo el PID declarado. No escoger un Present de
    otra cadena cuando los tiempos son ambiguos: ese cruce queda inválido.
    El PC debe conservar el CSV original y el mapeo utilizado.
    """
    if frequency <= 0 or not math.isfinite(tolerance_ms) or tolerance_ms <= 0:
        raise ValueError("reloj o tolerancia inválidos")
    origins = {(row["epoch"], row["sequence"]): row["qpc"] for row in origin_rows if row["phase"] == "origin"}
    remaining = list(enumerate(presents))
    used = set()
    mapping = []
    for stamp in sorted(submissions, key=lambda row: row["qpc"]):
        key = (stamp["epoch"], stamp["sequence"])
        if key not in origins:
            raise ValueError("foto sin origen")
        candidates = sorted((abs(present["submit_qpc"] - stamp["qpc"]), index, present)
                            for index, present in remaining if index not in used)
        if not candidates or candidates[0][0] * 1000 / frequency > tolerance_ms:
            raise ValueError("Present no encontrado")
        distance, index, present = candidates[0]
        if len(candidates) > 1 and (candidates[1][0] - distance) * 1000 / frequency < 0.05:
            raise ValueError("Present ambiguo: no atribuir latencia")
        used.add(index)
        # Una imagen descartada no obtiene una latencia inventada.
        display = present["display_qpc"]
        if display is None:
            continue
        if display < max(origins[key], stamp["qpc"]):
            raise ValueError("relojes incompatibles")
        mapping.append({"epoch": key[0], "sequence": key[1], "window": stamp["window"],
                        "chain": present["chain"], "latency_ms": (display - origins[key]) * 1000 / frequency,
                        "matching_error_ms": distance * 1000 / frequency})
    if not mapping:
        raise ValueError("ninguna foto mostrada verificable")
    return mapping
