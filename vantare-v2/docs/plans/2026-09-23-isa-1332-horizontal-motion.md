# Horizontal Standings: movimiento discreto

Isaac confirma Relative y Pedals y solicita las animaciones que faltan en
Horizontal Standings. Se conserva su decisión de intensidad intermedia para
Standings, orientada a conducción. Seguimiento principal en
[Asana](https://app.asana.com/1/1210926733859493/project/1218742976551956/task/1218756818225223),
puente técnico [#1332](https://github.com/isaacalbala12/Vantare-Simracing-Suite/issues/1332).
Base nightly `e6d7d2b5`, rama `vantareapp/isa-1332-horizontal-motion`.

## Alcance

El renderer productivo Eficiencia de `broadcast-tower` conserva su diseño y
anima las tarjetas horizontalmente al cambiar posiciones. Entradas y salidas
usan fundidos breves; la ganancia/pérdida de posición tiene una señal tenue.
Los números, el bloque de sesión y el bloque de datos no reciben pulsos.
No se incorporan eventos sin datos visibles, dependencias ni nueva telemetría.

La identidad procede del ID canónico del piloto, nunca de su posición o dorsal.
Los cambios exclusivamente numéricos no deben iniciar animaciones, temporizadores
ni lecturas de geometría. Las transiciones interrumpidas, la reentrada, los modos
de movimiento y los cambios de sesión/fuente/geometría deben limpiar efectos y
mantener una sola tarjeta por identidad. El movimiento respeta la escala del
host compartido; Workshop utiliza el mismo renderer que Studio/Desktop/OBS.

## Orquestación y comprobación

GPT-6 Sol implementa renderer, ViewModel y pruebas en su worktree; GPT-6 Luna
prepara las escenas en otro. El orquestador compone, revisa, documenta y publica
un candidato con revisión independiente. No se desarrolla sobre el preview vivo.

Workshop ofrece una secuencia completa y escenas focales de cambio de posición,
inversión rápida, salida/reentrada y cifras que cambian sin movimiento. Los
pasos describen pilotos reales y cambios visibles. Se comprueban práctica,
clasificación y carrera, manteniendo los ajustes aceptados de otros widgets.

Pruebas: identidad DOM, reordenación, interrupciones y presencia, modos y escala,
100 actualizaciones numéricas sin trabajo adicional de animación; escenas y ruta
real del harness. Ejecutar tipos, build, lint y ratchet sin modificar su política.
La evidencia automatizada no sustituye la aceptación visual de Isaac ni una prueba
física en Windows/OBS. La entrega permanece En curso hasta su confirmación.

Roadmap: únicamente `milestones:functional-widget-design`; regenerar el JSON desde
la base confiable. Publicar rama/PR draft no autoriza merge ni promoción de canal.
