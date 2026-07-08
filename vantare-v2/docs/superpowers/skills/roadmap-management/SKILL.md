# Skill: Roadmap — Gestión de features y progreso

## Visión general

El roadmap se genera **100% automático** desde:
1. **`docs/current-plan.md`** — qué está activo (tú lo mantienes)
2. **`docs/superpowers/plans/*.md`** — progreso vía checks `- [x]`/`[ ]`
3. **`scripts/generate-roadmap-progress.mjs`** — genera el JSON
4. **`frontend/src/hub/roadmap/roadmap-features.ts`** — React consume el JSON

**No hay overrides manuales.** El progreso es 100% derivado de checks.

---

## Ciclo de vida completo de un plan

### Fase 1: Crear el plan

Crea `docs/superpowers/plans/2026-MM-DD-nombre-del-plan.md` con esta estructura:

```markdown
# NOMBRE-PLAN — Descripción corta

Fecha: 2026-07-07
Parte de: contexto del trabajo
Depende de: otros planes si aplica

## Objetivo
Qué hace el plan en 1-2 frases.

## Alcance
Qué se toca y qué NO se toca.

## Implementación paso a paso

### Step 1: Nombre del paso
- [ ] **Subtarea 1:** descripción
- [ ] **Subtarea 2:** descripción

### Step 2: Nombre del paso
- [ ] **Subtarea 1:** descripción
- [ ] **Subtarea 2:** descripción

## Checks esperados
- `pnpm --dir frontend test` → PASS
- `pnpm --dir frontend exec tsc --noEmit` → OK
```

**Reglas para checks:**
- Cada `- [ ]` es una unidad de trabajo medible
- Usa `- [x]` cuando termines esa unidad
- Si un step no aplica (p.ej. "Read docs"), márcalo como `- [x]` de todas formas
- El script cuenta `- [x]` vs `- [ ]` para calcular el %

### Fase 2: Registrar en `current-plan.md`

Añade una `Nota` al **principio del archivo** (antes de la última nota existente):

```markdown
Nota MI-PLAN (2026-07-07):
- Objetivo: descripción corta
- Tipo: feature | bugfix | improve | research | component
- Estado: 🟢 ACTIVO
- Plan: `docs/superpowers/plans/2026-07-07-mi-plan.md`
- ...
```

**Campos:**

| Campo | Obligatorio | Valores | Default |
|-------|-------------|---------|---------|
| `Estado:` | Sí | `🟢 ACTIVO` o `🔮 FUTURO` | — |
| `Plan:` | Sí | Path a `.md` en `superpowers/plans/` | — |
| `Tipo:` | No | `feature` · `bugfix` · `improve` · `research` · `component` | `feature` |
| `Objetivo:` | No | Texto libre | "" |

### Fase 3: Implementar y marcar checks

### Paso 3: Marcar checks AL TERMINAR CADA STEP

**⚠️ REGLA OBLIGATORIA:** marca `- [x]` **inmediatamente** después de completar CADA step/corte. No acumules checks sin marcar.

```markdown
### Step 1: Crear test ← completé esto
- [x] **Subtarea 1:** crear fixture  ← lo marqué al terminar
- [x] **Subtarea 2:** escribir test   ← lo marqué al terminar

### Step 2: Implementar helper ← completé esto
- [x] **Subtarea 1:** crear función   ← lo marqué al terminar
- [x] **Subtarea 2:** añadir exports  ← lo marqué al terminar

### Step 3: Añadir UI ← todavía no
- [ ] **Subtarea 1:** componente
- [ ] **Subtarea 2:** estilos
```

**¿Por qué?** El roadmap calcula el % en tiempo real desde los checks. Si dejas 5 steps sin marcar y los marcas todos de golpe al final, el usuario ve 0% durante todo el desarrollo y de golpe 100%. Con checks por step, el usuario ve progreso gradual.

**El script se ejecuta después de cada cambio de checks.** Si no lo ejecutas, el JSON no se actualiza.

El % se calcula automáticamente: `(checks hechos / total checks) × 100`.

### Fase 4: Cerrar el plan

Cuando el plan esté completo:

