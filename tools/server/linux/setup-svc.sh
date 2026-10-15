#!/usr/bin/env bash
# Distro vantare-svc (root): Docker Engine oficial + Plane CE v1.4.2 + usuario del publicador. Idempotente.
set -euo pipefail
export DEBIAN_FRONTEND=noninteractive
apt-get update -qq && apt-get -y -qq upgrade
apt-get install -y -qq --no-install-recommends ca-certificates curl git python3 postgresql-client jq openssl unattended-upgrades zstd >/dev/null
if ! command -v docker >/dev/null; then
  install -m 0755 -d /etc/apt/keyrings
  curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
  echo "deb [arch=amd64 signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu noble stable" > /etc/apt/sources.list.d/docker.list
  apt-get update -qq
  apt-get install -y -qq docker-ce docker-ce-cli containerd.io docker-compose-plugin >/dev/null
fi
systemctl enable --now docker >/dev/null
# Rotación de logs de contenedores
[ -f /etc/docker/daemon.json ] || { echo '{"log-driver":"local","log-opts":{"max-size":"10m","max-file":"3"}}' > /etc/docker/daemon.json; systemctl restart docker; }
id vantare >/dev/null 2>&1 || useradd -m -s /bin/bash vantare
id roadmap >/dev/null 2>&1 || useradd -m -s /bin/bash roadmap
# Plane: ficheros oficiales fijados por SHA256
install -d -m 750 /opt/plane /var/backups/plane
cd /opt/plane
fetch() { curl -fsSL -o "$1" "https://github.com/makeplane/plane/releases/download/v1.4.2/$1"; echo "$2  $1" | sha256sum -c --status || { echo "SHA $1 incorrecto"; exit 1; }; }
fetch docker-compose.yml 1560157357fcdcdd3b69d6a823a6bf497ab2b5e03a39888082ac0cab605986ae
fetch variables.env 64db1740913f288d6c6af9f4824c020cde139591ac7dd555b02836dca86a1e06
if [ ! -f plane.env ]; then
  umask 077
  r() { openssl rand -hex 32; }
  pg=$(r); mq=$(r)
  sed -e 's|^APP_DOMAIN=.*|APP_DOMAIN=192.168.1.57:8088|' \
      -e 's|^APP_RELEASE=.*|APP_RELEASE=v1.4.2|' \
      -e 's|^LISTEN_HTTP_PORT=.*|LISTEN_HTTP_PORT=8088|' \
      -e 's|^LISTEN_HTTPS_PORT=.*|LISTEN_HTTPS_PORT=8443|' \
      -e 's|^WEB_URL=.*|WEB_URL=http://192.168.1.57:8088|' \
      -e 's|^CORS_ALLOWED_ORIGINS=.*|CORS_ALLOWED_ORIGINS=http://192.168.1.57:8088|' \
      -e "s|^POSTGRES_PASSWORD=.*|POSTGRES_PASSWORD=$pg|" \
      -e "s|^DATABASE_URL=.*|DATABASE_URL=postgresql://plane:$pg@plane-db:5432/plane|" \
      -e "s|^RABBITMQ_PASSWORD=.*|RABBITMQ_PASSWORD=$mq|" \
      -e "s|^AMQP_URL=.*|AMQP_URL=amqp://plane:$mq@plane-mq:5672/plane|" \
      -e "s|^SECRET_KEY=.*|SECRET_KEY=$(r)|" \
      -e "s|^AWS_ACCESS_KEY_ID=.*|AWS_ACCESS_KEY_ID=$(openssl rand -hex 12)|" \
      -e "s|^AWS_SECRET_ACCESS_KEY=.*|AWS_SECRET_ACCESS_KEY=$(r)|" \
      -e "s|^LIVE_SERVER_SECRET_KEY=.*|LIVE_SERVER_SECRET_KEY=$(r)|" \
      variables.env > plane.env
  unset pg mq
  chmod 600 plane.env
fi
cat > /etc/systemd/system/vantare-plane.service <<'UNIT'
[Unit]
Description=Plane CE (docker compose vantare-plane)
Requires=docker.service
After=docker.service network-online.target
[Service]
Type=oneshot
RemainAfterExit=yes
NoNewPrivileges=yes
ProtectSystem=strict
ProtectHome=yes
PrivateTmp=yes
WorkingDirectory=/opt/plane
# Contenedores efímeros: cada arranque parte de la imagen (datos en volúmenes). Un apagado brusco
# dejó staticfiles.json a 0 bytes en la capa del contenedor api y collectstatic fallaba en bucle.
ExecStart=/usr/bin/docker compose -p vantare-plane --env-file plane.env up -d --force-recreate --remove-orphans
ExecStop=/usr/bin/docker compose -p vantare-plane --env-file plane.env stop
TimeoutStartSec=900
[Install]
WantedBy=multi-user.target
UNIT
systemctl daemon-reload
systemctl enable vantare-plane >/dev/null
cat > /etc/wsl.conf <<'CONF'
[boot]
systemd=true
[automount]
enabled=true
options="metadata,umask=077"
[interop]
enabled=false
appendWindowsPath=false
[user]
default=vantare
CONF
echo "svc listo: $(docker --version); $(docker compose version)"
