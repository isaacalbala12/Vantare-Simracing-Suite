"""Build the public ClickUp publication. No remote writes or private task fields."""
import argparse
import datetime as dt
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import re
import uuid

spec = importlib.util.spec_from_file_location("clickup_source", Path(__file__).with_name("clickup-roadmap.py"))
source = importlib.util.module_from_spec(spec)
spec.loader.exec_module(source)
WORKSPACE = "90151421613"


def publication(snapshot, published_at):
    if str(snapshot["workspaceId"]) != WORKSPACE:
        raise source.SyncError("Workspace incorrecto")
    # Keep the existing IDs, statuses, hierarchy validation and privacy allowlist.
    document = source.document(snapshot)
    document["schemaVersion"] = 2
    for item, task in zip(document["items"], snapshot["tasks"], strict=True):
        area, separator, _ = task["name"].partition(" · ")
        if not separator or not area.strip() or len(area.strip()) > 60:
            raise source.SyncError("Formato esperado: Tipo · Nombre")
        item["area"] = area.strip()
        versions = {tag["name"] for tag in task.get("tags", [])
                    if re.fullmatch(r"v?\d+\.\d+\.\d+(?:-[a-z0-9.-]+)?", tag["name"])}
        if len(versions) > 1:
            raise source.SyncError("Version ambigua")
        if any(len(version) > 60 for version in versions):
            raise source.SyncError("Version demasiado larga")
        item["version"] = next(iter(versions), None)
        due = task.get("due_date")
        item["dueDate"] = (dt.datetime.fromtimestamp(int(due) / 1000, dt.timezone.utc).date().isoformat()
                           if due is not None else None)
    canonical = json.dumps(document, ensure_ascii=False, sort_keys=True, separators=(",", ":"))
    if len(json.dumps(document, ensure_ascii=False).encode()) > 40000:
        raise source.SyncError("Documento demasiado grande")
    result = {"id": str(uuid.uuid5(source.NAMESPACE, hashlib.sha256(canonical.encode()).hexdigest())),
              "published_at": published_at, "document": document}
    if len(json.dumps(result, ensure_ascii=False).encode()) > 56 * 1024:
        raise source.SyncError("Publicacion demasiado grande")
    return result


def publication_sql(document):
    # Content-only idempotence and the existing publisher inside one table lock.
    value = json.dumps(document, ensure_ascii=False).replace("'", "''")
    return f"""begin;
set local standard_conforming_strings = on;
set local statement_timeout = '30s';
do $role_guard$
begin
  if current_user <> 'vantare_roadmap_publisher' then
    raise exception 'roadmap_requires_dedicated_role';
  end if;
end
$role_guard$;
select public.visual_roadmap_sync('{value}'::jsonb);
commit;
"""



def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--fixture", type=Path)
    parser.add_argument("--sql-from", type=Path)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    try:
        if args.sql_from:
            if args.fixture:
                raise source.SyncError("Fixture no publicable")
            result = json.loads(args.sql_from.read_text(encoding="utf-8"))
            args.output.write_text(publication_sql(result["document"]), encoding="utf-8")
            return
        snapshot = (json.loads(args.fixture.read_text(encoding="utf-8-sig")) if args.fixture else
                    source.fetch(source.ClickUp(os.environ.get("CLICKUP_API_TOKEN", "")), WORKSPACE))
        result = publication(snapshot, dt.datetime.now(dt.timezone.utc).isoformat())
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding="utf-8")
        print("Publicacion preparada; campos privados descartados")
    except (ValueError, KeyError, TypeError, OSError, OverflowError):
        parser.exit(1, "Publicacion rechazada: revisar fuente, formato, estados y limites.\n")


if __name__ == "__main__":
    main()