```markdown
### Al completar CADA step:

5. **Marca `- [x]`** en el plan **inmediatamente** al terminar el step
6. **Ejecuta el script** para actualizar el progreso:
   ```bash
   node scripts/generate-roadmap-progress.mjs
   ```
7. **Repite** para cada step hasta completar todos
### Marcadores de estado

| Marker | Significado | En el roadmap |
|--------|-------------|---------------|
| `Estado: 🟢 ACTIVO` | En desarrollo ahora | Card roja con progreso |
| `Estado: 🔮 FUTURO` | Se hará en el futuro | Card gris sin progreso |
| `Estado: ✅ HECHO` | Terminado | No se muestra |
| Sin marker | No registrado | No se muestra |

### Tipos de feature

| Tipo | Icono | Significado | Ejemplo |
|------|-------|-------------|---------|
| `feature` | ⚡ | Funcionalidad nueva | Launcher Extendido |
| `bugfix` | 🐛 | Corrección de bugs | Syntax error en CalendarDayView |
| `improve` | 🔧 | Mejora de algo existente | Overlay Performance |
| `research` | 🔬 | Investigación / inventario | OBS LAN Doble PC |
| `component` | 🧩 | Componente fundamental | Widget Schema v2 |

### Ejemplo completo de Nota

```markdown
Nota CALENDAR-REFACTOR (2026-07-07):
- Objetivo: reescribir la pestaña de calendario para mostrar cadencia de LMU
- Tipo: feature
- Estado: 🟢 ACTIVO
- Plan: `docs/superpowers/plans/2026-07-07-calendar-refactor.md`
- Decisiones cerradas: (1) interval-series como banda, (2) filtro no abre modal
- Tests: 123/123 PASS
- Sin commit, sin tag, sin release.
```

---

## Workflow del worker paso a paso

### Al empezar una tarea:

1. **Lee `docs/current-plan.md`** para entender el estado actual
2. **Crea el plan** en `docs/superpowers/plans/` con checks `- [ ]`
3. **Registra la Nota** en `current-plan.md` con `Estado: 🟢 ACTIVO`
4. **Ejecuta el script** para que aparezca en el roadmap:
   ```bash
   node scripts/generate-roadmap-progress.mjs
   ```

### Al completar cada step:

5. **Marca `- [x]`** en el plan inmediatamente
6. **Ejecuta el script** para actualizar el progreso:
   ```bash
   node scripts/generate-roadmap-progress.mjs
   ```

### Al terminar la tarea:

7. **Marca todos los checks restantes** como `- [x]`
8. **Actualiza el estado** en `current-plan.md`:
   ```markdown
   - Estado: ✅ HECHO
   ```
9. **Ejecuta el script** una última vez
10. **Añade nota de cierre** en `current-plan.md`:
    ```markdown
    Nota MI-PLAN (2026-07-07) — Implementation:
    - Archivos modificados: ...
    - Tests: X/X PASS
    - Sin commit, sin tag, sin release.
    ```

---

## Ejecutar el script

```bash
node scripts/generate-roadmap-progress.mjs
```

Salida:
```
✓ roadmap-progress.json: 2 active + 4 future plans → frontend/src/hub/roadmap/roadmap-progress.json
```

**Cuándo ejecutarlo:**
- Al empezar una tarea (para que aparezca la card)
- Al completar cada step (para que suba el %)
- Al terminar (para que muestre 100%)
- Antes de cada build de producción

---

## Qué ve el usuario en la app

- **"Features por área"** — progreso global, conteo de en desarrollo + próximas
- **Categorías activas** — cards con borde rojo, badge "EN DESARROLLO", icono de tipo, checks, barra de progreso
- **"Próximamente"** — separador + categorías futuras con cards grises, badge "PRÓXIMAMENTE"
- **Click en card** — panel expandido con descripción completa, progreso con pasos, enlace al plan

---

## Errores comunes

| Error | Causa | Fix |
|-------|-------|-----|
| Plan no aparece en roadmap | Falta `Estado: 🟢 ACTIVO` | Añade el marker en current-plan.md |
| % es 0% pero hay trabajo hecho | Checks no marcados con `- [x]` | Marca los steps completados |
| Plan sigue visible después de terminar | No se actualizó el estado | Cambia a `✅ HECHO` o borra la línea |
| Script no encuentra el plan | Path en `Plan:` no válido | Verifica que el `.md` exista |
| Card sin icono de tipo | Falta `Tipo:` en la Nota | Añade `Tipo: feature` (default) |
| Progreso no se actualiza | No se ejecutó el script | Ejecuta `node scripts/generate-roadmap-progress.mjs` |
| Dos planes activos con mismo nombre | Notas duplicadas en current-plan.md | Usa nombres únicos (antonimo-case) |
