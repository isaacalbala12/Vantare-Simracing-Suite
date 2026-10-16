"""Prepare public Plane JSON or restricted SQL. This CLI never writes remotely."""
import argparse
import json
import os
from pathlib import Path
from plane_roadmap import Plane, SyncError, document, fetch


def publication_sql(document):
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
    parser.add_argument('--fixture', type=Path, help='Offline validation only; cannot produce SQL')
    parser.add_argument('--sql-output', type=Path)
    parser.add_argument('--output', type=Path, required=True)
    args = parser.parse_args()
    try:
        if args.fixture and args.sql_output:
            raise SyncError('Fixture no publicable')
        snapshot = json.loads(args.fixture.read_text(encoding='utf-8-sig')) if args.fixture else fetch(
            Plane(os.environ.get('PLANE_URL', ''), os.environ.get('PLANE_API_KEY', '')),
            os.environ.get('PLANE_WORKSPACE', ''), os.environ.get('PLANE_PROJECT_ID', ''))
        result = document(snapshot)
        args.output.write_text(json.dumps(result, ensure_ascii=False), encoding='utf-8')
        if args.sql_output:
            args.sql_output.write_text(publication_sql(result), encoding='utf-8')
        print(f"Roadmap preparado: {len(result['items'])} tareas; sin escritura remota")
    except SyncError as error:
        parser.exit(1, f'{error}\n')
    except (OSError, ValueError, KeyError, TypeError):
        parser.exit(1, 'Roadmap rechazado: revisar fuente, configuración y límites.\n')


if __name__ == '__main__':
    main()
