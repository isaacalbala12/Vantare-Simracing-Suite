"""Read one public health row; never log credentials, response bodies or URLs."""

import argparse
import json
import os
import sys
import urllib.error
import urllib.parse
import urllib.request


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


def request(req):
    # Redirects must not forward the anon key or the Discord webhook token.
    return urllib.request.build_opener(NoRedirect).open(req, timeout=20)


def probe():
    base = os.environ.get("VITE_SUPABASE_URL", "").strip().rstrip("/")
    key = os.environ.get("VITE_SUPABASE_ANON_KEY", "").strip()
    parsed = urllib.parse.urlsplit(base)
    if (not key or parsed.scheme != "https" or not parsed.hostname
            or parsed.username or parsed.password or parsed.query or parsed.fragment
            or parsed.path):
        print("Latido FAIL: revisar VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY.")
        return 1
    req = urllib.request.Request(
        base + "/rest/v1/supabase_heartbeat?select=id&limit=1",
        headers={"apikey": key, "Authorization": "Bearer " + key,
                 "Accept": "application/json", "Cache-Control": "no-cache",
                 "User-Agent": "Vantare-Supabase-Latido/1.0"},
    )
    try:
        with request(req) as response:
            if response.status != 200:
                print("Latido FAIL: respuesta HTTP inesperada.")
                return 1
            data = json.loads(response.read(1025))
        if (not isinstance(data, list) or len(data) != 1
                or not isinstance(data[0], dict) or set(data[0]) != {"id"}
                or data[0]["id"] is not True):
            print("Latido FAIL: fila de salud ausente o respuesta inesperada.")
            return 1
    except urllib.error.HTTPError as error:
        print(f"Latido FAIL: HTTP {error.code}.")
        return 1
    except (OSError, ValueError):
        print("Latido FAIL: error de red, configuración o JSON.")
        return 1
    print("Latido OK: lectura de PostgreSQL verificada.")
    return 0


def notify_failure():
    webhook = os.environ.get("DISCORD_KNOWN_ISSUES_WEBHOOK_URL", "").strip()
    if not webhook:
        print("Aviso omitido: DISCORD_KNOWN_ISSUES_WEBHOOK_URL no configurado; revisar Actions.")
        return 0
    parsed = urllib.parse.urlsplit(webhook)
    if (parsed.scheme != "https" or parsed.hostname != "discord.com"
            or not parsed.path.startswith("/api/webhooks/")
            or parsed.username or parsed.password):
        print("Aviso FAIL: configuración del webhook inválida.")
        return 1
    repo = os.environ.get("GITHUB_REPOSITORY", "")
    run_id = os.environ.get("GITHUB_RUN_ID", "")
    # Only an allowlisted GitHub run link enters the message, never error bodies.
    link = ""
    if repo == "isaacalbala12/Vantare-Simracing-Suite" and run_id.isdigit():
        link = f" https://github.com/{repo}/actions/runs/{run_id}"
    payload = {"content": "Supabase: falló el latido diario. Revisar Actions y el estado del proyecto." + link,
               "allowed_mentions": {"parse": []}}
    req = urllib.request.Request(webhook, data=json.dumps(payload).encode(),
                                 headers={"Content-Type": "application/json",
                                          "User-Agent": "Vantare-Supabase-Latido/1.0"}, method="POST")
    try:
        with request(req) as response:
            if response.status not in (200, 204):
                print("Aviso FAIL: respuesta HTTP inesperada.")
                return 1
    except (OSError, ValueError):
        print("Aviso FAIL: entrega a Discord fallida; revisar Actions.")
        return 1
    print("Aviso de fallo enviado a Discord.")
    return 0


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--notify-failure", action="store_true")
    args = parser.parse_args()
    try:
        return notify_failure() if args.notify_failure else probe()
    except ValueError:
        print("FAIL: configuración inválida.")
        return 1


if __name__ == "__main__":
    sys.exit(main())
