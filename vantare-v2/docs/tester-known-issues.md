# Incidencias y límites por versión

Las incidencias se consultan en las notas de la release concreta y su tarea de seguimiento. Este archivo no mantiene un segundo backlog ni atribuye a la build actual fallos de versiones antiguas.

## Límites que debe considerar una prueba

- La telemetría live depende del simulador y de la disponibilidad de cada campo. `-live=false` deja la fuente desconectada.
- OBS local requiere el mismo PC; el servidor no admite bind LAN.
- Un harness o una captura de interfaz no validan LMU, Wails, audio ni permisos reales.
- Terminar una PR no implica que esté integrada en el canal instalado.

Antes de reportar, anotar versión/canal, pantalla, pasos y resultado. [Proceso de feedback](tester-feedback-process.md).

## Incidencias históricas

Los problemas de login de `v0.1.0.0` y las previsiones de hotfix del informe anterior son historia de aquella entrega, no bloqueos actuales confirmados. No seguir esperando una versión basándose en ese texto.

[Versión anterior y evidencia fechada](https://github.com/isaacalbala12/Vantare-Simracing-Suite/blob/60b47b7c7e7550faf0c532fdf3dbc6f32cfd516c/vantare-v2/docs/tester-known-issues.md).
