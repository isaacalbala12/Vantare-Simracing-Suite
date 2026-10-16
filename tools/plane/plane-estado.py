#!/usr/bin/env python3
"""Mueve o consulta una tarea VANTA mediante la API pública v1 de Plane."""

import argparse
import html
import json
import os
from pathlib import Path
import re
import sys
from urllib import error, parse, request

DEFAULT_URL = "http://sapphireos.tail357eab.ts.net:8088"
WORKSPACE = "vantare-simracing-suite"
PROJECT_ID = "89da40f4-ae2a-443d-9e3e-6024e01247c9"
STATES = ("Por hacer", "Para Claude", "En curso", "Por revisar", "Por testear",
          "Entregado", "Cancelado")
ISAAC_STATES = {"Entregado", "Para Claude"}


class PlaneError(Exception):
    """Error sanitizado que se puede mostrar al usuario."""


class Parser(argparse.ArgumentParser):
    def error(self, message):
        # argparse normalmente reproduce argumentos arbitrarios en sus errores.
        self.print_usage(sys.stderr)
        self.exit(2, "Error: argumentos inválidos; consulta --help.\n")


# El vigilante del servidor (#1647) ignora los comentarios con esta firma.
COMMENT_PREFIX = "[orquestador] "


def parse_args(argv=None):
    parser = Parser(description=__doc__)
    parser.add_argument("tarea", help="VANTA-N")
    parser.add_argument("estado", nargs="?", choices=STATES)
    parser.add_argument("--ver", action="store_true", help="Solo consulta nombre y estado")
    parser.add_argument("--comentario", help="Comentario opcional al cambiar estado")
    parser.add_argument("--resumen", help="Viñetas (una por línea) de lo hecho, en lenguaje llano; sustituye la sección «Qué se ha hecho» de la descripción")
    parser.add_argument("--isaac", action="store_true", help="Solo orquestador por pedido de Isaac")
    args = parser.parse_args(argv)
    if not re.fullmatch(r"VANTA-[1-9][0-9]*", args.tarea):
        parser.error("Identificador inválido")
    if args.ver:
        if args.estado or args.comentario is not None or args.isaac:
            parser.error("--ver no admite cambios")
    elif args.estado is None and args.resumen is None:
        parser.error("Falta estado o --resumen")
    elif args.estado in ISAAC_STATES and not args.isaac:
        parser.exit(2, "Error: Entregado y Para Claude están reservados a Isaac; requieren --isaac.\n")
    return args


def read_token():
    token = os.environ.get("PLANE_API_TOKEN")
    if token is None:
        try:
            token = (Path.home() / ".vantare" / "plane-token").read_text(encoding="utf-8")
        except OSError:
            raise PlaneError("Falta el token: configura PLANE_API_TOKEN o ~/.vantare/plane-token.") from None
    token = token.strip()
    if not token or "\n" in token or "\r" in token:
        raise PlaneError("Token ausente o inválido: revisa PLANE_API_TOKEN o ~/.vantare/plane-token.")
    return token


