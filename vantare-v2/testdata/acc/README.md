# Corpus real de Assetto Corsa Competizione

| Fichero | Contenido | SHA-256 |
|---|---|---|
| `acc-sesion-udp-20260929.tar.gz` | 120 s de una sesión con IA (ACC 1.7, shared memory 1.9): 47 651 physics, 7 917 graphics, 1 static y 134 901 datagramas del broadcasting UDP | `422481dc88b1e7f9cb9ebaf025cc615d08453bea8fded36ca881b996ba386071` |

Grabado el 2026-09-29 con `vantare-grabar-acc` (`native/runtime/src/bin/vantare-grabar-acc.rs`) en el PC de desarrollo. Dentro: `shm.bin`, `udp.bin` y `manifest.json` (`vantare.acc-temporal-v1`, con el SHA-256 de cada fichero). Formato de los registros: ver la cabecera de la grabadora.

Para regenerarlo: activar el broadcasting en `Documentos\Assetto Corsa Competizione\Config\broadcasting.json` (puerto UDP y `connectionPassword`), entrar en una sesión y ejecutar `vantare-grabar-acc --segundos 120 --pista <circuito> --tipo <practica|carrera>`.

## Fase 6 (ISA-1431)

Corpus intacto: el mismo hash y 190 308 observaciones admitidas; tres physics
rasgadas descartadas y contadas. No se añadieron capturas físicas.
El test obligatorio contrasta graphics cruda y ocho familias de proyección
neutrales, además de DTO v4. Vectores en `native/runtime/tests/acc/` son
explícitamente sintéticos; no sustituyen ACC en marcha.

Desde `native/`, reproducir con jobs=2 y sin red:
`cargo test --offline -p vantare-runtime --test acc_conformance -j 2 -- --nocapture`.
Los dos bloqueos del núcleo se reproducen (FAIL esperado) con
`cargo test --offline -p vantare-runtime --lib -j 2 completion_tests -- --ignored --nocapture`.

Capturas pendientes y condiciones exactas:
[microplan de fase 6](../../docs/superpowers/plans/2026-09-30-fase-6-acc-completo.md).
Se necesitan repostaje/consumo, jugador en pista, estados/banderas/MP y >5 min
de broadcasting con pausas/reinicio. Nivel/capacidad de fuel no tienen unidad
en litros demostrada y no se publican como tales. No aceptar fase completa
solo por el corpus de práctica con jugador parado.
