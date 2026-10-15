#!/usr/bin/env bash
# Instala el sondeo «Para Claude» en vantare-svc (root). La URL del aviso se escribe aparte en /etc/vantare/para-claude.url (600).
set -eu
install -m 750 /mnt/c/VantareServer/ops/linux/vantare-plane-para-claude.py /usr/local/sbin/
install -m 750 /mnt/c/VantareServer/ops/linux/plane_notify_workers.py /usr/local/sbin/
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