class NoRedirect(request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        # No reenviar X-API-Key a otro destino, ni repetir una mutación.
        return None


class Plane:
    def __init__(self, token):
        self.token = token
        base = os.environ.get("PLANE_URL", DEFAULT_URL).rstrip("/")
        url = parse.urlsplit(base)
        if url.scheme not in ("http", "https") or not url.netloc or url.username or url.password or url.query or url.fragment:
            raise PlaneError("PLANE_URL debe ser una URL HTTP(S) sin credenciales, query ni fragmento.")
        self.base = base + "/api/v1/workspaces/" + WORKSPACE + "/"
        self.opener = request.build_opener(NoRedirect())

    def call(self, path, method="GET", data=None):
        body = None if data is None else json.dumps(data).encode("utf-8")
        try:
            req = request.Request(self.base + path, data=body, method=method,
                                  headers={"X-API-Key": self.token, "Content-Type": "application/json"})
            with self.opener.open(req, timeout=20) as response:
                return json.load(response)
        except error.HTTPError as exc:
            raise PlaneError(f"Plane devolvió HTTP {exc.code}; no se muestra el cuerpo de la respuesta.") from None
        except (error.URLError, OSError, ValueError):
            raise PlaneError("No se pudo conectar a Plane o su respuesta no es JSON válido.") from None

    def items(self, path):
        cursor = None
        seen = set()
        while True:
            page = self.call(path + ("?" + parse.urlencode({"cursor": cursor}) if cursor else ""))
            if isinstance(page, list):
                yield from page
                return
            if not isinstance(page, dict) or not isinstance(page.get("results"), list):
                raise PlaneError("Plane devolvió una lista inválida.")
            yield from page["results"]
            if not page.get("next_page_results"):
                return
            cursor = page.get("next_cursor")
            if not isinstance(cursor, str) or not cursor or cursor in seen:
                raise PlaneError("Plane devolvió una paginación inválida.")
            seen.add(cursor)

    def project(self):
        try:
            for project in self.items("projects/"):
                if project.get("identifier") == "VANTA":
                    return project["id"]
        except PlaneError:
            pass
        return PROJECT_ID


SUMMARY = "<h3>Qué se ha hecho</h3>"


def with_summary(description, text):
    """Sustituye (o añade al final) la sección de resumen por viñetas."""
    items = [line.strip().lstrip("-•* ").strip() for line in text.splitlines()]
    bullets = "".join("<li>" + html.escape(i) + "</li>" for i in items if i)
    keep = description.split(SUMMARY)[0].rstrip()
    return keep + SUMMARY + "<ul>" + bullets + "</ul>"


def run(args, plane):
    project = plane.project()
    prefix = "projects/" + parse.quote(project, safe="") + "/"
    states = list(plane.items(prefix + "states/"))
    issue = plane.call("work-items/" + args.tarea + "/")
    if issue.get("project") != project:
        raise PlaneError("La tarea no pertenece al proyecto VANTA resuelto.")
    state_id = issue.get("state")
    if isinstance(state_id, dict):
        state_id = state_id.get("id")
    current = next((s["name"] for s in states if s["id"] == state_id), None)
    if current is None:
        raise PlaneError("No se pudo resolver el estado actual por nombre.")
    if args.ver:
        return f"{args.tarea}: {issue['name']} | Estado: {current}"
    path = prefix + "work-items/" + parse.quote(issue["id"], safe="") + "/"
    if args.resumen is not None:
        plane.call(path, "PATCH", {"description_html": with_summary(issue.get("description_html") or "", args.resumen)})
        if args.estado is None:
            return f"{args.tarea}: resumen actualizado"
    if args.estado is None:
        raise PlaneError("Indica un estado, --resumen o --ver.")
    target = [s for s in states if s["name"] == args.estado]
    if len(target) != 1:
        raise PlaneError("El estado solicitado no existe o es ambiguo en /states/.")
    plane.call(path, "PATCH", {"state": target[0]["id"]})
    # Volver a leer: un PATCH aceptado no basta para acreditar el estado.
    saved = plane.call(path).get("state")
    if isinstance(saved, dict):
        saved = saved.get("id")
    if saved != target[0]["id"]:
        raise PlaneError("PATCH enviado, pero el estado leído no coincide; comprueba con --ver.")
    if args.comentario is not None:
        try:
            plane.call(path + "comments/", "POST", {
                "comment_html": "<p>" + html.escape(COMMENT_PREFIX + args.comentario).replace("\n", "<br>") + "</p>"})
        except PlaneError:
            raise PlaneError("Estado cambiado y verificado, pero falló el comentario; no se repite automáticamente.") from None
    return f"{args.tarea}: {current} → {args.estado} (verificado)"


def main(argv=None):
    args = parse_args(argv)
    token = None
    try:
        token = read_token()
        output = run(args, Plane(token))
        print(output.replace(token, "[TOKEN OCULTO]"))
        return 0
    except PlaneError as exc:
        message = str(exc)
    except Exception:
        # Nunca imprimir traceback, argumentos, cabeceras ni respuestas remotas.
        message = "Respuesta o configuración de Plane inesperada; comprueba con --ver."
    print("Error: " + (message.replace(token, "[TOKEN OCULTO]") if token else message), file=sys.stderr)
    return 1


if __name__ == "__main__":
    for stream in (sys.stdout, sys.stderr):
        if hasattr(stream, "reconfigure"):
            stream.reconfigure(encoding="utf-8", errors="replace")
    sys.exit(main())
