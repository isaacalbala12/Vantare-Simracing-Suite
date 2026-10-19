"""Read Plane v1. Only the public task allowlist reaches the roadmap document."""
import ipaddress
import json
import re
import unicodedata
import urllib.error
import urllib.parse
import urllib.request
import uuid

STATUS = {'por hacer': 'next', 'para claude': 'now', 'en curso': 'now',
          'por revisar': 'now', 'por testear': 'now', 'entregado': 'done'}
EXCLUDED = {'infraestructura', 'negocio'}
INTERNAL_STATES = {'para isaac'}
NAMESPACE = uuid.UUID('78c38d96-f693-5707-86f7-b30dde54b0ee')


class SyncError(ValueError):
    """Sanitized, actionable source failure; never includes API responses."""


def normalized(text):
    return ' '.join(unicodedata.normalize('NFKC', text).casefold().split())


def identifier(value):
    try:
        return str(uuid.UUID(value))
    except (ValueError, TypeError, AttributeError):
        raise SyncError('UUID Plane inválido') from None


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        raise SyncError('Redirección Plane rechazada')


class Plane:
    def __init__(self, base_url, token):
        url = urllib.parse.urlsplit(base_url)
        try:
            address = ipaddress.ip_address(url.hostname or '')
            lan = address.is_private and not address.is_unspecified and not address.is_multicast
        except ValueError:
            lan = url.hostname == 'localhost'
        if (url.scheme != 'https' and not (url.scheme == 'http' and lan)) or not url.hostname or \
                url.username or url.password or url.query or url.fragment or url.path not in ('', '/'):
            raise SyncError('URL Plane inválida: HTTPS o IP privada LAN')
        if not token.strip():
            raise SyncError('Falta PLANE_API_KEY')
        self.base = base_url.rstrip('/') + '/api/v1/'
        self.token = token

    def get(self, path, **query):
        if not re.fullmatch(r'[a-zA-Z0-9_/-]+', path) or '..' in path:
            raise SyncError('Ruta Plane inválida')
        url = self.base + path + ('?' + urllib.parse.urlencode(query) if query else '')
        request = urllib.request.Request(url, headers={'X-API-Key': self.token}, method='GET')
        try:
            with urllib.request.build_opener(NoRedirect).open(request, timeout=30) as response:
                raw = response.read(4 * 1024 * 1024 + 1)
            if len(raw) > 4 * 1024 * 1024:
                raise SyncError('Respuesta Plane demasiado grande')
            return json.loads(raw)
        except (OSError, ValueError) as error:
            if isinstance(error, SyncError):
                raise
            raise SyncError('Lectura Plane fallida; revisar conexión/API/permisos') from None


def rows(api, path):
    result, seen, cursors = [], set(), set()
    cursor, total = None, None
    for _ in range(100):
        query = {'per_page': 100}
        if cursor is not None:
            query['cursor'] = cursor
        page = api.get(path, **query)
        if isinstance(page, dict) and isinstance(page.get('results'), list):
            batch, more = page['results'], page.get('next_page_results')
            count = page.get('total_results')
            if type(more) is not bool or type(count) is not int or count < 0 or 'next_cursor' not in page:
                raise SyncError('Paginación Plane incompleta')
            if total is not None and total != count:
                raise SyncError('Recuento Plane cambió durante lectura')
            total = count
        else:
            raise SyncError('Respuesta Plane sin paginación verificable')
        for row in batch:
            key = identifier(row['id'])
            if key in seen:
                raise SyncError('Registro Plane duplicado durante lectura')
            seen.add(key)
            result.append(row)
        if not more:
            if total is not None and total != len(result):
                raise SyncError('Lectura Plane incompleta')
            return result
        cursor = page.get('next_cursor')
        if not batch or not isinstance(cursor, str) or not cursor or len(cursor) > 100 or cursor in cursors:
            raise SyncError('Cursor Plane inválido o repetido')
        cursors.add(cursor)
    raise SyncError('Paginación Plane supera límite de seguridad')


