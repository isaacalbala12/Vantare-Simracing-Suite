"""#1609: genera definiciones sin red; --apply requiere autorización posterior."""
import argparse
import json
import sys
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.parse import urljoin, urlparse
from urllib.request import HTTPRedirectHandler, Request, build_opener

HOST = "https://eu.posthog.com"
TAG = "vantare-1609-v1"
NAME = "Vantare · Uso y conversión consentidos v1"


def event(name, **fields):
    return {"kind": "EventsNode", "event": name, **fields}


def definitions():
    def insight(name, source, description):
        return {"name": name, "description": description, "tags": [TAG], "saved": True,
                "query": {"kind": "InsightVizNode", "source": source}}

    def trends(series, breakdown=None):
        query = {"kind": "TrendsQuery", "series": series, "interval": "day",
                 "dateRange": {"date_from": "-30d"}, "filterTestAccounts": True,
                 "trendsFilter": {"display": "ActionsLineGraph"}}
        if breakdown:
            query["breakdownFilter"] = {"breakdown": breakdown, "breakdown_type": "event"}
        return query

    funnel = {"kind": "FunnelsQuery", "dateRange": {"date_from": "-30d"},
              "filterTestAccounts": True,
              "series": [event(name) for name in (
                  "installation_observed", "account_signed_in", "commercial_license_observed")],
              "funnelsFilter": {"funnelWindowInterval": 30, "funnelWindowIntervalUnit": "day",
                                "funnelOrderType": "ordered", "funnelVizType": "steps"}}
    retention = {"kind": "RetentionQuery", "dateRange": {"date_from": "-30d"},
                 "filterTestAccounts": True,
                 "retentionFilter": {"targetEntity": {"id":"page_viewed","type":"events"},
                                     "returningEntity": {"id":"page_viewed","type":"events"},
                                     "retentionType": "retention_first_time",
                                     "retentionReference": "total",
                                     "period": "Day", "totalIntervals": 14}}
    return {
        "dashboard": {"name": NAME, "tags": [TAG], "pinned": True, "is_shared": False,
                      "description": "Solo quienes aceptan. Uso observado; no ingresos. "
                      "Descarga separada: sin atribución web→app. Registro/pago exactos pendientes."},
        "insights": [
            insight("Instalaciones activas", trends([event("page_viewed", math="dau")]),
                    "UUID de instalación distintos por día; no personas ni todos los usuarios."),
            insight("Páginas visitadas", trends([event("page_viewed")], "page"), "Entradas consentidas."),
            insight("Tiempo por página (segundos)", trends([event("page_usage", math="sum", math_property="duration_seconds")], "page"),
                    "Ventana activa; gaps de suspensión excluidos. No suma páginas en segundo plano."),
            insight("Funciones usadas", trends([event("feature_used")], "feature"), "Acciones explícitas sin contenido."),
            insight("Tiempo visible por widget (segundos)", trends([event("widget_usage", math="sum", math_property="duration_seconds")], "widget_type"),
                    "Una vez por tipo simultáneo; excluye ocultos por sesión, bandeja, fuera de pista y licencia."),
            insight("Retención de instalaciones (14 días)", retention, "Regreso a páginas; UUID local, sin cuentas entre equipos."),
            insight("Embudo nativo observado (30 días)", funnel,
                    "Primer uso consentido → sesión disponible → derecho comercial verificado. NO registro ni compra nuevos."),
            insight("Descargas solicitadas (web, separado)", trends([event("download_requested", math="dau")], "platform"),
                    "Clic consentido en web; requiere PR Marketing. No porcentaje descarga→instalación."),
        ],
    }


class NoRedirect(HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


class Api:
    def __init__(self, project, key):
        self.base = f"{HOST}/api/projects/{project}/"
        self.key = key
        self.opener = build_opener(NoRedirect())

    def request(self, method, path, value=None):
        target = urljoin(self.base, path)
        if (urlparse(target).netloc != urlparse(HOST).netloc
                or not target.startswith(self.base)):
            raise ValueError("La API solo admite el proyecto UE seleccionado")
        body = None if value is None else json.dumps(value).encode()
        request = Request(target, data=body, method=method, headers={
            "Authorization": f"Bearer {self.key}", "Content-Type": "application/json"})
        try:
            with self.opener.open(request, timeout=20) as response:
                return json.load(response)
        except HTTPError as error:
            # Nunca imprimir respuesta, cabeceras ni objeto Request con la clave.
            raise RuntimeError(f"PostHog rechazó {method}: HTTP {error.code}") from None
        except (URLError, ValueError):
            raise RuntimeError("No se pudo confirmar la respuesta de PostHog; reintentar tras revisar el panel") from None

    def list(self, resource):
        path = resource + "?limit=100"
        items = []
        seen = set()
        while path:
            if path in seen or len(seen) >= 100:
                raise RuntimeError("Paginación repetida o excesiva")
            seen.add(path)
            page = self.request("GET", path)
            if not isinstance(page.get("results"), list):
                raise RuntimeError("Listado incompleto: abortado sin crear")
            items.extend(page["results"])
            path = page.get("next")
        return items


def owned(items, name):
    matches = [item for item in items if item.get("name") == name and not item.get("deleted")]
    if len(matches) > 1 or any(TAG not in item.get("tags", []) for item in matches):
        raise RuntimeError("Nombre duplicado o ajeno: no se sobrescribe")
    return matches[0] if matches else None


def apply(api, specification):
    # Leer ambos listados completos antes de mutar. Solo crear, nunca borrar/PATCH.
    dashboards = api.list("dashboards/")
    insights = api.list("insights/")
    dashboard = owned(dashboards, specification["dashboard"]["name"])
    existing = [(definition, owned(insights, definition["name"]))
                for definition in specification["insights"]]
    for definition, found in existing:
        if found and (dashboard is None or dashboard["id"] not in found.get("dashboards", [])
                      or found.get("query") != definition["query"]):
            raise RuntimeError("Insight existente divergente o sin asociación: revisar; no se sobrescribe")
    if dashboard is None:
        dashboard = api.request("POST", "dashboards/", specification["dashboard"])
    for definition, found in existing:
        if found:
            continue
        api.request("POST", "insights/", {**definition, "dashboards": [dashboard["id"]]})
    return f"{HOST}/project/{api.base.split('/')[-2]}/dashboard/{dashboard['id']}"


def main():
    sys.stdout.reconfigure(encoding="utf-8")
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--project-id", type=int)
    parser.add_argument("--apply", action="store_true", help="Escritura real; solo con permiso posterior de Isaac")
    args = parser.parse_args()
    specification = definitions()
    if not args.apply:
        print(json.dumps(specification, ensure_ascii=False, indent=2))
        return
    if not args.project_id or args.project_id <= 0:
        parser.error("--apply exige --project-id positivo")
    # Única ubicación autorizada, no env ni búsquedas de secretos.
    path = Path.home() / ".vantare" / "posthog-personal-key"
    try:
        if path.stat().st_size > 4096:
            raise ValueError
        key = path.read_text(encoding="utf-8").strip()
        if not key or any(char.isspace() for char in key):
            raise ValueError
    except (OSError, ValueError):
        parser.exit(1, "Falta una clave personal válida en el archivo privado acordado.\n")
    try:
        print(apply(Api(args.project_id, key), specification))
    except (RuntimeError, ValueError, KeyError):
        parser.exit(1, "Paneles no confirmados; revisar proyecto/permisos y volver a ejecutar sin borrar nada.\n")


if __name__ == "__main__":
    main()
