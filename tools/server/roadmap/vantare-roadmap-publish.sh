#!/usr/bin/env bash
# Publicador del roadmap (#1535) fuera de GitHub Actions: mismos pasos que .github/workflows/clickup-roadmap.yml.
# Corre como usuario roadmap; secretos solo por EnvironmentFile (C:\VantareServer\secrets\roadmap.env, ACL Administradores+vantare-svc), nunca en logs.
set -euo pipefail
repo=$HOME/repo
export GIT_SSH_COMMAND="ssh -i $HOME/.ssh/vantare_deploy -o IdentitiesOnly=yes -o StrictHostKeyChecking=yes"
[ -d "$repo/.git" ] || git clone -q --no-checkout git@github.com:isaacalbala12/Vantare-Simracing-Suite.git "$repo"
cd "$repo"
git fetch -q --depth 1 origin "${ROADMAP_REF:-master}"
git checkout -q --detach FETCH_HEAD
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
python3 -m unittest -q discover -s vantare-v2/scripts -p 'test*roadmap*.py' 2>"$tmp/test.log" || { echo 'tests del roadmap fallan'; exit 1; }
CLICKUP_API_TOKEN="$CLICKUP_API_TOKEN" python3 vantare-v2/scripts/publish_clickup_roadmap.py --output "$tmp/roadmap.json"
python3 vantare-v2/scripts/publish_clickup_roadmap.py --sql-from "$tmp/roadmap.json" --output "$tmp/publish.sql"
export PGSSLMODE=verify-full PGSSLROOTCERT="$repo/.github/certs/supabase-prod-ca-2021.crt"
test -n "$PGHOST" && test -n "$PGUSER" && test -n "$PGPASSWORD"
python3 vantare-v2/scripts/verify_roadmap_tls.py --host "$PGHOST" --port "$PGPORT" --ca "$PGSSLROOTCERT"
if ! psql -X --no-password -q -v ON_ERROR_STOP=1 -f "$tmp/publish.sql" > /dev/null 2>&1; then
  echo 'Roadmap publication failed; inspect database before retrying.'; exit 1
fi
echo "roadmap publicado desde $(git rev-parse --short HEAD)"
