# 04 — Estado actual del proyecto

> **Fecha de corte:** 2026-06-11  
> Verificar siempre con `go test ./...` y git status antes de confiar en este doc.

---

## Fases v2 completadas

| Fase | Nombre | Estado | Notas |
|------|--------|--------|-------|
| 0 | Entorno | ✅ | Go, scaffold, mmap Windows |
| 1 | LMU reader + parser | 🟡 Casi | Live validado; offsets codegen OK; ampliar parser si hace falta |
| 2 | Pipeline telemetría | ✅ | Normalizer, deadband, 30 Hz, diff |
| 3 | Wails overlay mínimo | ✅ | Ventana transparente, bridge telemetría |
| 4 | Layout + modos | ✅ | JSON perfil, racing/edit, 3 widgets, SaveLayout |
| 5 | Hub React | ✅ | Dashboard v5 + CRUD perfiles + segunda ventana |
| 6 | OBS / SSE | ✅ técnico | HTTP localhost, `/overlay`, `/api/profile`, SSE; pendiente validación visual OBS real |

**Siguiente fase recomendada:** **Fase 7 — Optimización UI** (FPS por widget, DOM directo/canvas donde aplique), tras validar F6 en OBS real.

---

## Qué funciona hoy

### Overlay (`/`)

- Perfil JSON carga widgets delta, relative, standings.
- Modo **racing**: ventana shrink-wrap, click-through.
- Modo **edit** (`-edit` o `displayMode: "edit"`): fullscreen, arrastrar, guardar a JSON.
- Modo **streaming**: ventana overlay desktop se mueve off-screen 1×1; OBS usa Browser Source HTTP.
- Telemetría mock por defecto; `-live` con LMU en pista.

### Hub (`/#/hub`)

- **Dashboard**: hero, banner evento, ratings, gráfico iRating (canvas), carreras recientes, sidebar Pro — datos mayormente **mock** (OK para MVP F5).
- **Overlays (perfiles)**: listar, crear, activar, eliminar perfiles en `configs/`.
- Diseño portado desde `hub_main_v5.html` (tokens en `frontend/src/index.css`).

### Perfiles

- Ejemplo: `configs/example-racing.json` — id `default-racing`, archivo `example-racing.json`.
- Ejemplo OBS: `configs/example-streaming.json` — id `default-streaming`, archivo `example-streaming.json`.
- Activar desde hub emite `profile:loaded` al overlay.

### OBS / HTTP (Fase 6)

- Servidor embebido por defecto: `http://127.0.0.1:39261`.
- Healthcheck: `GET /health`.
- Overlay OBS: `GET /overlay?profile=example-streaming.json`.
- Perfil OBS: `GET /api/profile?profile=example-streaming.json` o por id JSON (`default-streaming`).
- Telemetría SSE: `GET /telemetry/stream`.
- Assets Vite (`/assets/...`) servidos desde `frontend/dist`.

---

## Fixes post code-review Fase 5 (aplicados)

Estos bugs se encontraron en review y **deben estar corregidos** en el código local:

1. **ID ≠ filename** — `ActivateProfile`/`DeleteProfile` resuelven por `file` o `id` JSON (`findProfilePath`).
2. **Save path tras activar** — `LoadActiveProfile(path)` actualiza destino de `SaveLayout`.
3. **Errores al hub** — evento `hub:error` + UI en ProfilesPage.
4. **Path traversal** — rechazo de `..` en IDs.
5. **Create duplicado** — error si el perfil ya existe.
6. **RatingChart** — `ResizeObserver` para redimensionar canvas.
7. **Delete** — confirmación antes de eliminar.
8. **Activate success** — evento `hub:profile-activated`.

Tests añadidos: `hub_service_test.go` (activate by id, save path, traversal, duplicate).

---

## Pendiente / deuda conocida

| Item | Fase | Prioridad |
|------|------|-----------|
| Hero hub con telemetría live | 5+ | Media |
| Rename perfil desde UI | 5+ | Baja |
| Páginas Telemetría / Setup (nav stub) | 5+ | Media |
| Validación visual en OBS real | 6 | Alta |
| FPS por widget optimizado | 7 | Media |
| Temas runtime + Lite mode | 8 | Media |
| iRacing / AC adapters | 9 | Media |
| Auth Supabase / freemium | post-MVP | Baja |
| Mover `hub_main_v5.html` → `docs/reference/` | docs | Baja |

---

## Evidencia y miniplanes

| Fase | Miniplan | Evidencia |
|------|----------|-----------|
| F4 | `docs/superpowers/plans/2026-06-11-v2-f4-composite-layout.md` | tests + manual |
| F5 | `docs/superpowers/plans/2026-06-11-v2-f5-hub-dashboard.md` | `.omo/evidence/v2-f5-hub.txt` |
| F6 | `.omo/plans/v2-f6-obs-sse.md` | `.omo/evidence/v2-f6-obs-sse.txt` |
| F4 closeout | `docs/superpowers/plans/2026-06-11-v2-f4-closeout.md` | — |

---

## Git / ramas

- Trabajo habitual en **`master`** (Isaac prefiere flujo simple).
- Commit F4 closeout referenciado: `f59074b` (puede haber cambios F5 sin commit).
- **Antes de continuar:** `git status` — F5 + review fixes pueden estar sin commitear.

---

## Criterio “fase cerrada”

- [ ] Checklist del miniplan completa
- [ ] `go test ./...` verde desde `vantare-v2/`
- [ ] `pnpm --dir frontend test` + `build` verde
- [ ] Manual mínimo documentado (flags, screenshots si UI)
- [ ] `V2-MASTER-PLAN.md` actualizado
