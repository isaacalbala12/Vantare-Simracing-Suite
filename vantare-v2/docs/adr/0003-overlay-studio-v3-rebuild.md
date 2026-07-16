# ADR 0003: Reconstrucción paralela de Overlay Studio V3

- Estado: aceptada
- Fecha: 2026-07-10

## Contexto

Overlay Studio mantiene contratos duplicados entre editor, preview, Desktop y OBS. WidgetStudio fue eliminado y la edición de apariencia, contenido, comportamiento y layout pertenece ahora a un único editor. Los sistemas visuales completos son el pilar del producto.

## Decisión

Construir un núcleo V3 paralelo y retirar el legado después de validar Delta, Standings, Relative y Pedals. Un `WidgetVisualHost` compartido recibe ViewModels funcionales puros y selecciona renderizadores versionados de `vantare-original` o `vantare-crystal`. El perfil V3 separa layout, comportamiento, contenido y visual. Studio mantiene un único borrador global con guardado explícito.

## Consecuencias

- La regla histórica de separación WidgetStudio/LayoutStudio deja de aplicar a V3.
- El legado permanece congelado como referencia y rollback hasta el corte final.
- Los perfiles V0/V2 se migran mediante funciones puras y backups.
- Studio, Desktop y OBS deben compartir host y renderizadores.
- Los diseños se aplican como copias y nunca contienen posición, identidad o z-order.
- La primera entrega termina con Delta, Standings, Relative y Pedals en Original y Crystal.

## Fuera de alcance

Selección múltiple, grupos, widgets adicionales, resoluciones arbitrarias y creación no-code de sistemas visuales pertenecen a expansión.