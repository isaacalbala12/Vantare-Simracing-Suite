#!/usr/bin/env bash
systemctl is-system-running
systemctl start vantare-plane
for i in $(seq 1 60); do code=$(curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:8088/ || true); [ "$code" = 200 ] && break; sleep 10; done
docker compose -p vantare-plane ps --format '{{.Service}} {{.State}} {{.Status}}'
echo "plane http $code"
free -m
