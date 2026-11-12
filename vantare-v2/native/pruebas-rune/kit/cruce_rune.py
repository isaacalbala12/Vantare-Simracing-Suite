"""Cruce estricto encoded/PresentMon; no sustituye la prueba física de Windows.

Rune presenta sincrónicamente después del compositor del overlay. Se exige
un único Present entre marcas encoded consecutivas, una sola cadena, y reloj
común. No se escoge el Present más cercano para ocultar una ambigüedad.
"""
import math


def first_display(mapping):
    """Una latencia por foto y ventana: primera imagen realmente mostrada."""
    first = {}
    for row in mapping:
        latency = row.get("latency_ms")
        if latency is None:
            continue
        if not math.isfinite(latency) or latency < 0:
            raise ValueError("Latencia no valida")
        key = (row["epoch"], row["sequence"], row["window"])
        if key not in first or latency < first[key]["latency_ms"]:
            first[key] = row
    return list(first.values())


def cross_encoded(origins, encoded, presents, frequency, start_qpc, end_qpc):
    """Recibe PM normalizado y filtrado al PID declarado, sin recortar encoded.

    La traza debe incluir la siguiente marca tras cada frame analizado, también
    después del fin del intervalo. Se guardan todos los cruces, incluidos
    descartados y repeticiones; first_display se usa solo para la distribución
    de latencia. Los FPS y descartes se calculan con todos los frames originales.
    """
    if frequency <= 0 or not 0 < start_qpc < end_qpc:
        raise ValueError("Reloj o intervalo no valido")
    source = {}
    for row in origins:
        if row["phase"] != "origin":
            continue
        key = (row["epoch"], row["sequence"])
        if key in source or row["qpc"] <= 0:
            raise ValueError("Origen repetido o sin reloj")
        source[key] = row["qpc"]
    stamps = [row for row in encoded if row["phase"] == "encoded"]
    if not source or len(stamps) < 2:
        raise ValueError("Faltan origenes o marcas de cierre")
    if len({row["window"] for row in stamps}) != 1:
        raise ValueError("Se exige una unica ventana overlay")
    if any(a["qpc"] >= b["qpc"] for a, b in zip(stamps, stamps[1:])):
        raise ValueError("Marcas encoded repetidas o desordenadas")
    if any(a["submit_qpc"] >= b["submit_qpc"] for a, b in zip(presents, presents[1:])):
        raise ValueError("Present repetido o desordenado")
    frames, used = [], set()
    active = False
    cursor = 0
    for index, stamp in enumerate(stamps):
        qpc = stamp["qpc"]
        if not start_qpc <= qpc < end_qpc:
            continue
        key = (stamp["epoch"], stamp["sequence"])
        if key not in source:
            if active:
                raise ValueError("Reaparece una foto ajena al replay medido")
            # La ventana puede seguir mostrando la ultima foto de calentamiento
            # antes de recibir la primera del nuevo epoch. No inventar origen.
            continue
        active = True
        if index + 1 == len(stamps):
            raise ValueError("Falta marca encoded posterior para cerrar el cruce")
        next_qpc = stamps[index + 1]["qpc"]
        while cursor < len(presents) and presents[cursor]["submit_qpc"] < qpc:
            cursor += 1
        begin = cursor
        while cursor < len(presents) and presents[cursor]["submit_qpc"] < next_qpc:
            cursor += 1
        if cursor - begin != 1:
            raise ValueError("Cruce no biyectivo: falta Present o hay varios")
        present = presents[begin]
        if begin in used:
            raise ValueError("Present ya atribuido")
        used.add(begin)
        display = present["display_qpc"]
        if source[key] > qpc or (display is not None and display < present["submit_qpc"]):
            raise ValueError("Relojes incompatibles")
        frames.append({"epoch": key[0], "sequence": key[1], "window": stamp["window"],
                       "chain": present["chain"], "encoded_qpc": qpc,
                       "submit_qpc": present["submit_qpc"], "display_qpc": display,
                       "latency_ms": None if display is None else
                       (display - source[key]) * 1000 / frequency})
    if not frames or len({row["chain"] for row in frames}) != 1:
        raise ValueError("Sin cruce verificable de una sola cadena")
    shown = first_display(frames)
    if not shown:
        raise ValueError("Ninguna foto realmente mostrada")
    return {"frames": frames, "first_display": shown}
