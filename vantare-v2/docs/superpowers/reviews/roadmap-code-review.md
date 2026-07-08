# Revisión de Código — Roadmap (2026-07-06)

Reviewer: RoadmapFeatureCodeReviewer
Fecha: 2026-07-07
Archivos revisados: roadmap-data.ts, roadmap-data.test.ts, RoadmapPage.tsx, RoadmapPage.test.tsx, 4 archivos de i18n, 4 planes ROADMAP-*, roadmap-maintenance.md, changelog.md

---

## 1. Estado real del roadmap (implementado vs pendiente)

| Feature | Plan | Estado | Notas |
|---------|------|--------|-------|
| **ROADMAP-I18N** — datos internacionalizados | 2026-07-06-roadmap-i18n-data.md | ✅ Completo | Todos los strings visibles viven en keys `roadmap.*` en los 4 diccionarios |
| **ROADMAP-DUAL** — dos roadmaps con toggle | 2026-07-06-roadmap-dual-roadmaps.md | ✅ Completo | `ROADMAP_CURRENT` (4 fases) + `ROADMAP_NEXT` (15 fases). Toggle con `useState`. `getRoadmapDataset()` funciona |
| **ROADMAP-CHANGELOG** — changelog real | 2026-07-06-roadmap-changelog.md | ⚠️ Parcial | Array con 4 entradas. "Changelog completo →" abre URL externa. Pero 3 de 4 entradas son milestones internos, no releases publicados |
| **ROADMAP-FEEDBACK** — panel con enlaces externos | 2026-07-06-roadmap-feedback-panel.md | ✅ Completo | Tipo/destino selectores. Gating por `roadmap.feedback`. `window.open` con URL prefirmada |

### Verificación contra planes

- **ROADMAP-DUAL**: El plan pedía 5 entradas de changelog (dice "últimas 5"); hay 4. Acceptable dado que `docs/changelog.md` solo tiene 2 releases reales + 1 sección histórica.
- **ROADMAP-FEEDBACK**: El plan decía `// TODO: reemplazar form por URL real`. El form sigue con placeholder `"https://forms.gle/TODO-vantare-feedback"` — pendiente real.
- **ROADMAP-I18N**: El plan pedía "test que monte con `locale='en'` y verifique un título en inglés". No se agregó ese test.

---

## 2. Calidad del código y tests

### Tests — 43 tests, todos pasan ✅

| Suite | Tests | Calidad |
|-------|-------|---------|
| `roadmap-data.test.ts` | 25 | Buena: escala de %, snap, datasets, integridad, fake strings |
| `RoadmapPage.test.tsx` | 14 | Buena: toggle, render, links, gated feedback, URL de GitHub |
| `access-gating` (en RoadmapPage.test) | 4 | Buena: paid, tester, blocked, envío GitHub |

**Lo bueno:**
- Tests de integridad detectan strings falsos ("Q4 2026", "+30 widgets", "telemetria completa")
- Test de escala verifica que TODOS los `%` en ambos datasets están en `{0,10,25,50,75,100}`
- Test de gating verifica free → locked, paid → panel, tester → panel, blocked → locked
- Test de envío verifica que `window.open` recibe URL con `title=`, `body=` y el mensaje codificado
- Paridad de keys i18n verificada por `i18n.test.ts` (las 4 locales deben tener las mismas keys)

**Lo mejorable:**
- Los tests de `RoadmapPage` solo corren en locale español (el plan pedía al menos un test con locale "en")
- No hay test para el caso edge: ¿qué pasa si `getRoadmapDataset("current")` se llama con un key inválido?
- No hay test para la URL del form (solo se verifica que GitHub y Discord usan URLs reales)

---

## 3. Hallazgos y bugs

### 🔴 Bugs

**BUG-1: URL del form es un placeholder roto**
- `ROADMAP_FEEDBACK_LINKS.form` = `"https://forms.gle/TODO-vantare-feedback"`
- Un usuario que elija "Formulario" como destino y haga click obtendrá una página 404 de Google
- **Impacto**: Usuario de pago ve una experiencia rota
- **Fix**: Quitar la opción "Formulario" hasta que haya una URL real, o marcar visualmente como "próximamente"

**BUG-2: ProgressBar default fallback roto**
- Línea 43: `const bg = color ?? "from-vantare-red-600 to-vantare-red-400"`
- El fallback es una clase de Tailwind, pero se usa en `linear-gradient(90deg, ${bg})` que espera valores CSS
- Si algún caller no pasa `color`, renderiza `linear-gradient(90deg, from-vantare-red-600 to-vantare-red-400)` = CSS inválido → barra invisible
- **Impacto**: Bajo (todos los callers pasan color explícito), pero es un bug latente
- **Fix**: Cambiar fallback a un valor CSS válido: `"#dc2626, #f87171"`

