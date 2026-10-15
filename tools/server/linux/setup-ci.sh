#!/usr/bin/env bash
# Distro vantare-ci (root). Idempotente. Necesita /mnt/c: la primera vez antes de aplicar wsl.conf;
# después, pasar los ficheros por stdin (automount queda desactivado).
set -euo pipefail
export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
apt-get -y -qq upgrade
apt-get install -y -qq --no-install-recommends \
  build-essential clang cmake pkg-config libasound2-dev libfontconfig-dev libgit2-dev libglib2.0-dev \
  libssl-dev libva-dev libvulkan1 libwayland-dev libx11-xcb-dev libxkbcommon-x11-dev libzstd-dev \
  git curl ca-certificates unzip python3 python-is-python3 jq unattended-upgrades \
  libicu74 libkrb5-3 zlib1g liblttng-ust1t64 >/dev/null
id vantare-ci >/dev/null 2>&1 || useradd -m -s /bin/bash vantare-ci
install -d -o vantare-ci -g vantare-ci -m 700 /opt/vantare-runner
install -d -o root -g root -m 755 /opt/vantare-hooks
install -o root -g root -m 755 /tmp/hooks/job-start.sh /tmp/hooks/job-end.sh /tmp/hooks/register-linux.sh /tmp/hooks/install-service.sh /opt/vantare-hooks/
install -o root -g root -m 644 /tmp/hooks/cleanup.py /tmp/hooks/job-guard.py /opt/vantare-hooks/
sed -i 's/\r$//' /opt/vantare-hooks/*
# Rust fijado del rust-toolchain.toml, en el HOME del usuario CI
if ! su - vantare-ci -c 'test -x ~/.cargo/bin/rustup'; then
  # rustup-init 1.28.2 oficial, x86_64 Linux; verificar antes de ejecutar.
  rustup_stage=$(mktemp -d)
  trap 'rm -rf "$rustup_stage"' EXIT
  curl --proto '=https' --tlsv1.2 -fsSL \
    https://static.rust-lang.org/rustup/archive/1.28.2/x86_64-unknown-linux-gnu/rustup-init \
    -o "$rustup_stage/rustup-init"
  echo "20a06e644b0d9bd2fbdbfd52d42540bdde820ea7df86e92e533c073da0cdd43c  $rustup_stage/rustup-init" | sha256sum --check --status
  chmod 755 "$rustup_stage" "$rustup_stage/rustup-init"
  su - vantare-ci -c "'$rustup_stage/rustup-init' -y -q --profile minimal --default-toolchain 1.95.0 -c rustfmt -c clippy"
  rm -rf "$rustup_stage"
  trap - EXIT
fi
su - vantare-ci -c '~/.cargo/bin/cargo nextest --version 2>/dev/null | grep -q 0.9.146 || ~/.cargo/bin/cargo install -q cargo-nextest --locked --version 0.9.146'
# gh solo para register-linux.sh (Isaac autentica y cierra sesión tras registrar)
if ! command -v gh >/dev/null; then
  install -d -m 755 /etc/apt/keyrings
  curl -fsSL https://cli.github.com/packages/githubcli-archive-keyring.gpg -o /etc/apt/keyrings/githubcli-archive-keyring.gpg
  echo "deb [arch=amd64 signed-by=/etc/apt/keyrings/githubcli-archive-keyring.gpg] https://cli.github.com/packages stable main" > /etc/apt/sources.list.d/github-cli.list
  apt-get update -qq && apt-get install -y -qq gh >/dev/null
fi
cat > /etc/wsl.conf <<'CONF'
[boot]
systemd=true
[automount]
enabled=false
mountFsTab=false
[interop]
enabled=false
appendWindowsPath=false
[user]
default=vantare-ci
CONF
echo "ci listo: $(su - vantare-ci -c '~/.cargo/bin/rustc --version; ~/.cargo/bin/cargo nextest --version' | tr '\n' ' ')"
