#!/usr/bin/env bash
# Aplicar P3-2 sin reinstalar Plane ni leer secretos. Ejecutar como root de svc.
set -euo pipefail
umask 077
backup="/var/backups/vantare-hardening/$(date -u +%Y%m%dT%H%M%SZ)"
install -d -o root -g root -m 700 "$backup" /var/lib/vantare
for name in vantare-plane vantare-plane-backup vantare-plane-health vantare-plane-para-claude; do
  dir="/etc/systemd/system/$name.service.d"
  install -d -o root -g root -m 755 "$dir"
  if [ -f "$dir/security.conf" ]; then cp -p "$dir/security.conf" "$backup/$name.security.conf";
  else touch "$backup/$name.security.conf.absent"; fi
  cat > "$dir/security.conf" <<'UNIT'
[Service]
NoNewPrivileges=yes
ProtectSystem=strict
ProtectHome=yes
PrivateTmp=yes
UNIT
  case "$name" in
    vantare-plane-backup) echo 'ReadWritePaths=/var/backups/plane /mnt/c/VantareServer/backups/plane' >> "$dir/security.conf" ;;
    vantare-plane-health) echo 'ReadWritePaths=/var/lib/vantare /mnt/c/VantareServer/heartbeat' >> "$dir/security.conf" ;;
    vantare-plane-para-claude) echo 'ReadWritePaths=/var/lib/vantare' >> "$dir/security.conf" ;;
  esac
done
(cd "$backup" && sha256sum -- * > SHA256SUMS)
systemctl daemon-reload
echo "HARDENING_BACKUP=$backup"
# No reiniciar aquí: verificar unidades y escoger una ventana antes del restart.
