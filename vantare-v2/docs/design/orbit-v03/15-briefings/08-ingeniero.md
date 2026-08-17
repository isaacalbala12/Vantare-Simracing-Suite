# Briefing 08 · Ingeniero (`?view=ingeniero`)

## Objetivo
Portar `EngineerPage.tsx` / `engineer/*` a Orbit: módulos, voz, salidas por categoría y radio real (Telemetry Core), manteniendo el contrato de configuración existente.

## Estructura (`height:100%`)
- Cabecera: eyebrow "Telemetry Core · en directo", h2 "Ingeniero Vantare", lead; acciones: "Probar voz" (ghost con icono) + `SubtleStatus ok` "LMU · 15 Hz" (o el estado real de la fuente).
- **Módulos** (fila de 4 tarjetas `eng-mod`, gap `--space`): Ingeniero de pista · Spotter · Subtítulos · Estrategia en vivo (*Próximamente*, toggle deshabilitado). Icono 44 (degradado de marca si activo), título 14/700, descripción 12, `Toggle`.
- Grid `460px | 1fr` (`flex:1; min-height:0`):
  - Izquierda: **Voz** (`Surface`: voz del sistema `Select`, Volumen `Fader`, Atenuar el juego `Toggle`, Sensibilidad del spotter `Seg` Conservadora/Normal/Agresiva) · **Salidas por categoría** (`Surface`: filas Spotter/Combustible/Penalizaciones/Vueltas/Diferencias/Boxes con punto de color y `Seg` A+V/V/A/Off, mono, min 44px). Filas 50px.
  - Derecha: **Radio** (`Surface fill`: cabecera con `Seg` Todo/Spotter/Ingeniero + meta de sesión; feed `rf` con hora mono, icono S/I (coral/cian; ámbar aviso), título 13.5/650 + detalle 12 elipsis, salida `A·V`; scroll interno; pie con nota y Exportar).
- Sin contexto en la columna (muestra los bloques persistentes).

## Comportamiento
- Toggles y salidas escriben en la configuración real del Ingeniero; "Probar voz" reproduce con la voz/volumen elegidos.
- El feed muestra los mensajes reales del runtime en tiempo real (más reciente arriba); filtro por origen; vacío honesto si no hay sesión ("Sin mensajes de sesión · aparecerán cuando el runtime emita").

## Criterios de aceptación
- [ ] Sin scroll de página a 1080; el feed se desplaza dentro.
- [ ] Salidas por categoría reflejan y persisten el estado real; los módulos apagados atenúan su icono.
- [ ] `visual:engineer-radio` actualizado; captura ≈ `evidence/ingeniero.png`.

## Referencias
`06 § Ingeniero`, `04` (Seg, Toggle, Fader, Surface), `14 engineer.*`, `docs/engineer/*`, `docs/engineer-radio-overlay-spec.md`.
