#!/usr/bin/env bash
# vantare-svc (root): timers de copia y roadmap, deploy key. Idempotente.
set -euo pipefail
install -d -o root -g root -m 700 /var/lib/vantare
install -m 750 /mnt/c/VantareServer/ops/linux/vantare-plane-backup.sh /usr/local/sbin/
install -m 755 /mnt/c/VantareServer/ops/linux/vantare-roadmap-publish.sh /usr/local/bin/
cat > /etc/systemd/system/vantare-plane-backup.service <<'U'
[Unit]
Description=Copia de Plane
Requires=docker.service
After=vantare-plane.service
[Service]
Type=oneshot
ExecStart=/usr/local/sbin/vantare-plane-backup.sh
NoNewPrivileges=yes
ProtectSystem=strict
ProtectHome=yes
PrivateTmp=yes
ReadWritePaths=/var/backups/plane /mnt/c/VantareServer/backups/plane
U
cat > /etc/systemd/system/vantare-plane-backup.timer <<'U'
[Unit]
Description=Copia diaria de Plane 03:30
[Timer]
OnCalendar=*-*-* 03:30:00
Persistent=true
[Install]
WantedBy=timers.target
U
cat > /etc/systemd/system/vantare-roadmap.service <<'U'
[Unit]
Description=Publicador del roadmap (#1535)
After=network-online.target
Wants=network-online.target
RequiresMountsFor=/mnt/c
ConditionFileNotEmpty=/mnt/c/VantareServer/secrets/roadmap.env
[Service]
Type=oneshot
User=roadmap
Environment=ROADMAP_REF=master
EnvironmentFile=/mnt/c/VantareServer/secrets/roadmap.env
ExecStart=/usr/local/bin/vantare-roadmap-publish.sh
NoNewPrivileges=yes
PrivateTmp=yes
ProtectSystem=strict
ProtectHome=tmpfs
BindPaths=/home/roadmap
TimeoutStartSec=600
U
cat > /etc/systemd/system/vantare-roadmap.timer <<'U'
[Unit]
Description=Roadmap cada 6 h (min 17)
[Timer]
OnCalendar=*-*-* 00/6:17:00
Persistent=true
[Install]
WantedBy=timers.target
U
install -m 750 /mnt/c/VantareServer/ops/linux/vantare-plane-health.sh /usr/local/sbin/
cat > /etc/systemd/system/vantare-plane-health.service <<'U'
[Unit]
Description=Supervisión de Plane
After=vantare-plane.service
[Service]
Type=oneshot
ExecStart=/usr/local/sbin/vantare-plane-health.sh
NoNewPrivileges=yes
ProtectSystem=strict
ProtectHome=yes
PrivateTmp=yes
ReadWritePaths=/var/lib/vantare /mnt/c/VantareServer/heartbeat
U
cat > /etc/systemd/system/vantare-plane-health.timer <<'U'
[Unit]
Description=Supervisión de Plane cada 5 min
[Timer]
OnBootSec=3min
OnUnitActiveSec=5min
[Install]
WantedBy=timers.target
U
systemctl daemon-reload
systemctl enable --now vantare-plane-backup.timer vantare-roadmap.timer vantare-plane-health.timer >/dev/null
# Deploy key de solo lectura (la privada no sale del servidor)
su - roadmap -c 'install -d -m 700 ~/.ssh; test -f ~/.ssh/vantare_deploy || ssh-keygen -q -t ed25519 -N "" -C "vantare-roadmap@SapphireOS" -f ~/.ssh/vantare_deploy'
curl -fsS https://api.github.com/meta | jq -r '.ssh_keys[] | "github.com " + .' > /home/roadmap/.ssh/known_hosts
chown roadmap:roadmap /home/roadmap/.ssh/known_hosts; chmod 644 /home/roadmap/.ssh/known_hosts
echo "DEPLOY_KEY_PUB: $(cat /home/roadmap/.ssh/vantare_deploy.pub)"
systemctl list-timers 'vantare-*' --no-pager | head -5
