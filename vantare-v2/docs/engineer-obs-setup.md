# Vantare Engineer — OBS Setup

> **Fase:** EN9.4.
> **Worktree:** `codex/engineer-release`.
> **Aplicable a:** OBS Browser Source consumiendo el bus de notificaciones de Vantare Engineer.

## 1. Endpoints

El servidor HTTP local de Vantare expone dos endpoints relacionados con Engineer:

| Endpoint | Tipo | Propósito |
|---|---|---|
| `GET /engineer/stream` | SSE | Stream de notificaciones en vivo (lo que consume el widget en OBS). |
| `GET /api/engineer/health` | JSON | Snapshot de salud del servicio (diagnóstico). |

La URL base es la misma que usa el overlay (ej. `http://localhost:34115` por defecto). Ver `docs/obs-local-setup.md` para los detalles del setup general de OBS.

## 2. Stream SSE `/engineer/stream`

### Comportamiento

- `Content-Type: text/event-stream`
- `Cache-Control: no-cache`
- `Connection: keep-alive`
- `X-Accel-Buffering: no`
- Keep-alive cada 15 s (línea `:keep-alive\n\n`).
- Cierra limpiamente cuando el cliente se desconecta (`r.Context().Done()`).
- Devuelve `503 engineer service not available` si Ingeniero está deshabilitado o no inicializado.

### Eventos emitidos

```text
event: engineer-notification
data: {"id":"...","text":"Coche a la izquierda",...}

```

El campo `data` es un `EngineerNotification` serializado: `id`, `category`, `severity`, `textKey`, `text`, `priority`, `createdAt`, `expiresAt`, `source`.

### Reconexión

El `EventSource` del navegador reconecta automáticamente ante desconexión. OBS Browser Source hereda este comportamiento.

## 3. Health endpoint `/api/engineer/health`

Devuelve un snapshot JSON ligero para diagnóstico OBS o monitorización externa.

```json
{
  "ok": true,
  "source": "simulator",
  "connected": true,
  "enabled": true,
  "subscribers": 1,
  "dropCount": 0,
  "lastError": ""
}
```

- `200 OK` cuando `ok=true` (servicio habilitado y con source configurada).
- `503 Service Unavailable` cuando `ok=false` (ej. Engineer deshabilitado).

### Backpressure: `dropCount`

Cuando un cliente SSE está saturado (canal lleno), el servicio descarta notificaciones para ese cliente y suma 1 a `dropCount`. No se reintenta (los eventos son puntuales y la siguiente notificación tapará el hueco visualmente). Si `dropCount` crece rápido, suele indicar un cliente OBS bloqueado o un widget que no se está renderizando.

## 4. Configuración recomendada en OBS

1. Crear `Browser Source` en OBS.
2. URL del overlay: `http://localhost:34115/overlay?profile=tu-perfil`.
3. Tamaño: el que tenga el widget `engineer-notifications` en el perfil.
4. Refresh: el del perfil (no necesita ajustes adicionales).
5. Si el widget no aparece, verificar:
   - `/api/engineer/health` devuelve 200.
   - El perfil contiene el widget `engineer-notifications`.
   - Engineer está habilitado en el Hub.

## 5. Checklist de verificación manual

- [ ] Abrir la app, ir a `Ingeniero`, activar `Simulador`.
- [ ] En OBS, añadir Browser Source con `http://localhost:34115/overlay?profile=...`.
- [ ] Verificar que las notificaciones del spotter aparecen en OBS (ej. `Coche a la izquierda`).
- [ ] Desconectar la red del PC de OBS unos segundos y reconectar. El stream debe reanudarse.
- [ ] Verificar `GET http://localhost:34115/api/engineer/health` en navegador: JSON con `ok: true`.
- [ ] Forzar muchos mensajes seguidos: `dropCount` puede crecer levemente (≤ unos pocos) y volver a 0 entre sesiones.
- [ ] Cerrar OBS y volver a abrir: el stream debe reconectarse sin reiniciar la app.

## 6. Limitaciones conocidas

- No hay `Last-Event-ID` ni replay: si un cliente se desconecta, no recibe los eventos perdidos durante el gap.
- No hay autenticación: el servidor HTTP está pensado para LAN local. Para OBS en doble PC, ver `docs/obs-lan-double-pc-plan.md`.
- El `dropCount` es global del proceso; no se desglosa por suscriptor.