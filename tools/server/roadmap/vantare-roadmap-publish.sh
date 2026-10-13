#!/usr/bin/env bash
# Inert until Isaac supplies EnvironmentFile, approves the SHA and starts the unit.
set -euo pipefail
umask 077
repo=${ROADMAP_REPO:-$HOME/repo}
: "${ROADMAP_REF:?Required approved commit SHA}"
[[ "$ROADMAP_REF" =~ ^[0-9a-f]{40}$ ]] || { echo 'ROADMAP_REF must be an approved full SHA'; exit 1; }
: "${PLANE_URL:?}" "${PLANE_WORKSPACE:?}" "${PLANE_PROJECT_ID:?}" "${PLANE_API_KEY:?}"
: "${PGHOST:?}" "${PGPORT:?}" "${PGDATABASE:?}" "${PGUSER:?}" "${PGPASSWORD:?}"
export GIT_SSH_COMMAND="ssh -i $HOME/.ssh/vantare_deploy -o IdentitiesOnly=yes -o StrictHostKeyChecking=yes"
[ -d "$repo/.git" ] || git clone -q --no-checkout git@github.com:isaacalbala12/Vantare-Simracing-Suite.git "$repo"
cd "$repo"
git fetch -q --depth 1 origin "$ROADMAP_REF"
git checkout -q --detach FETCH_HEAD
[ "$(git rev-parse HEAD)" = "$ROADMAP_REF" ] || { echo 'Unexpected publisher SHA'; exit 1; }
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT
env -u PLANE_API_KEY -u PGPASSWORD python3 -B -m unittest discover -s vantare-v2/scripts -p 'test*roadmap*.py' >"$tmp/tests.log" 2>&1 || { echo 'Roadmap offline tests failed'; exit 1; }
env -u PLANE_API_KEY -u PGPASSWORD node --test vantare-v2/scripts/test_roadmap_web.mjs >"$tmp/web-tests.log" 2>&1 || { echo 'Roadmap web tests failed'; exit 1; }
env -u PGPASSWORD python3 -B vantare-v2/scripts/publish_plane_roadmap.py --output "$tmp/roadmap.json" --sql-output "$tmp/publish.sql"
export PGSSLMODE=verify-full PGSSLROOTCERT="$repo/.github/certs/supabase-prod-ca-2021.crt"
env -u PLANE_API_KEY -u PGPASSWORD python3 -B vantare-v2/scripts/verify_roadmap_tls.py --host "$PGHOST" --port "$PGPORT" --ca "$PGSSLROOTCERT"
if ! env -u PLANE_API_KEY psql -X --no-password -q -v ON_ERROR_STOP=1 -f "$tmp/publish.sql" >"$tmp/psql.log" 2>&1; then
  echo 'Roadmap sync failed; inspect limits/ACL/mass-removal approval privately before retrying'
  exit 1
fi
echo "Roadmap sync completed at $ROADMAP_REF; unchanged content creates no publication"
