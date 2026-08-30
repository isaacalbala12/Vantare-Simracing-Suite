# ISA-894 — diagnóstico de la primera S1 ON real

## Captura

- Sesión: `S1`, fase `ON`, Spa práctica, jugador monitorizando desde boxes e IA
  rodando.
- Build: `bin/vantare-sesiones.exe`, licenciada, construida desde
  `nightly@d3ada526`.
- Inicio registrado: `2026-08-30T16:57:34.976Z`.
- La captura terminó a los `0,20 min` por el acceso estricto a un diagnóstico
  opcional del target Hub. Solo hay dos frames shadow; no es una sesión S1
  publicable.
- Contadores antes del fallo: 3 proyecciones V1, 2 snapshots V2, 2 frames
  shadow live y 6 mismatches live.

## Clasificación de los seis mismatches

| Feature/campo | Conteo | Clasificación | Motivo |
| --- | ---: | --- | --- |
| `player-instruments.speedKph` | 2 | `exact` | `pedals` es exacto y el comparador aplica tolerancia numérica `3.6e-6`. |
| `standings.rows[].currentLapText` | 2 | `exact` dentro de cobertura `partial` | La regla de lista lo compara contra `completedLaps`; no figura entre los gaps declarados. |
| `standings.rows[].lastLapText` | 2 | `exact` dentro de cobertura `partial` | La regla de lista lo compara contra `lastLapSeconds`; no figura entre los gaps declarados. |

`standings` es `partial` por número, equipo/color, compuesto, mejor vuelta e
intervalo, pero eso no convierte en parciales sus campos comparables. Por tanto
el colector no reclasifica ni descuenta estos seis contadores.

## Causa

Los contadores corresponden a divergencias del comparador, no demuestran una
diferencia de valor entre los payloads V1 y V2 de un mismo estado canónico:

1. `speedKph`: `CachedProjector` actualiza `FrameV2.sequence` en cada tick,
   aunque la sección `player` se reutilice durante su intervalo de cadencia
   (50 ms por defecto). El shadow empareja por `epoch:sequence`; durante la IA
   en movimiento compara así la proyección V1 actual con una velocidad V2 de
   un tick anterior bajo el cursor actual. El golden sin cadencia no reproduce
   el fallo porque allí ambos valores nacen del mismo snapshot.
2. `currentLapText`: el contenido fijo del shadow usa las columnas por defecto,
   donde `currentLap` está deshabilitada. El builder V1 solo llena valores de
   columnas habilitadas y deja `currentLapText=""`; el builder V2 llena el campo
   desde `row.laps` aunque la columna esté oculta. El comparador compara ese
   campo no mostrado.
3. `lastLapText`: cuando aún no hay última vuelta, el formatter V1 devuelve
   `"-"` y el builder V2 devuelve `"—"`. Ambos representan ausencia, pero la
   comparación de texto los trata como valores diferentes. La cruda conserva
   solo el nombre y conteo agregado, no los valores observados; esta rama causal
   queda demostrada por el código de ambos formatters, no por un par de valores
   publicado en la captura abortada.

## Veredicto y stop condition

La captura no autoriza el corte 2. Los campos siguen clasificados como exactos.
El seguimiento del PR #955 añade `sectionMask` al frame: cada bit declara qué
sección se reconstruyó desde el `epoch/sequence` publicado y el shadow registra
como `cached-section` no comparable cualquier sección memoizada. También omite
`currentLapText` en ambos ViewModels cuando la columna está oculta y normaliza
solo la ausencia de última vuelta (`""`, `"-"`, `"—"`); vueltas reales distintas
siguen siendo mismatch exacto. Falta repetir S1 ON completa y obtener cero
mismatch exacto real por ventana. Hasta esa evidencia el corte 2 permanece
bloqueado.
