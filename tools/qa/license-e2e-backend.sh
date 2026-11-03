#!/bin/bash
# All resources belong to this invocation; no existing PostgreSQL/Deno service is used.
set -eu
# No ambient provider credentials or configuration reach either test process.
exec env -i PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin /bin/bash -s -- "$@" <<'QA_ISOLATED_BACKEND'
set -eu
qa=$(realpath -e /mnt/d/VantareServer/qa/licencias-e2e)
checkout=$(realpath -e -- "$1")
run=$(realpath -e -- "$2")
port=$3
case "$checkout/" in /mnt/d/VantareServer/qa/licencias-e2e/*) ;; *) exit 2;; esac
case "$run/" in /mnt/d/VantareServer/qa/licencias-e2e/*) ;; *) exit 2;; esac
marker=$(realpath -e -- "$run/qa-e2e-owned")
case "$marker" in "$run"/*) ;; *) exit 2;; esac
test "$(cat "$marker")" = 'VANTA-126 qa-e2e fixture'
qa=/mnt/d/VantareServer/qa/licencias-e2e
export DENO_DIR="$qa/deno-cache"
export TMPDIR="$run/pg-volume"
export POLAR_ENVIRONMENT=sandbox
export PYTHONDONTWRITEBYTECODE=1
export VANTARE_NATIVE_DATA_ROOT="$run/native"
export LOCALAPPDATA="$run/local"
export APPDATA="$run/roaming"
deno="$qa/tools/deno-2.7.13/deno"
umask 077
mkdir -p "$qa/tools/postgrest-16.1" "$run/pg-volume"
if [ ! -f "$qa/tools/postgrest-16.1/postgrest" ]; then
  curl -fL --retry 2 https://github.com/PostgREST/postgrest/releases/download/v16.1/postgrest-v16.1-linux-static-x86-64.tar.xz -o "$qa/tools/postgrest.tar.xz"
  echo "b986c926cf16a1c5d97954c57d3a6edd894a5da225c3f3fc0c25dc4105009dd7  $qa/tools/postgrest.tar.xz" | sha256sum --check
  tar -xJf "$qa/tools/postgrest.tar.xz" -C "$qa/tools/postgrest-16.1"
fi
truncate -s 1G "$run/postgres.ext4"
mkfs.ext4 -q -F "$run/postgres.ext4"
mount -o loop "$run/postgres.ext4" "$run/pg-volume"
chown postgres:postgres "$run/pg-volume"
chmod 700 "$run/pg-volume"
backend="$run/pg-volume/backend"
install -d -m 700 -o postgres -g postgres "$backend"
pg_child=''
cleanup() {
  touch "$backend/qa-e2e-stop"
  if [ -n "$pg_child" ]; then wait "$pg_child" || true; fi
  umount "$run/pg-volume"
}
trap cleanup EXIT
cd "$checkout"
"$deno" cache --frozen --node-modules-dir=auto --config supabase/tests/license-e2e-deno.json supabase/tests/license-e2e-server.ts supabase/tests/commercial-bearers.ts
# Same dynamic-import warm-up as the commercial CI. Synthetic bearer discarded;
# this is dependency preparation, before the runtime receives loopback-only permissions.
"$deno" run --no-lock --config supabase/functions/deno.json --allow-read=supabase/functions \
  supabase/tests/commercial-bearers.ts 17020000-0000-4000-8000-000000000001 > /dev/null
printf 'VANTA-126 qa-e2e fixture' > "$backend/qa-e2e-owned"
chown postgres:postgres "$backend/qa-e2e-owned"
runuser -u postgres --preserve-environment -- python3 supabase/tests/run-commercial-local.py \
  --pg-bin /usr/lib/postgresql/16/bin --output "$backend" --qa-e2e \
  --qa-edge-origin "http://127.0.0.1:$port" --postgrest-bin "$qa/tools/postgrest-16.1/postgrest" --deno-bin "$deno" > "$run/commercial.log" 2>&1 &
pg_child=$!
for attempt in $(seq 1 2400); do
  if [ -f "$backend/qa-e2e-ready.json" ]; then break; fi
  kill -0 "$pg_child" 2>/dev/null || { echo 'QA commercial bootstrap failed'; exit 1; }
  sleep .1 # Bounded server readiness; not a simulated licensing wait.
done
test -f "$backend/qa-e2e-ready.json"
"$deno" run --cached-only --frozen --config supabase/tests/license-e2e-deno.json --allow-env=POLAR_ENVIRONMENT,DENO_DEPLOYMENT_ID --allow-read="$run,$checkout/supabase" --allow-net=127.0.0.1 \
  supabase/tests/license-e2e-server.ts "$backend/qa-e2e-ready.json" "$run/clock.json" "$port"

QA_ISOLATED_BACKEND
