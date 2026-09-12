# 10 — Workflow de desarrollo (orquestador + ejecutor)

> **Referencia histórica; no usar como workflow vigente.** Para iniciar trabajo
> leer [la transición a Notion](../../vantare-v2/docs/vantare-program/notion-transition.md) y el expediente canónico
> de `vantare-v2/docs/vantare-program/`. Se conservan las decisiones y evidencias
> fechadas de abajo; sus órdenes de ejecución, tracker y prioridades no prevalecen
> sobre esas fuentes actuales.


---

## Roles

| Rol | Quién | Responsabilidad |
|-----|-------|-----------------|
| **Product owner** | Isaac | Prioridades, validación visual, aceptar fases |
| **Orquestador** | Cursor (este chat) | Planificar, miniplanes, code review, delegar, no asumir expertise de Isaac |
| **Ejecutor** | Agente externo (DeepSeek, etc.) | Implementar miniplanes concretos, tests, evidencia |

Isaac **no programa** — necesita explicaciones claras y pasos verificables.

---

## Ciclo por fase

```
1. Elegir fase (V2-MASTER-PLAN)
2. Escribir miniplan (.omo/plans/v2-f{N}-*.md)
3. Orquestador revisa alcance + diseño + riesgos
4. Ejecutor implementa (prompt con rutas + criterios aceptación)
5. Verificación: go test, pnpm test, build, manual
6. Code review (/code-review) — orquestador corrige bugs críticos
7. Actualizar docs + marcar ✅ + evidencia (.omo/evidence/)
8. Commit/push solo cuando Isaac lo pida
```

---

## Plantilla miniplan

Ver [`../V2-MASTER-PLAN.md`](../V2-MASTER-PLAN.md) sección "Plantilla de miniplan".

Campos mínimos:

- Objetivo (1 frase)
- In scope / Out of scope
- Archivos tocados
- Pasos numerados
- Criterios aceptación + comandos test
- Riesgos

---

## Prompt típico para ejecutor

Incluir siempre:

1. Ruta repo: `C:\Users\isaac\Desktop\Vantare-Overlays`
2. Código activo: `vantare-v2/` only
3. Miniplan path o pegar checklist
4. Referencia diseño: `hub_main_v5.html` si hay UI
5. Comandos verificación obligatorios
6. "No improvisar diseño" / "No tocar v1 Electron"

---

## Code review (orquestador)

Cuando Isaac pide `/code-review`:

1. Priorizar bugs, regresiones, seguridad, tests faltantes.
2. Ordenar hallazgos por severidad.
3. Si pide "soluciona", implementar fixes + tests + re-run suites.

Review F5 ejemplo: id≠filename, save path, hub:error, path traversal.

---

## Evidencia al cerrar fase

Guardar en `.omo/evidence/`:

```
.omo/evidence/v2-f{N}-{slug}.txt
```

Contenido sugerido:

- Fecha
- Comandos ejecutados + output resumido
- Checklist aceptación
- Screenshots path (si UI)
- Commit hash (si aplica)

---

## Git

- Rama habitual: `master`
- **No commit** salvo petición explícita de Isaac
- No force push a main

---

## Anti-patrones de coordinación

- Ejecutor marca fase ✅ sin tests verdes.
- Mezclar cambios F5 hub con refactor v1 Electron.
- Saltar a F6 OBS sin miniplan.
- Improvisar UI sin abrir `hub_main_v5.html`.
- Orquestador implementa features grandes sin pasar por miniplan cuando Isaac espera delegación.

---

## Herramientas útiles

| Herramienta | Uso |
|-------------|-----|
| Cursor Agent | Orquestador + fixes review |
| `/code-review` | Auditoría pre-cierre |
| `.omo/plans/` | Miniplanes locales |
| `docs/superpowers/plans/` | Miniplanes versionados |
| `hub_main_v5.html` | QA visual hub |
