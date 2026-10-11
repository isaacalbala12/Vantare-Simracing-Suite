#!/usr/bin/env bash
# Cada 5 min dentro de vantare-svc: comprueba Plane; 3 fallos seguidos -> reinicia la stack. Latido para Health (Windows).
set -u
state=/var/lib/vantare/plane-fails; mkdir -p /var/lib/vantare
code=$(curl -s -o /dev/null -w '%{http_code}' --max-time 20 http://127.0.0.1:8088/ || true)
n=$(cat "$state" 2>/dev/null || echo 0)
if [ "$code" = 200 ]; then n=0; else n=$((n+1)); fi
action=
if [ "$n" -eq 3 ]; then systemctl restart vantare-plane && action=' restart'; fi
echo "$n" > "$state"
hb=/mnt/c/VantareServer/heartbeat
[ -d "$hb" ] && echo "$(date -Is) http=$code fallos=$n$action" > "$hb/plane.txt"
