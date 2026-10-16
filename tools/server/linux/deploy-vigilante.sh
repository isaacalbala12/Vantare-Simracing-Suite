#!/usr/bin/env bash
# Ejecutar como root de vantare-svc desde scripts y manifiesto protegidos por ACL.
set -euo pipefail
umask 077
source_dir=${1:-/mnt/c/VantareServer/ops/linux}
stage=$(mktemp -d)
trap 'rm -rf "$stage"' EXIT
for file in install-para-claude.sh vantare-plane-para-claude.py plane_notify_workers.py vigilante.sha256; do
  cp "$source_dir/$file" "$stage/$file"
done
(cd "$stage" && sha256sum --check --strict vigilante.sha256)
backup="/var/backups/vigilante/1647c-$(date -u +%Y%m%dT%H%M%SZ)"
install -d -o root -g root -m 700 "$backup"
systemctl stop vantare-plane-para-claude.timer vantare-plane-para-claude.service
paths=(/usr/local/sbin/vantare-plane-para-claude.py /usr/local/sbin/plane_notify_workers.py
       /var/lib/vantare/para-claude.json /etc/systemd/system/vantare-plane-para-claude.service
       /etc/systemd/system/vantare-plane-para-claude.timer)
for file in "${paths[@]}"; do
  if [ -f "$file" ]; then cp -p "$file" "$backup/$(basename "$file")";
  else touch "$backup/$(basename "$file").absent"; fi
done
(cd "$backup" && sha256sum -- * > SHA256SUMS)
rollback() {
  echo 'Despliegue fallido; restaurando scripts/unidades/estado anteriores' >&2
  for file in "${paths[@]}"; do
    if [ -f "$backup/$(basename "$file").absent" ]; then rm -f "$file";
    else cp -p "$backup/$(basename "$file")" "$file"; fi
  done
  systemctl daemon-reload
  systemctl start vantare-plane-para-claude.timer
}
trap 'rollback' ERR
bash "$stage/install-para-claude.sh" "$stage/vigilante.sha256" "$stage"
# El dry-run no migra, no envía ni lee secretos. No resembrar ni vaciar colas.
python3 -I /usr/local/sbin/vantare-plane-para-claude.py --dry-run > "$backup/dry-run.txt"
grep -Fx 'dry-run: 0 avisos pendientes; sin enviar ni guardar' "$backup/dry-run.txt"
grep -Fx 'dry-run: 0 actividades de Workers Bot pendientes' "$backup/dry-run.txt"
systemctl enable --now vantare-plane-para-claude.timer
systemctl is-enabled vantare-plane-para-claude.timer
systemctl is-active vantare-plane-para-claude.timer
echo "BACKUP=$backup"
echo 'DEPLOY_DONE'
