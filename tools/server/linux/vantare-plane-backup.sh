#!/usr/bin/env bash
# Copia diaria de Plane: pg_dump + adjuntos (MinIO) + plane.env. 14 días en ext4 y en C:\VantareServer\backups\plane.
set -euo pipefail
umask 077
stamp=$(date +%Y%m%d-%H%M)
work=$(mktemp -d /var/backups/plane/.work.XXXX); trap 'rm -rf "$work"' EXIT
cd /opt/plane
docker compose -p vantare-plane --env-file plane.env exec -T plane-db sh -c 'PGPASSWORD="$POSTGRES_PASSWORD" pg_dump -h 127.0.0.1 -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc' > "$work/plane.dump"
[ -s "$work/plane.dump" ] || { echo 'pg_dump vacío' >&2; exit 1; }
tar -C "$(docker volume inspect -f '{{.Mountpoint}}' vantare-plane_uploads)" -cf "$work/uploads.tar" .
cp plane.env docker-compose.yml "$work/"
out="/var/backups/plane/plane-$stamp.tar.zst"
tar -C "$work" -cf - . | zstd -q -T2 -o "$out.tmp" && mv "$out.tmp" "$out"
find /var/backups/plane -maxdepth 1 -name 'plane-*.tar.zst' -mtime +13 -delete
win=/mnt/c/VantareServer/backups/plane
mkdir -p "$win"
cp "$out" "$win/.$(basename "$out").tmp" && mv "$win/.$(basename "$out").tmp" "$win/$(basename "$out")"
find "$win" -maxdepth 1 -name 'plane-*.tar.zst' -mtime +13 -delete
echo "backup ok $(basename "$out") $(du -h "$out" | cut -f1)"