**BUG-3: ROADMAP_NEXT áreas son idénticas a ROADMAP_CURRENT**
- Ambos datasets tienen las mismas 6 áreas con los mismos IDs y los mismos valores de %
- El plan ROADMAP-DUAL decía "incluir también un set de áreas derivado de las mismas filas [del release index]"
- Las áreas del roadmap NEXT deberían reflejar el scope del siguiente major, no copiar las del beta actual
- **Impacto**: Medio — el progreso global del roadmap NEXT es idéntico al del CURRENT (50%), lo cual es confuso

### 🟡 Hallazgos menores

**DEAD-1: 6 keys i18n definidas pero nunca usadas por `t()`**

| Key | Contexto |
|-----|----------|
| `roadmap.feedback.vote` | Voting no implementado |
| `roadmap.hero.soon` | No hay estado "próximamente" |
| `roadmap.feedback.suggest` | Hero usa `roadmap.hero.suggest`; feedback usa botones específicos |
| `roadmap.feedback.send` | Componente usa `sendGithub`/`sendDiscord`/`sendForm` |
| `roadmap.feedback.cancel` | No hay botón de cancelar |
| `roadmap.changelog.title` | Solo se usa `changelog.eyebrow` |

No son bugs (el test de paridad las mantiene sincronizadas), pero agregan ~200 bytes por locale de texto muerto. Si se reservan para el futuro, documentarlo en un comentario.

**DEAD-2: `clampProgress()` exportada pero nunca llamada en producción**
- Solo se invoca en tests
- Útil como utilidad pública, pero técnicamente dead code en runtime

**DATA-1: Changelog entries 2-4 no son releases reales**
- `hub-v52`, `launcher-lmu`, `roadmap-public` son milestones internos, no versiones publicadas en GitHub
- El `docs/changelog.md` solo tiene v0.1.0.2 y v0.1.0.0 como releases
- La entrada `roadmap-public` (que es el roadmap actual) se lista como "cambio reciente" — es auto-referencial

**DATA-2: `STATUS_LABELS` eliminado correctamente ✅**
- Se reemplazó por `t(\`roadmap.status.${status}\`)` — no queda el objeto muerto

### 🔵 Accesibilidad

| Problema | Ubicación | Severidad |
|----------|-----------|-----------|
| Toggle buttons sin `aria-pressed` o `aria-selected` | Línea 176-188 | Baja |
| `<select>` de tipo feedback sin `<label htmlFor>` | Línea 93-103 | Media |
| `<textarea>` de mensaje sin `<label htmlFor>` | Línea 106-114 | Media |
| Barras de progreso sin `role="progressbar"` ni `aria-valuenow` | `ProgressBar` + barras inline | Baja |
| Phase cards `<article>` sin `aria-label` distinguisher | Línea 304-361 | Baja |

---

## 4. Recomendaciones

### Prioridad Alta (antes de merge)

1. **Fix BUG-1**: Quitar la opción "Formulario" del selector de destinos en `RoadmapFeedback` hasta que haya URL real. O agregar un tooltip/tooltip que diga "Próximamente" y deshabilitar el botón de envío cuando destino=form.

2. **Fix BUG-3**: Revisar las áreas de `ROADMAP_NEXT` — deben tener IDs y progresos diferentes que reflejen el scope del siguiente major (R01-R15), no copiar del beta actual.

3. **Fix BUG-2**: Cambiar el fallback de `ProgressBar` de Tailwind class a valor CSS.

### Prioridad Media

4. **Agregar test con locale "en"** en `RoadmapPage.test.tsx` — el plan ROADMAP-I18N lo exigía y no se implementó.

5. **Agregar `role="progressbar"` y `aria-valuenow`** a las barras de progreso.

6. **Agregar `<label>` a `<select>` y `<textarea>`** del feedback form (usar `htmlFor` + `id`).

7. **Documentar keys dead** con un comentario `// reserved for future: voting panel` o eliminar si no se usará.

### Prioridad Baja

8. **Eliminar `clampProgress` export** si no se planea usar en producción, o moverlo a un archivo de utils.

9. **Corregir `ROADMAP_CHANGELOG` entries** para que solo contenga releases reales publicados, o agregar un comment claro: `// Últimas entradas significativas (no solo releases)`.

10. **Test de URL del form placeholder** — al menos verificar que el test detecta que es un TODO.

---

## 5. Resumen ejecutivo

El trabajo de roadmap es **sólido en arquitectura y estructura** — la separación datos/UI/i18n es correcta, la escala de % está bien enforced, y los tests cubren comportamiento real (gating, toggle, URL generation) no solo rendering. Los 4 planes ROADMAP-* están esencialmente completos.

Los problemas principales son:
- **1 bug funcional** (URL del form rota para usuarios de pago)
- **1 bug de datos** (áreas de ROADMAP_NEXT copiadas del actual)
- **1 bug latente** (ProgressBar fallback roto)
- **6 keys muertas** en i18n (cleanup menor)
- **Déficits de accesibilidad** menores pero fijables

Ninguno es un blocker para merge, pero BUG-1 (form roto) debería resolverse antes de release a usuarios de pago.

**Veredicto**: Aprobar con condiciones — resolver BUG-1 y BUG-3 antes de merge.
