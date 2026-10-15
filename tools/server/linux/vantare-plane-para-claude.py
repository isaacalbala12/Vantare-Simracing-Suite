#!/usr/bin/env python3
"""Sondeo de eventos VANTA; BD de solo lectura, cola local y webhook privado."""

import argparse
from contextlib import nullcontext
from html.parser import HTMLParser
import json
import os
from pathlib import Path
import subprocess
import sys
from urllib import request

PROJECT = "89da40f4-ae2a-443d-9e3e-6024e01247c9"
ISAAC = "19bf758e-4733-42ef-9f29-dd418b0628ee"
ISAAC_EMAIL = "isaacalbala12@gmail.com"
STATE_FILE = "/var/lib/vantare/para-claude.json"
URL_FILE = "/etc/vantare/para-claude.url"
DB = "vantare-plane-plane-db-1"
USER_AGENT = "vantare-plane-para-claude/1"
VERSION = 2

# Leer todos los IDs evita perder una transacción que confirma tarde o varias
# transiciones dentro de un minuto. Una sola sentencia = una sola instantánea.
SQL = f"""
WITH events AS (
    SELECT 'state:' || a.id AS event_id, a.created_at, 'state' AS kind,
           a.issue_id, a.actor_id, a.old_value AS old_state,
           a.new_value AS new_state, '' AS comment_html,
           '' AS comment_text, false AS via_api, true AS ready
    FROM issue_activities a
    WHERE a.project_id = '{PROJECT}' AND a.deleted_at IS NULL
      AND a.field = 'state' AND a.verb = 'updated'
    UNION ALL
    -- Crear directamente en Para Claude también era una entrada en el sondeo v1.
    -- Si ya cambió después, la primera transición conserva el estado inicial.
    SELECT 'created:' || a.id, a.created_at, 'state', a.issue_id,
           a.actor_id, NULL, coalesce(first_change.old_value, s.name),
           '', '', false, true
    FROM issue_activities a
    JOIN issues ci ON ci.id = a.issue_id
    LEFT JOIN states s ON s.id = ci.state_id
    LEFT JOIN LATERAL (
        SELECT h.old_value FROM issue_activities h
        WHERE h.issue_id = a.issue_id AND h.field = 'state'
          AND h.verb = 'updated' AND h.deleted_at IS NULL
        ORDER BY h.created_at, h.id LIMIT 1
    ) first_change ON true
    WHERE a.project_id = '{PROJECT}' AND a.deleted_at IS NULL
      AND coalesce(a.field, '') = '' AND a.verb = 'created'
    UNION ALL
    SELECT 'comment:' || c.id, c.created_at, 'comment', c.issue_id,
           c.actor_id, s.name, s.name, c.comment_html, c.comment_stripped,
           EXISTS (SELECT 1 FROM api_activity_logs l
                   WHERE l.method = 'POST' AND l.response_code BETWEEN 200 AND 299
                     AND l.path LIKE '%/comments/'
                     AND l.response_body::jsonb ->> 'id' = c.id::text),
           c.created_at <= statement_timestamp() - interval '2 minutes'
    FROM issue_comments c
    JOIN issues ci ON ci.id = c.issue_id
    LEFT JOIN states s ON s.id = ci.state_id
    WHERE c.project_id = '{PROJECT}' AND c.deleted_at IS NULL
)
SELECT coalesce(json_agg(row_to_json(e) ORDER BY e.created_at, e.event_id), '[]')
FROM (
    SELECT e.*, i.id, i.sequence_id AS seq, i.name, p.identifier AS key,
           (i.deleted_at IS NULL AND i.archived_at IS NULL AND NOT i.is_draft) AS eligible,
           u.email AS author_email, coalesce(u.is_bot, false) AS author_bot,
           coalesce(nullif(u.display_name, ''),
                    nullif(trim(concat_ws(' ', u.first_name, u.last_name)), ''),
                    u.username, '') AS author
    FROM events e
    JOIN issues i ON i.id = e.issue_id
    JOIN projects p ON p.id = i.project_id
    LEFT JOIN users u ON u.id = e.actor_id
    WHERE i.project_id = '{PROJECT}' AND p.identifier = 'VANTA'
) e;
"""


def current():
    result = subprocess.run(
        ["docker", "exec", "-i", "-e", "PGOPTIONS=-c default_transaction_read_only=on",
         DB, "sh", "-c",
         'psql -h /var/run/postgresql -w -X -q -At -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB"'],
        input=SQL, capture_output=True, text=True, timeout=30, check=True)
    return json.loads(result.stdout)


