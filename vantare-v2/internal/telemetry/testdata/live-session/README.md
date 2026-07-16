# Fixtures de sesión live LMU

Este directorio reserva el contrato para fixtures reales y anonimizados de Telemetry Core. ISA-24 no persiste una captura binaria: la ejecución con LMU encendido se realizó en menú, sin vehículos ni sesión de pista útil.

## Reglas de aceptación

Cada futura captura debe incluir:

- versión/build de LMU;
- estado: menú, pits, outlap, tráfico, bandera y cierre;
- fecha y zona horaria;
- SHA del lector;
- fuente exacta por dato: shared memory o REST;
- unidades verificadas;
- epoch, secuencia y capturedAt;
- hash del archivo;
- procedimiento reproducible;
- confirmación de anonimización.

No se aceptan nombres reales, IDs de cuenta, rutas privadas, tokens, payloads auth ni contenido no necesario. Los nombres de pilotos/equipos deben pseudonimizarse de forma estable dentro del fixture.

## Prohibiciones

- No usar simulator, replay o mock como evidencia de dato LMU observado.
- No abrir un segundo reader productivo para capturar.
- No commitear dumps sin revisar tamaño, licencia y privacidad.
- No deducir orientación, posición, unidades o capabilities desde una heurística.
- No presentar ausencia de campo como valor cero observado.

## Set mínimo futuro

1. LMU apagado: disconnected sin datos ficticios.
2. Menú: shared memory/REST disponibles pero sin vehículo.
3. Pits: jugador, sesión y vehículo estables.
4. Outlap: transición de epoch/estado y primeras vueltas.
5. Tráfico: jugador, rivales, orientación, velocidad y geometría Spotter.
6. Cierre de LMU: stale → disconnected, sin goroutines ni handles colgados.

La captura y el harness de observabilidad Wails/teardown se siguen en ISA-87. Hasta disponer de evidencia real versionada, estos fixtures permanecen documentales.
