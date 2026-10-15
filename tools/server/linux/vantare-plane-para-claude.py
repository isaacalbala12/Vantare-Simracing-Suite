#!/usr/bin/env python3
# Cada 60 s dentro de vantare-svc: avisa (POST JSON) de las tareas que ENTRAN en «Para Claude».
# Sustituye al webhook de Plane, que enviaba todos los cambios. La URL vive en URL_FILE (600), nunca aquí ni en logs.
# Estado: ids ya avisados que siguen en el estado; si una tarea sale y vuelve, se avisa de nuevo.
# Primera ejecución: guarda el estado sin avisar. --dry-run: lista lo que avisaría, sin enviar ni guardar.
import json, os, subprocess, sys, urllib.request

PROJECT = "89da40f4-ae2a-443d-9e3e-6024e01247c9"
STATE_NAME = "Para Claude"
STATE_FILE = "/var/lib/vantare/para-claude.json"
URL_FILE = "/etc/vantare/para-claude.url"
DB = "vantare-plane-plane-db-1"
SQL = f"""SELECT coalesce(json_agg(json_build_object('id', i.id, 'seq', i.sequence_id, 'name', i.name, 'key', p.identifier)), '[]')
FROM issues i JOIN states s ON s.id = i.state_id JOIN projects p ON p.id = i.project_id
WHERE i.project_id = '{PROJECT}' AND s.name = '{STATE_NAME}' AND i.deleted_at IS NULL AND s.deleted_at IS NULL
  AND i.archived_at IS NULL AND i.is_draft = false"""


def current():
    out = subprocess.run(
        ["docker", "exec", "-i", "-e", "PGOPTIONS=-c default_transaction_read_only=on", DB, "sh", "-c",
         'psql -h /var/run/postgresql -w -X -q -At -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB"'],
        input=SQL, capture_output=True, text=True, timeout=30, check=True).stdout
    return {t["id"]: t for t in json.loads(out)}


def post(url, t):
    body = json.dumps({"tarea": f"{t['key']}-{t['seq']}", "nombre": t["name"], "id": t["id"]}).encode()
    # Cloudflare (relay) responde 403 al User-Agent por defecto de urllib
    headers = {"Content-Type": "application/json", "User-Agent": "vantare-plane-para-claude/1"}
    req = urllib.request.Request(url, body, headers, method="POST")
    with urllib.request.urlopen(req, timeout=20) as r:
        return r.status


def main():
    dry = "--dry-run" in sys.argv
    now = current()
    if not os.path.exists(STATE_FILE):
        if dry:
            print(f"sin estado: la primera ejecución guardaría {len(now)} tareas sin avisar")
            return
        save(set(now))
        print(f"estado inicial: {len(now)} tareas en {STATE_NAME}, sin avisos")
        return
    with open(STATE_FILE) as f:
        seen = set(json.load(f)) & set(now)  # las que salieron se olvidan
    new = [now[i] for i in now if i not in seen]
    if dry:
        for t in new:
            print(f"avisaría {t['key']}-{t['seq']} {t['name']}")
        return
    if new:
        with open(URL_FILE) as f:
            url = f.read().strip()
    for t in new:
        tag = f"{t['key']}-{t['seq']}"
        try:
            print(f"aviso enviado {tag} http={post(url, t)}")
            seen.add(t["id"])
        except Exception as e:  # reintenta en la siguiente pasada
            print(f"aviso fallido {tag} {type(e).__name__} {getattr(e, 'code', '')}".rstrip())
    save(seen)


def save(ids):
    os.makedirs(os.path.dirname(STATE_FILE), exist_ok=True)
    tmp = STATE_FILE + ".tmp"
    with open(tmp, "w") as f:
        json.dump(sorted(ids), f)
    os.replace(tmp, STATE_FILE)


if __name__ == "__main__":
    main()
