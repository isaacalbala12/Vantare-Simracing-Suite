# 05 — Plan maestro y fases futuras

> Documento oficial detallado: [`../V2-MASTER-PLAN.md`](../V2-MASTER-PLAN.md)

---

## Visión del roadmap v2 (10 fases)

| Fase | Nombre | Entregable clave | Estado |
|------|--------|------------------|--------|
| 0 | Entorno | Go + scaffold + tests | ✅ |
| 1 | LMU reader | mmap + parser + CLI debug | 🟡 |
| 2 | Pipeline | normalizer + deadband + 30 Hz | ✅ |
| 3 | Wails mínimo | 1 ventana overlay | ✅ |
| 4 | Layout | JSON + racing/edit + 3 widgets | ✅ |
| 5 | Hub | Dashboard v5 + CRUD perfiles | ✅ |
| 6 | OBS / SSE | HTTP localhost + Browser Source | ✅ técnico |
| 7 | Optimización UI | FPS por widget, DOM directo | ⬜ **SIGUIENTE** |
| 8 | Temas | CSS variables, Lite mode | ⬜ |
| 9 | Ops + multi-sim | CPU/RAM widget, iRacing/AC | ⬜ |

---

## Presupuestos globales

| Métrica | Objetivo |
|---------|----------|
| RAM hub + 1 overlay | &lt; 120 MB |
| CPU en pista | &lt; 2 % |
| Binario release | &lt; 40 MB |
| Parse LMU / tick | &lt; 2 ms |
| Broadcast UI | ≤ 30 Hz |

---

## Fase 6 — OBS / SSE (detalle)

**Objetivo:** Perfil `streaming` — telemetría y overlay vía HTTP+SSE; OBS usa Browser Source sin ventana Wails overlay.

| Tarea | Validación |
|-------|------------|
| Servidor embebido Go `localhost` | `GET /health` |
| SSE `/telemetry/stream` con diff payload | `curl.exe -N`, OBS Browser Source |
| Servir página overlay estática | Mismo layout JSON |
| Toggle racing vs streaming en perfil | Ventana desktop off-screen 1×1 en streaming |

**Miniplan:** `.omo/plans/v2-f6-obs-sse.md`

**Nota:** validado con tests automatizados y endpoints HTTP. Queda como chequeo manual recomendado abrir la URL en OBS real antes de dar por cerrada la experiencia de usuario.

---

## Fase 7 — Optimización UI

- Registry widget con `targetFps` por tipo.
- RPM/speed/delta vía DOM directo o ref (no React setState 60 Hz).
- Canvas para track map / inputs si aplica.

---

## Fase 8 — Temas

- Export tokens v5 → `themes/vantare-v5.json` + CSS variables.
- Lite mode (menos blur/sombras) para GPUs débiles.
- Re-skin widgets overlay con tokens (pixel-perfect opcional).

Referencia: [`06-DISENO-UI.md`](./06-DISENO-UI.md)

---

## Fase 9 — Ops + multi-sim

- Widget System Performance (CPU/RAM de la app).
- Settings compat GPU.
- Segundo sim: adapter iRacing o AC → mismo `pkg/models`.

---

## Proceso de trabajo por fase

1. Elegir **una fase activa**.
2. Escribir **miniplan** (plantilla en V2-MASTER-PLAN.md).
3. Orquestador revisa alcance → ejecutor implementa.
4. Code review + tests.
5. Evidencia + marcar ✅ en master plan.

**No saltar fases** salvo spike ≤ 2 h documentado.

---

## Backlog de miniplanes sugeridos

1. `v2-f6-obs-sse.md` — servidor HTTP + SSE + perfil streaming
2. `v2-f7-widget-fps.md` — throttling por widget en frontend
3. `v2-f8-themes.md` — temas runtime
4. `v2-f9-multisim.md` — adapter iRacing o AC
5. `v2-f5-polish.md` — hero live, rename perfil, páginas nav (opcional)

---

## Post-MVP (no numerado en fases)

- Auth Supabase + tiers Free/Pro/Ultimate
- Sync perfiles en nube
- Marketplace temas
- Stream alerts portados de v1
- Track map, input telemetry, 80+ data blocks (visión v1 roadmap)
