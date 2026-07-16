# LMU Live Capture — Setup and Procedure

> **Objetivo:** cerrar los 10 gaps de la matriz LMU-01..48 que
> requieren evidencia en vivo (tyre temp/wear, engine temp, battery,
> DRS, multiclass, opponents, sector times, driver stint, mYellowFlagState,
> mDentSeverity, etc.).
>
> **Tiempo estimado:** 5-10 minutos en pista.
>
> **Output:** 3 ficheros `.bin` (raw mmap) + opcionalmente 1-2 screenshots
> para referencia visual.

## Requisitos

- **Le Mans Ultimate** ejecutándose en Windows.
- **Python 3.8+** instalado (cualquier versión, sin dependencias externas
  más allá de la stdlib).
- Sesión activa en pista (puede ser práctica vacía — el mmap se popula
  desde que entras a la pista, no hace falta tráfico).

## Procedimiento (3 pasos)

### Paso 1 — Instalar el script de captura

El script `scripts/lmu-capture/capture.py` está en este worktree. Cópialo
a tu máquina Windows (o clónalo en una ruta local). No requiere
instalación — Python puro.

### Paso 2 — Posicionar el coche en pista

- Inicia Le Mans Ultimate.
- Carga cualquier circuito en modo práctica o testing.
- Sal a pista y conduce un poco (o quédate parado en boxes, da igual
  para los offsets que buscamos — solo necesitamos que el mmap esté
  vivo y `mGamePhase >= 5`).
- **No cierres LMU** durante la captura. El script abre `LMU_Data` con
  `OpenFileMappingW` y lo lee en vivo.

### Paso 3 — Ejecutar el script

```powershell
# Desde el directorio del worktree o donde hayas copiado el script:
python scripts/lmu-capture/capture.py --out docs/lmu-capture/
```

El script:

1. Detecta automáticamente si `LMU_Data` está mapeado (avisa si LMU no
   está abierto).
2. Lee 3 snapshots del mmap con ~1 segundo entre cada uno. Esto captura
   el estado base de la sesión.
3. Escribe 3 ficheros en `docs/lmu-capture/`:
   - `snapshot-00-pits.bin` — sesión en boxes o parado
   - `snapshot-01-outlap.bin` — primer snapshot en pista
   - `snapshot-02-driving.bin` — tercer snapshot tras movimiento
4. Genera `capture-report.md` con:
   - Confirmación de que LMU estaba vivo
   - Bytes crudos de los offsets sospechosos (los que el parser no
     sabe leer aún) en formato hex + decimal
   - Sugerencias de qué buscar cuando los valores cambien entre
     snapshots

## Qué hace el script con cada snapshot

1. Lee 324.820 bytes (LMU_Data) en memoria.
2. **Bloque scoring** (offsets 1632-2180):
   - `mNumVehicles` (offset 1736) — confirma cuántos coches en sesión.
   - `mGamePhase` (offset 1740) — verifica que la sesión está activa
     (5 = green flag, 6 = FCY, etc.).
   - `mYellowFlagState` (offset a determinar) — el byte que el script
     reportará a múltiples offsets candidatos para que identifiquemos
     el correcto.
   - `mSectorFlag[3]` — 3 bytes a offsets candidatos.
3. **Bloque telemetry del jugador** (slot 0, offset base 128468):
   - Cada campo que CC lee (`mDentSeverity[8]`, `mDetached`,
     `mLastImpactET`, `mEngineWaterTemp`, `mEngineOilTemp`,
     `mElectricBatteryPercentage`, brake temp 4 ruedas, tyre temp 4
     ruedas, tyre wear 4 ruedas) se reporta a múltiples offsets
     candidatos que el script conoce de CC.

4. **Vehículos** (slot 0-5, offset base 2192):
   - `mInPits` por vehículo (offset 198 dentro del slot) — confirma
     que el player está en boxes o en pista.
   - `mBestLapTime` por vehículo (offset 144 dentro del slot) — base
     para OpponentMessages.
   - `mVehicleClass` por vehículo — base para MulticlassWarnings.

## Resultado esperado

Después de ejecutar, `docs/lmu-capture/` contendrá:

```
docs/lmu-capture/
├── README.md
├── snapshot-00-pits.bin       (324820 bytes)
├── snapshot-01-outlap.bin     (324820 bytes)
├── snapshot-02-driving.bin    (324820 bytes)
└── capture-report.md          (resumen legible)
```

`capture-report.md` será la fuente de verdad que yo usaré para
implementar los features G1.3, G1.4, G2.2-G2.10. El reporte indica
qué offset corresponde a qué campo según cómo cambian los bytes entre
snapshots (ej. `mYellowFlagState` debería cambiar entre green flag y
FCY; `mDetached` debería cambiar entre coche intacto y coche dañado).

## Después de la captura

1. Commit los 4 ficheros al worktree (yo te indico el commit message).
2. Yo analizo `capture-report.md`, identifico los offsets reales
   comparando cómo cambian entre snapshots, y:
   - Actualizo `internal/telemetry/lmu/offsets.go` con las nuevas
     constantes.
   - Actualizo `internal/engineer/lmu/parser.go` para leer los campos
     nuevos.
   - Marco cada gap como `CONFIRMADO` o `PARCIAL` en la matriz LMU-01..48.
3. Implemento las features G1.3, G1.4, G2.2-G2.10 con tests.
4. Code review completo.
5. Avanzamos a G3.

## Si el script no funciona

Si el script falla con "is Le Mans Ultimate running?" o "Access
denied", prueba:

1. **LMU no está abierto**: ábrelo y sal a pista antes de ejecutar.
2. **Permisos**: ejecuta el script como administrador (PowerShell como
   admin, o `sudo python3` en Unix). El file mapping global de
   Windows puede requerirlo en algunos setups.
3. **Python 32 vs 64 bits**: usa la misma arquitectura que Python.
   Para mmap de 324KB no es crítico, pero por consistencia.
4. **Versión de LMU**: si tu versión tiene un tamaño de mmap diferente
   a 324820 bytes, el script fallará con un mensaje claro. Avísame y
   ajustamos.

## Privacidad

El mmap LMU contiene telemetría de la sesión activa (temperaturas,
posición, etc.). Los snapshots pueden capturar info de tu setup o
coche. Si no quieres commitear los binarios completos (324KB c/u),
puedes commitear solo `capture-report.md` y dejarme a mí el mapeo
desde el doc. Indícame qué prefieres.