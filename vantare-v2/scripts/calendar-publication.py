"""Prepare the existing owner RPC from a reviewed Discord inbox, never publish."""
import argparse
import datetime as dt
import hashlib
import json
from pathlib import Path


def prepare(inbox, message_id, now):
    if inbox.get("version") != 1:
        raise ValueError("Versión de bandeja no soportada")
    matches = [c for c in inbox["candidates"] if c["messageId"] == message_id]
    if len(matches) != 1:
        raise ValueError("Selecciona un único mensaje revisado")
    candidate = matches[0]
    if (candidate["guildId"], candidate["channelId"]) != (
        "731597245992009768", "1529245213598552134"
    ):
        raise ValueError("Fuente fuera del servidor/canal LMU configurado")
    source = candidate["sourceText"]
    if not source.strip() or hashlib.sha256(source.encode()).hexdigest() != candidate["sourceHash"]:
        raise ValueError("Texto de origen alterado")
    schedule = candidate["schedule"]
    if schedule.get("version") != 1 or schedule.get("timezone") != "UTC":
        raise ValueError("Horario incompatible")
    start = dt.datetime.fromisoformat(schedule["validFrom"].replace("Z", "+00:00"))
    end = dt.datetime.fromisoformat(schedule["validUntil"].replace("Z", "+00:00"))
    if not start <= now < end:
        raise ValueError("Horario caducado o futuro; no trasladar fechas para publicar")
    series = schedule["series"]
    if not 1 <= len(series) <= 256 or len({s["id"] for s in series}) != len(series):
        raise ValueError("Series ausentes, duplicadas o demasiadas")
    if len(json.dumps(schedule, ensure_ascii=False).encode()) > 48 * 1024:
        raise ValueError("Horario supera el presupuesto IPC")
    return {
        "p_source_text": source, "p_schedule": schedule,
        "p_valid_from": schedule["validFrom"], "p_series_count": len(series),
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--inbox", required=True, type=Path)
    parser.add_argument("--message-id", required=True)
    parser.add_argument("--output", required=True, type=Path)
    args = parser.parse_args()
    try:
        payload = prepare(json.loads(args.inbox.read_text(encoding="utf-8-sig")),
                          args.message_id, dt.datetime.now(dt.timezone.utc))
        args.output.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    except (ValueError, KeyError, TypeError, OSError):
        parser.exit(1, "No se preparó el borrador: revisa fuente, vigencia y contrato de bandeja.\n")
    print("Borrador local preparado; no se ha llamado a Supabase.")


if __name__ == "__main__":
    main()
