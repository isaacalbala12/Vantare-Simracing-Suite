#!/usr/bin/env bash
# Instala el sondeo «Para Claude» en vantare-svc (root). La URL del aviso se escribe aparte en /etc/vantare/para-claude.url (600).
set -eu
# El manifiesto debe proceder del checkout revisado y quedar protegido por ACL.
# El lanzador verifica también este instalador ANTES de ejecutarlo.
manifest=$(realpath "${1:?Falta manifiesto SHA-256 de confianza}")
source_dir=${2:-/mnt/c/VantareServer/ops/linux}
stage=$(mktemp -d)
trap 'rm -rf "$stage"' EXIT
for script in install-para-claude.sh vantare-plane-para-claude.py plane_notify_workers.py; do
  cp "$source_dir/$script" "$stage/$script"
done
# Verificar la copia privada evita cambios entre comprobación e instalación.
(cd "$stage" && sha256sum --check --strict "$manifest")
install -o root -g root -m 750 "$stage/vantare-plane-para-claude.py" /usr/local/sbin/
install -o root -g root -m 750 "$stage/plane_notify_workers.py" /usr/local/sbin/
cat > /etc/systemd/system/vantare-plane-para-claude.service <<'U'
[Unit]
Description=Aviso de tareas nuevas en «Para Claude» (Plane)
After=vantare-plane.service
ConditionPathExists=/etc/vantare/para-claude.url
[Service]
Type=oneshot
ExecStart=/usr/bin/python3 -I /usr/local/sbin/vantare-plane-para-claude.py
U
cat > /etc/systemd/system/vantare-plane-para-claude.timer <<'U'
[Unit]
Description=Sondeo «Para Claude» cada 60 s
[Timer]
OnBootSec=3min
OnUnitActiveSec=60s
AccuracySec=5s
[Install]
WantedBy=timers.target
U
systemctl daemon-reload
