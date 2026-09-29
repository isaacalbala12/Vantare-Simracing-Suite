# Corpus real de Assetto Corsa Competizione

| Fichero | Contenido | SHA-256 |
|---|---|---|
| `acc-sesion-udp-20260929.tar.gz` | 120 s de una sesión con IA (ACC 1.7, shared memory 1.9): 47 651 physics, 7 917 graphics, 1 static y 134 901 datagramas del broadcasting UDP | `422481dc88b1e7f9cb9ebaf025cc615d08453bea8fded36ca881b996ba386071` |

Grabado el 2026-09-29 con `vantare-grabar-acc` (`native/runtime/src/bin/vantare-grabar-acc.rs`) en el PC de desarrollo. Dentro: `shm.bin`, `udp.bin` y `manifest.json` (`vantare.acc-temporal-v1`, con el SHA-256 de cada fichero). Formato de los registros: ver la cabecera de la grabadora.

Para regenerarlo: activar el broadcasting en `Documentos\Assetto Corsa Competizione\Config\broadcasting.json` (puerto UDP y `connectionPassword`), entrar en una sesión y ejecutar `vantare-grabar-acc --segundos 120 --pista <circuito> --tipo <practica|carrera>`.
