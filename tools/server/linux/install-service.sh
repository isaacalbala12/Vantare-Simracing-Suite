#!/usr/bin/env bash
# Root, tras register-linux.sh: instala el servicio del runner con hooks como Environment ANTES de arrancar.
set -euo pipefail
[[ $EUID == 0 ]] || { echo 'Ejecutar como root' >&2; exit 1; }
cd /opt/vantare-runner
[[ -f .runner ]] || { echo 'Runner no registrado: ejecutar antes register-linux.sh como vantare-ci' >&2; exit 1; }
./svc.sh install vantare-ci
unit=$(systemctl list-unit-files 'actions.runner.*' --no-legend | awk '{print $1}' | head -1)
mkdir -p "/etc/systemd/system/$unit.d"
cat > "/etc/systemd/system/$unit.d/vantare-hooks.conf" <<'CONF'
[Service]
Environment=ACTIONS_RUNNER_HOOK_JOB_STARTED=/opt/vantare-hooks/job-start.sh
Environment=ACTIONS_RUNNER_HOOK_JOB_COMPLETED=/opt/vantare-hooks/job-end.sh
Nice=10
Restart=always
CONF
systemctl daemon-reload
./svc.sh start
systemctl is-active "$unit"
