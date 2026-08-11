> **Plan status: historical**
> Snapshot conservado como evidencia. No autoriza ejecución. Las referencias a
> `docs/current-plan.md`, `develop`, `refactor`, ramas, bases o siguientes
> acciones son históricas y quedan sustituidas por Linear y Git.

# Miniplan: Inventario tecnico del Relative actual

## Objetivo

Inventariar el `Relative` actual antes de implementar personalizacion beta.

Este plan no implementa features. Su resultado es un informe tecnico que permita decidir si el primer corte configurable puede guardarse con el formato actual o si antes hace falta schema v2.

## Contexto

Documentos obligatorios:

- `AGENTS.md`
- `docs/current-plan.md`
- `docs/beta-widget-system-spec.md`
- `docs/product-widget-customization.md`

Decisiones relevantes:

- `Relative` es el primer widget para validar el sistema beta.
- El template inicial debe partir del Relative actual de Vantare.
- Las columnas base del primer Relative configurable son las actuales.
- `bestLap` y `lastLap` deben estar disponibles desde el primer Relative configurable.
- El primer corte real debe guardar cambios.
- Si el formato actual no soporta persistencia limpia, se debe parar y proponer miniplan de schema v2.

## Alcance incluido

El worker debe inspeccionar y documentar:

- componente(s) actuales que renderizan `Relative`;
- props/config actuales del widget;
- columnas actuales visibles;
- datos actuales usados por cada columna;
- fuentes de telemetria implicadas;
- formato actual de tiempos, gaps, nombres y clases;
- estilos actuales relevantes;
- tests existentes relacionados;
- como se guarda actualmente configuracion de widgets/perfiles;
- si el formato actual permite guardar slots, columns o column groups sin hacks;
- que archivos se tocarian en un futuro primer corte.

## Alcance excluido

No implementar:

- slots editables;
- columnas nuevas;
- `bestLap`;
- `lastLap`;
- schema v2;
- migracion;
- cambios visuales;
- refactors.

No modificar codigo salvo que sea estrictamente necesario para ejecutar una inspeccion. Si hace falta tocar codigo, detenerse y explicarlo.

## Archivos probables a leer

El worker debe localizar rutas reales con `rg`.

Pistas iniciales:

- `frontend/src/hub/preview/`
- `frontend/src/hub/overlays/`
- `frontend/src/lib/`
- `configs/example-racing.json`
- `internal/app/`
- tests de previews/widgets/layout.

No asumir nombres de archivo sin comprobarlos.

## Tareas

1. Revisar estado del repo
   - Ejecutar `git status --short`.
   - Identificar cambios abiertos y no mezclarlos con este inventario.

2. Localizar implementacion del Relative
   - Buscar `relative`, `Relative`, `PreviewWidgetFrame`, `WidgetPreview`, `gap`, `interval`.
   - Listar archivos relevantes.

3. Inventariar render actual
   - Que columnas o partes muestra.
   - Que datos usa cada parte.
   - Que formato aplica.
   - Que estilos o clases relevantes usa.

4. Inventariar datos
   - Que datos vienen de mock.
   - Que datos vienen de live/shared memory.
   - Que datos vienen de REST API si aplica.
   - Que datos faltan para `bestLap` y `lastLap`.

5. Inventariar persistencia
   - Como se guarda hoy un perfil.
   - Donde viven props/config del widget.
   - Si hay sitio limpio para guardar template, variant, slots, columns o column groups.
   - Si hace falta schema v2 antes de guardar cambios.

6. Inventariar tests
   - Tests actuales que protegen render de Relative.
   - Tests que faltan antes del primer corte configurable.

7. Escribir informe
   - Crear `docs/relative-current-inventory.md`.
   - Incluir conclusiones y recomendacion.

## Formato del informe

El informe debe tener estas secciones:

```md
# Relative Current Inventory

## Resumen
## Archivos revisados
## Render actual
## Columnas actuales
## Datos por columna
## Formatos actuales
## Estilos relevantes
## Fuentes de datos
## Persistencia actual
## Tests existentes
## Huecos detectados
## Riesgos
## Recomendacion
## Siguiente miniplan recomendado
```

## Criterios de aceptacion

- No se modifica codigo de producto.
- Existe `docs/relative-current-inventory.md`.
- El informe identifica columnas actuales del Relative.
- El informe dice si se puede persistir primer corte sin schema v2.
- El informe identifica archivos probables para el siguiente miniplan.
- El informe lista tests existentes y tests faltantes.

## Checks

Como es documentacion/inventario:

- No es obligatorio ejecutar build.
- No es obligatorio ejecutar tests.
- Si se ejecuta algun test para entender comportamiento, reportarlo.

## Prompt para worker

```text
Actua como worker de inventario tecnico en `vantare-v2`.

Objetivo:
Ejecutar el plan `docs/superpowers/plans/2026-06-21-relative-current-inventory.md`.

Reglas:
- Lee `AGENTS.md`.
- Lee `docs/current-plan.md`.
- Lee `docs/beta-widget-system-spec.md`.
- Lee `docs/product-widget-customization.md`.
- No implementes features.
- No modifiques codigo.
- No hagas refactors.
- No cambies schema.
- No anadas dependencias.
- Usa `rg` para localizar implementacion real.
- Si encuentras contradiccion entre documentos y codigo, reportala.

Entrega:
- Crear `docs/relative-current-inventory.md`.
- Responder en espanol con:
  - archivos revisados,
  - columnas actuales encontradas,
  - si hace falta schema v2 antes del primer corte,
  - riesgos,
  - checks ejecutados o no ejecutados.
```