def fetch(api, workspace, project):
    if not re.fullmatch(r'[a-zA-Z0-9_-]+', workspace):
        raise SyncError('Workspace Plane inválido')
    prefix = f'workspaces/{workspace}/projects/{identifier(project)}/'
    states = rows(api, prefix + 'states/')
    modules = rows(api, prefix + 'modules/')
    tasks = rows(api, prefix + 'issues/')  # Plane CE v1.4.2 route; no app/session API.
    by_id = {identifier(task['id']): dict(task, modules=[]) for task in tasks}
    for module in modules:
        module_id = identifier(module['id'])
        members = rows(api, prefix + f'modules/{module_id}/module-issues/')
        count = module.get('total_issues')
        if type(count) is not int or count < 0 or count != len(members):
            raise SyncError('Recuento de module Plane incompleto; no publicar')
        # Private classification must be proven before any task can reach SQL.
        # An empty private module requires manual verification, even if its count is zero.
        if normalized(module['name']) in EXCLUDED and not members:
            raise SyncError('Module privado vacío; verificar en Plane antes de publicar')
        for member in members:
            task = by_id.get(identifier(member['id']))
            if task is None or any(member[key] != task[key] for key in ('name', 'state', 'sequence_id') if key in member):
                raise SyncError('Tareas/modules cambiaron durante lectura; reintentar')
            task['modules'].append(module_id)
    return {'states': states, 'modules': modules, 'tasks': list(by_id.values())}


def catalog(entries):
    result, names = {}, set()
    for entry in entries:
        key = identifier(entry['id'])
        name = normalized(entry['name'])
        if not name or name in names or key in result:
            raise SyncError('Catálogo Plane ausente o ambiguo')
        result[key] = entry
        names.add(name)
    return result


def document(snapshot):
    try:
        states, modules = catalog(snapshot['states']), catalog(snapshot['modules'])
        if not EXCLUDED.issubset({normalized(module['name']) for module in modules.values()}):
            raise SyncError('Faltan modules Infraestructura/Negocio; no publicar')
        tasks = snapshot['tasks']
        ids = [identifier(task['id']) for task in tasks]
        if len(set(ids)) != len(ids):
            raise SyncError('Tarea Plane duplicada')
        items = []
        for task in sorted(tasks, key=lambda task: (task['sequence_id'], task['id'])):
            if type(task['sequence_id']) is not int or task['sequence_id'] < 1:
                raise SyncError('Orden Plane inválido')
            memberships = [modules[identifier(key)] for key in task['modules']]
            if not memberships or any(normalized(module['name']) in EXCLUDED for module in memberships):
                continue
            state = states[identifier(task['state'])]
            if state.get('group') == 'cancelled' or normalized(state['name']) in (
                    INTERNAL_STATES | {'cancelado', 'cancelada'}):
                continue
            section = STATUS.get(normalized(state['name']))
            if section is None:
                raise SyncError('Estado Plane desconocido; revisar mapeo')
            name = task['name']
            area = ' / '.join(sorted({module['name'] for module in memberships}))
            body = 'Estado: ' + state['name']
            if not name.strip() or len(name) > 120 or len(area) > 60 or len(body) > 600 or '\0' in name + area + body:
                raise SyncError('Texto Plane supera contrato; no truncar')
            localized = lambda text: {'es': text, 'en': '', 'pt': '', 'it': ''}
            items.append({'id': str(uuid.uuid5(NAMESPACE, 'plane:' + identifier(task['id']))),
                          'section': section, 'title': localized(name), 'body': localized(body),
                          'area': area, 'version': None, 'dueDate': None})
        result = {'schemaVersion': 2, 'items': items}
        if len(items) > 40 or len(json.dumps(result, ensure_ascii=False).encode()) > 40000:
            raise SyncError('Roadmap supera 40 tareas o 40 KB; parar y pedir decisión a Isaac')
        if not items:
            raise SyncError('Roadmap vacío; conservar publicación anterior y pedir decisión')
        return result
    except (KeyError, TypeError, AttributeError):
        raise SyncError('Fuente Plane incompleta o inválida') from None
