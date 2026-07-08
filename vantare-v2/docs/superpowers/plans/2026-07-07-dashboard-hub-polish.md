# Plan: Dashboard Hub Polish

**Fecha:** 2026-07-07  
**Alcance:** `DashboardPage.tsx` + componentes relacionados  
**No se toca:** Backend Go, Supabase/Auth, Calendar, LayoutStudio, runtime OBS, dependencias, position/x/y/w/h, WidgetStudio

---

## Cambios solicitados

### 1. Quitar borde blanco de las cards de "Próximas carreras"
**Archivo:** `frontend/src/hub/calendar/CalendarHeroUpcomingPanel.tsx`  
**Problema:** Las 3 TierCard tienen `border border-line` que crea un borde blanco/gris visible.  
**Fix:** Cambiar `border border-line` por `border border-white/[0.03]` (casi invisible, consistente con `card-sleek`) o eliminar `border` completamente si el diseño lo permite.  
**Archivos:** `CalendarHeroUpcomingPanel.tsx` (líneas 71, 101)

### 2. Alinear la línea roja de "WEC Weekly" a la izquierda
**Archivo:** `frontend/src/hub/calendar/CalendarHeroUpcomingPanel.tsx`  
**Problema:** El div rojo `absolute left-0` está dentro de un contenedor con `overflow-hidden` y `rounded-xl`, lo que puede causar que la línea no sea visible en los bordes redondeados.  
**Fix:** Asegurar que la línea roja esté posicionada correctamente. Opciones:
- Opción A: `left-0 top-0 bottom-0 w-1` (ya está así — verificar que `overflow-hidden` no la recorte)
- Opción B: Usar `border-left` en el contenedor en vez de un div absoluto
**Archivos:** `CalendarHeroUpcomingPanel.tsx` (línea 197)

### 3. Eliminar el panel "Overlay activo"
**Archivo:** `frontend/src/hub/pages/DashboardPage.tsx`  
**Problema:** El panel `ActiveOverlayCard` no es necesario en el dashboard.  
**Fix:** Eliminar el import y el uso de `ActiveOverlayCard` en `DashboardPage.tsx`.  
**Archivos:** `DashboardPage.tsx` (líneas 1, 60-64)

### 4. Reemplazar panel "Ingeniero" con animación de features del roadmap
**Archivo:** `frontend/src/hub/pages/DashboardPage.tsx`  
**Problema:** El panel de "Ingeniero Vantare · Spotter IA" (bloque purple) debe reemplazarse por una animación simple con fade que muestre todas las features en las que se está trabajando.  
**Solución:**
- Crear un componente `DashboardFeatureCarousel` que:
  - Lee las áreas `in-progress` del `ROADMAP_CURRENT.areas`
  - Muestra una a una con animación CSS `fade-in-up` / `fade-out`
  - Ciclo automático cada 4-5 segundos
  - Muestra: icono/título del área, barra de progreso, badge de status
  - Diseño minimalista sobre fondo glass-panel
- Eliminar el bloque purple inline del DashboardPage
- Importar el nuevo componente
**Archivos:** `DashboardPage.tsx` (líneas 66-120), nuevo archivo `DashboardFeatureCarousel.tsx`

### 5. Eliminar el panel "Ingeniero" (ya cubierto por #4)
Ya eliminado en el paso anterior.

### 6. Eliminar "Acciones rápidas" y "Última actividad"
**Archivo:** `frontend/src/hub/pages/DashboardPage.tsx`  
**Problema:** Los paneles `QuickActions` y `LastActivityCard` no son necesarios.  
**Fix:** Eliminar imports y uso de ambos componentes, y eliminar el grid de 3 columnas que los contiene.  
**Archivos:** `DashboardPage.tsx` (líneas 2-3, 215-219)

### 7. Renovar "Novedades Vantare" — fuente de datos
**Archivo:** `frontend/src/hub/components/V52InfoCard.tsx` + `DashboardPage.tsx`  
**Problema:** Las novedades están hardcodeadas en el JSX. Necesitan una fuente de datos dinámica.

**Opciones debatidas:**