class Text(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.parts = []
        self.hidden = 0

    def handle_starttag(self, tag, attrs):
        if tag in ("script", "style"):
            self.hidden += 1
        if tag in ("p", "div", "br", "li"):
            self.parts.append(" ")

    def handle_endtag(self, tag):
        if tag in ("script", "style") and self.hidden:
            self.hidden -= 1
        if tag in ("p", "div", "li"):
            self.parts.append(" ")

    def handle_data(self, data):
        if not self.hidden:
            self.parts.append(data)


def plain_text(row):
    if row.get("comment_html"):
        parser = Text()
        parser.feed(row["comment_html"])
        text = "".join(parser.parts)
    else:
        text = row.get("comment_text") or ""
    return " ".join(text.split())[:1500]


def payload(row):
    # Recordar también IDs de tareas ocultas evita recuperar avisos históricos
    # al desarchivarlas/restaurarlas. Solo las activas pueden producir payload.
    if not row.get("eligible", True):
        return None
    old, new = row.get("old_state"), row.get("new_state")
    comment = ""
    if row["kind"] == "comment":
        comment = plain_text(row)
        if (row.get("actor_id") != ISAAC
                or (row.get("author_email") or "").casefold() != ISAAC_EMAIL
                or row.get("author_bot") or row.get("via_api")
                or comment.casefold().startswith("[orquestador]")):
            return None
        event = "comentario"
    elif row["kind"] == "state":
        if old == new:
            return None
        event = {"Para Claude": "para_claude", "Entregado": "entregado",
                 "Cancelado": "cancelado"}.get(new)
        if old == "Por testear" and new == "En curso":
            event = "devuelta"
        if event is None:
            return None
    else:
        return None
    return {"tarea": f"{row['key']}-{row['seq']}", "nombre": row["name"],
            "id": row["id"], "evento": event, "estado_anterior": old,
            "estado_nuevo": new, "autor": row.get("author") or "",
            "comentario": comment}


def seed(records):
    return {"version": VERSION,
            "observed": sorted({r["event_id"] for r in records}), "pending": []}


def collect(state, records):
    observed = set(state["observed"])
    pending = list(state["pending"])
    for row in records:
        event_id = row["event_id"]
        if event_id in observed:
            continue
        body = payload(row)
        # Los logs de API se escriben en segundo plano. No clasificar aún los
        # comentarios sin firma: volver a consultarlos en la siguiente pasada.
        if body is not None and row["kind"] == "comment" and not row["ready"]:
            continue
        observed.add(event_id)
        if body is not None:
            pending.append({"event_id": event_id, "payload": body})
    return {"version": VERSION, "observed": sorted(observed), "pending": pending}


def save(state, path):
    path.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
    tmp = path.with_suffix(path.suffix + ".tmp")
    fd = os.open(tmp, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
    with os.fdopen(fd, "w", encoding="utf-8") as stream:
        json.dump(state, stream, ensure_ascii=False)
        stream.flush()
        os.fsync(stream.fileno())
    os.replace(tmp, path)


class NoRedirect(request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


def post(url, body, event_id=None):
    headers = {"Content-Type": "application/json", "User-Agent": USER_AGENT}
    if event_id:
        headers["Idempotency-Key"] = event_id
    req = request.Request(url, json.dumps(body).encode("utf-8"), headers, method="POST")
    with request.build_opener(NoRedirect()).open(req, timeout=20) as response:
        if not 200 <= response.status < 300:
            raise RuntimeError("HTTP no satisfactorio")
        return response.status


def run(records, path, dry=False, reset=False, sender=post, url_file=URL_FILE):
    state = json.loads(path.read_text(encoding="utf-8")) if path.exists() else None
    if state is not None and not isinstance(state, list):
        if not isinstance(state, dict) or state.get("version") != VERSION:
            raise ValueError("Formato de estado desconocido")
    # El formato v1 era una lista de tareas en Para Claude: migración sin avisos.
    if reset or state is None or isinstance(state, list):
        state = seed(records)
        if not dry:
            save(state, path)
        print(f"estado inicial: {len(records)} registros, sin avisos" + (" (dry-run)" if dry else ""))
        return 0
    state = collect(state, records)
    if dry:
        for item in state["pending"]:
            print(json.dumps(item["payload"], ensure_ascii=False))
        print(f"dry-run: {len(state['pending'])} avisos pendientes; sin enviar ni guardar")
        return 0
    # Persistir la cola antes del POST: no perder eventos si cambian o se borran.
    save(state, path)
    url = Path(url_file).read_text(encoding="utf-8").strip() if state["pending"] else None
    failures = 0
    for item in list(state["pending"]):
        body = item["payload"]
        try:
            code = sender(url, body, item["event_id"])
            if not 200 <= code < 300:
                raise RuntimeError("HTTP no satisfactorio")
        except Exception as exc:
            # Nunca imprimir str(exc): urllib puede incluir la URL privada.
            print(f"aviso fallido {body['tarea']} {body['evento']} {type(exc).__name__}")
            failures += 1
            continue
        state["pending"].remove(item)
        save(state, path)
        print(f"aviso enviado {body['tarea']} {body['evento']} http={code}")
    return 1 if failures else 0


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--seed", action="store_true", help="Sembrar IDs actuales sin avisar; reinicia la cola")
    args = parser.parse_args(argv)
    path = Path(STATE_FILE)
    try:
        path.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
        # systemd serializa su servicio; el lock también cubre ejecuciones manuales.
        with (nullcontext() if args.dry_run else path.with_suffix(".lock").open("a")) as lock:
            if lock is not None:
                import fcntl
                fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
            return run(current(), path, dry=args.dry_run, reset=args.seed)
    except BlockingIOError:
        print("otra pasada en curso; sin cambios")
        return 0
    except Exception as exc:
        print(f"vigilante fallido: {type(exc).__name__}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    sys.exit(main())
