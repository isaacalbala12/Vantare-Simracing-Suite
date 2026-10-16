#!/usr/bin/env bash
# Solo ejecutar después de DUDA aprobada; operador prepara usuario/directorio.
set -euo pipefail
set +x
repo=isaacalbala12/Vantare-Simracing-Suite
root=/opt/vantare-runner
[[ $(id -un) == vantare-ci && $EUID != 0 ]] || { echo 'Usar cuenta exclusiva vantare-ci sin root' >&2; exit 1; }
[[ $(gh api "repos/$repo" --jq '.private') == true ]] || { echo 'Registro bloqueado: repo aún público' >&2; exit 1; }
[[ -d $root && ! -L $root && -O $root ]] || { echo 'El operador debe preparar /opt/vantare-runner' >&2; exit 1; }
cd "$root"
[[ ! -e .runner && ! -e config.sh ]] || { echo 'Directorio ya utilizado; no reemplazar' >&2; exit 1; }
curl --fail --location --proto '=https' --tlsv1.2 -o runner.tar.gz https://github.com/actions/runner/releases/download/v2.338.0/actions-runner-linux-x64-2.338.0.tar.gz
echo 'af4b794c1bc41d73d40535e3fe092a39f9679cd8d965954c2aca25a05ca41d32  runner.tar.gz' | sha256sum --check --status
tar xzf runner.tar.gz
export ACTIONS_RUNNER_INPUT_TOKEN
ACTIONS_RUNNER_INPUT_TOKEN=$(gh api --method POST "repos/$repo/actions/runners/registration-token" --jq .token)
trap 'unset ACTIONS_RUNNER_INPUT_TOKEN' EXIT
./config.sh --unattended --url "https://github.com/$repo" --name vantare-linux --labels vantare-1565 --work _work > /dev/null 2>&1 || { echo 'Falló registro; revisar localmente sin imprimir credenciales' >&2; exit 1; }
echo 'Registrado. Servicio todavía sin instalar; operador: sudo ./svc.sh install vantare-ci'