#### Opción A: Changelog de GitHub (recomendada)
- Usar `ROADMAP_CHANGELOG` que ya existe en `roadmap-data.ts`
- Mostrar las últimas 4 entradas del changelog
- Ventaja: ya tiene datos, solo hay que cablear
- Desventaja: sincronización manual (ya documentada en `docs/roadmap-maintenance.md §5`)

#### Opción B: Script simple de fetch
- Script que haga fetch a `https://api.github.com/repos/.../releases` o `/commits`
- Mostrar los últimos releases/commits como novedades
- Ventaja: automático
- Desventaja: requiere red, puede fallar, rate limits

#### Opción C: Datos estáticos actualizados por script
- Mantener un JSON estático (`novedades.json`) que se actualice con un script
- El script lee commits/releases y genera el JSON
- Ventaja: sin dependencia de red en runtime
- Desventaja: requiere ejecutar el script

**Recomendación:** Opción A — usar `ROADMAP_CHANGELOG` que ya existe. Es el más simple, no requiere red, y los datos ya están ahí.

**Fix:**
- En `DashboardPage.tsx`, reemplazar los 4 `V52InfoCard` hardcodeados por un map sobre `ROADMAP_CHANGELOG.slice(0, 4)`
- Mantener el grid `sm:grid-cols-2`
- Cada entrada ya tiene `type`, `title`, `body` que mapean directamente a `V52InfoCard`
**Archivos:** `DashboardPage.tsx` (líneas 186-211)

---

## Orden de ejecución

| Paso | Cambio | Archivos | Dependencias |
|------|--------|----------|--------------|
| 1 | Quitar borde cards | `CalendarHeroUpcomingPanel.tsx` | Ninguna |
| 2 | Alinear línea roja weekly | `CalendarHeroUpcomingPanel.tsx` | Ninguna |
| 3 | Eliminar ActiveOverlayCard | `DashboardPage.tsx` | Ninguna |
| 4 | Eliminar QuickActions + LastActivityCard | `DashboardPage.tsx` | Ninguna |
| 5 | Eliminar panel Ingeniero, crear DashboardFeatureCarousel | `DashboardPage.tsx`, nuevo `DashboardFeatureCarousel.tsx` | roadmap-data.ts |
| 6 | Cablear Novedades a ROADMAP_CHANGELOG | `DashboardPage.tsx` | roadmap-data.ts |

Pasos 1-4 son independientes y pueden ejecutarse en paralelo.  
Pasos 5-6 dependen de roadmap-data.ts (ya existe, sin cambios).

---

## Tests esperados

- `pnpm --dir frontend test` — todos los tests existentes deben pasar
- Tests de `DashboardPage.test.tsx` si existen, actualizar
- Verificar que `DashboardFeatureCarousel` tiene tests unitarios
- `pnpm --dir frontend build` — debe compilar sin errores
- `pnpm --dir frontend lint` — sin errores nuevos

---

## Verificación manual

1. Abrir el Hub en modo dev (`pnpm --dir frontend dev`)
2. Verificar que las cards de "Próximas carreras" no tienen borde blanco visible
3. Verificar que la línea roja de "WEC Weekly" está alineada a la izquierda
4. Verificar que el panel "Overlay activo" ya no existe
5. Verificar que "Acciones rápidas" y "Última actividad" ya no existen
6. Verificar que el bloque purple de Ingeniero fue reemplazado por el carousel de features
7. Verificar que "Novedades Vantare" muestra datos del changelog
8. Verificar que el carousel hace fade automático entre features

---

## Notas

- `border-line` no tiene definición CSS en el proyecto — es una clase muerta. Reemplazarla por un valor válido o eliminarla.
- `cal-bar` tampoco tiene definición CSS — es otra clase muerta. No afecta el visual porque el div ya tiene `h-2` y `style={{ background: ... }}`.
- `ActiveOverlayCard.tsx`, `QuickActions.tsx`, `LastActivityCard.tsx` pueden quedarse en el proyecto (otros componentes podrían usarlos). Solo se eliminan los imports de `DashboardPage.tsx`.
