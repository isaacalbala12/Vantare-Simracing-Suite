"""Read ClickUp Vantare/Desarrollo and prepare a Supabase roadmap publication.

Default: local output only. --publish executes reviewed SQL through psql.
CLICKUP_API_TOKEN is used only in the Authorization header, never logged.
"""
import argparse
import hashlib
import json
import os
from pathlib import Path
import subprocess
import unicodedata
import urllib.error
import urllib.parse
import urllib.request
import uuid

STATUS = {"idea": "later", "en progreso": "now", "por revisar": "now",
          "testers": "next", "complete": "done"}
NAMESPACE = uuid.UUID("78c38d96-f693-5707-86f7-b30dde54b0ee")


class SyncError(ValueError):
    """Actionable, sanitized error produced by this tool only."""


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        raise SyncError("Redirección ClickUp rechazada")


def normalized(text):
    return " ".join(unicodedata.normalize("NFKC", text).casefold().split())


def one_named(rows, name):
    matches = [row for row in rows if normalized(row["name"]) == normalized(name)]
    if len(matches) != 1:
        raise SyncError("Nombre ausente o ambiguo: " + name)
    return matches[0]


class ClickUp:
    def __init__(self, token):
        if not token.strip():
            raise SyncError("Falta CLICKUP_API_TOKEN")
        self.token = token

    def get(self, path, **query):
        url = "https://api.clickup.com/api/v2/" + path
        if query:
            url += "?" + urllib.parse.urlencode(query)
        request = urllib.request.Request(url, headers={"Authorization": self.token})
        try:
            with urllib.request.build_opener(NoRedirect).open(request, timeout=30) as response:
                raw = response.read(4 * 1024 * 1024 + 1)
            if len(raw) > 4 * 1024 * 1024:
                raise SyncError("Respuesta ClickUp demasiado grande")
            return json.loads(raw)
        except urllib.error.HTTPError as error:
            # No response bodies, request headers, tokens or private task details.
            raise SyncError(f"ClickUp HTTP {error.code}; no se publicará") from None
        except (urllib.error.URLError, TimeoutError):
            raise SyncError("ClickUp no disponible; no se publicará") from None


def fetch(api, workspace_id):
    # Validate workspace membership, then resolve the exact Space and List.
    teams = api.get("team")["teams"]
    if not any(str(team["id"]) == workspace_id for team in teams):
        raise SyncError("Workspace no accesible")
    space = one_named(api.get(f"team/{workspace_id}/space", archived="false")["spaces"], "Vantare")
    space_id = str(space["id"])
    lists = api.get(f"space/{space_id}/list", archived="false")["lists"]
    for folder in api.get(f"space/{space_id}/folder", archived="false")["folders"]:
        lists += api.get(f"folder/{folder['id']}/list", archived="false")["lists"]
    development = one_named(lists, "Desarrollo")
    list_id = str(development["id"])
    tasks = []
    seen = set()
    for page in range(100):
        result = api.get(f"list/{list_id}/task", page=page, subtasks="true",
                         include_closed="true", include_timl="true", archived="false")
        batch = result["tasks"]
        if not batch:
            break
        for task in batch:
            if str(task["id"]) in seen:
                raise SyncError("Paginación duplicada/inestable; vuelve a consultar")
            seen.add(str(task["id"]))
        tasks.extend(batch)
        if result.get("last_page") is True:
            break
    else:
        raise SyncError("Consulta supera 100 páginas; no se publicará parcialmente")
    return {"workspaceId": workspace_id, "space": {"id": space_id, "name": space["name"]},
            "list": {"id": list_id, "name": development["name"]}, "tasks": tasks}


def document(snapshot):
    if normalized(snapshot["space"]["name"]) != "vantare" or normalized(snapshot["list"]["name"]) != "desarrollo":
        raise SyncError("Fuente fuera de Vantare/Desarrollo")
    tasks = snapshot["tasks"]
    if not tasks or len(tasks) > 40:
        raise SyncError("Publicación vacía o más de 40 tareas; requiere decisión, no truncar")
    by_id = {str(task["id"]): task for task in tasks}
    if len(by_id) != len(tasks):
        raise SyncError("IDs ClickUp duplicados")
    items = []
    # Preserve API order; parent links are explicit, not inferred from task title.
    for task in tasks:
        status = normalized(task["status"]["status"])
        if status not in STATUS:
            raise SyncError("Estado ClickUp desconocido; revisa el mapeo")
        name = task["name"].strip()
        if not name:
            raise SyncError("Tarea sin nombre")
        path = []
        parent = task.get("parent")
        visited = {str(task["id"])}
        while parent:
            parent = str(parent)
            if parent in visited or parent not in by_id:
                raise SyncError("Subtarea con ciclo o padre ausente")
            visited.add(parent)
            ancestor = by_id[parent]
            path.insert(0, ancestor["name"].strip())
            parent = ancestor.get("parent")
        # The existing public contract has no hierarchy fields. Preserve ancestry
        # and the exact source state as visible text, without inventing progress.
        body = f"Estado: {task['status']['status'].strip()}"
        if path:
            body += "\nSubtarea de: " + " → ".join(path)
        if len(name) > 120 or len(body) > 600 or "\0" in name + body:
            raise SyncError("Texto supera contrato público; editar en ClickUp antes de publicar")
        localized = lambda text: {"es": text, "en": "", "pt": "", "it": ""}
        items.append({"id": str(uuid.uuid5(NAMESPACE, "clickup:" + str(task["id"]))),
                      "section": STATUS[status], "title": localized(name), "body": localized(body)})
    doc = {"schemaVersion": 1, "items": items}
    if len(json.dumps(doc, ensure_ascii=False).encode()) > 40000:
        raise SyncError("Documento supera 40000 bytes")
    return doc


def publication_sql(doc, expected):
    # Expected UUID prevents overwriting a publication changed after human review.
    if expected != "none":
        expected = str(uuid.UUID(expected))
    value = json.dumps(doc, ensure_ascii=False).replace("'", "''")
    match = "null" if expected == "none" else "'" + expected + "'::uuid"
    return f"""begin;
set local standard_conforming_strings = on;
lock table public.visual_roadmap in exclusive mode;
do $guard$
begin
  if (select id from public.visual_roadmap_current()) is distinct from {match} then
    raise exception 'Roadmap changed since review; abort';
  end if;
end
$guard$;
-- Existing publisher validates the document and supersedes atomically.
select public.visual_roadmap_publish('{value}'::jsonb) as publication_id;
select id, document, published_at from public.visual_roadmap_current();
commit;
"""


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    source = parser.add_mutually_exclusive_group(required=True)
    source.add_argument("--fixture", type=Path)
    source.add_argument("--workspace-id")
    parser.add_argument("--output-dir", type=Path, required=True)
    parser.add_argument("--expected-publication", required=True, help="Current UUID or none")
    parser.add_argument("--publish", action="store_true", help="Requires Isaac's authorization and privileged psql environment")
    parser.add_argument("--approved-sql-sha256", help="Digest of the exact SQL reviewed by Isaac")
    parser.add_argument("--expected-db-host", help="Approved libpq PGHOST destination")
    parser.add_argument("--expected-db-user", help="Approved libpq PGUSER (poolers share a host)")
    args = parser.parse_args()
    try:
        snapshot = (json.loads(args.fixture.read_text(encoding="utf-8-sig")) if args.fixture
                    else fetch(ClickUp(os.environ.get("CLICKUP_API_TOKEN", "")), args.workspace_id))
        doc = document(snapshot)
        sql = publication_sql(doc, args.expected_publication)
        args.output_dir.mkdir(parents=True, exist_ok=True)
        args.output_dir.joinpath("roadmap.json").write_text(json.dumps(doc, ensure_ascii=False, indent=2), encoding="utf-8")
        args.output_dir.joinpath("publish.sql").write_text(sql, encoding="utf-8")
        digest = hashlib.sha256(sql.encode()).hexdigest()
        print(f"Preparado: {len(doc['items'])} hitos; SQL SHA256 {digest}")
        if args.publish:
            if args.fixture:
                raise SyncError("Los fixtures nunca se publican")
            if (args.approved_sql_sha256 != digest or not args.expected_db_host
                    or os.environ.get("PGHOST") != args.expected_db_host
                    or not args.expected_db_user or os.environ.get("PGUSER") != args.expected_db_user):
                raise SyncError("SQL o destino no coincide con la revisión aprobada")
            # libpq reads PG* from the environment; no connection secrets in argv.
            result = subprocess.run(["psql", "-X", "--host", args.expected_db_host,
                                     "--username", args.expected_db_user, "-v", "ON_ERROR_STOP=1"], input=sql,
                                    encoding="utf-8", capture_output=True, check=False)
            if result.returncode:
                raise SyncError("SQL rechazado; consulta estado remoto antes de reintentar")
            args.output_dir.joinpath("publication-receipt.txt").write_text(result.stdout, encoding="utf-8")
            print("Publicado; releer desde un cliente anon y verificar en Hub.")
    except SyncError as error:
        parser.exit(1, str(error) + "\n")
    except (ValueError, KeyError, TypeError, OSError):
        # Suppress arbitrary API/server contents, especially tokens and DB DSNs.
        parser.exit(1, "Sin publicación confirmada: revisa fuente, límites, mapeo, versión vigente y acceso; no reintentar a ciegas.\n")


if __name__ == "__main__":
    main()
