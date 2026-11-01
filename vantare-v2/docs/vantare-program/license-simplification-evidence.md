# Simplificación del recorrido de licencias — #1827 / VANTA-126

Base de A: `056ec9d9487353a24b017c11eed287b57f3cf149` (pasos 0–10 integrados).
Rama `vantareapp/isa-1827-simplificar-rights`. Target aislado
`D:/VantareServer/targets/isa-1827-s`. Logs fuera del repo en
`D:/VantareServer/evidence/isa-1827-s-*`.

## Medición reproducible

Desde la raíz Git:

```powershell
python vantare-v2/native/scripts/license-production-lines.py --ref 056ec9d9487353a24b017c11eed287b57f3cf149 > antes.json
python vantare-v2/native/scripts/license-production-lines.py > despues.json
```

El JSON conserva el número por fichero y por crate, y dos totales independientes:
todos los fuentes de services/runtime/hub/ipc y un perímetro fijo del recorrido
(constante `LICENSE` del script). Cuenta líneas físicas, incluidos comentarios y
blancos, de fuentes Rust rastreados bajo `src`; excluye directorios y archivos de
tests/fixtures, módulos externos exclusivos de test y elementos `cfg(test)` o
`cfg(all(test, ...))`. Conserva variantes de plataforma y features de producción.
No cuenta ejemplos, tests de integración, documentación ni este script.
No equivale a líneas compiladas ni a las estimaciones parciales anteriores:
no se atribuye todo un crate al recorrido de licencias. Los movimientos entre
crates se comparan también por el total conjunto, para no aparentar reducción.

Resultado A (mismo script y perímetro en ambos árboles):

- Services: **11.349 → 11.161** (−188).
- Runtime: **18.392 → 18.370** (−22).
- Hub: **73.482 → 73.482**; IPC: **6.316 → 6.316**.
- Total de los cuatro crates: **109.539 → 109.329** (−210).
- Perímetro del recorrido, incluido Store y sus consumidores:
  **15.077 → 14.867** (−210). Por crate: services 6.823 → 6.635,
  runtime 1.892 → 1.870, hub 5.104 → 5.104, ipc 1.258 → 1.258.
- Ficheros productivos reducidos: `rights/mod.rs` 518 → 496;
  `license.rs` 416 → 295; `license/authority.rs` 563 → 554;
  `license/installation.rs` 83 → 25. El resto permanece igual según el JSON.

Los JSON completos, incluidos todos los ficheros, están en
`isa-1827-s-base.json` y `isa-1827-s-after-a.json` bajo el directorio externo
de evidencia. El script se comprobó con cuatro muestras: módulo test,
cfg test/plataforma, feature también productiva y campo test dentro de struct.

## Corte A — v1 como único formato

Decisión 5 de ADR 0102: se retiran JWS/v2, la clave privada de instalación,
su generación y prueba de enrollment y el vencimiento del sobre v2. La huella
v1 continúa igual. No se borra ningún archivo de una instalación anterior.
Los formatos v1 de binding/authority, las guardas, firmas y plazos de los grants
permanecen. El contrato v1 puede mantener una sesión Gratis sin fecha; caducan
los grants temporales, no un sobre adicional.

El criterio de cadencia es `signed_until_ms == None` después de verificar v1:
arranque y 24 horas desde el éxito. Founders y módulos perpetuos no heredan
ahora un `exp` artificial. Owner con lease conserva su fecha firmada.
La prueba de reconexión/helper y 24 h usa Founders v1 firmado, sin modificar
Policy a mano (P3 del paso 10).

La matriz de caracterización del núcleo y las matrices de servicios no cambian.
Se convierten fixtures JWS de runtime/Engineer a v1; el test del vencimiento
del sobre durante pausa se retira porque solo existía en v2. La frontera de
gracia v1 durante pausa sigue cubierta por `long_pause_and_resume_keep_the_original_hour_and_expire_during_pause`.
La matriz auxiliar de capacidades usa v1 y comprueba su contrato real: módulos
perpetuos y Gratis siguen después de diez segundos; grants operativos y Pro
caducan sin inventar un vencimiento del sobre. Un rechazo posterior conserva
la licencia ya verificada. Se añade rechazo explícito de JWS y JSON versión 2,
y cuarentena de binding JWS con recuperación v1 y autoridad conservada.

Mutaciones A: omitir firma, aceptar una emisión exactamente en la lápida y
añadir una fecha a una licencia perpetua fallan por aserciones. La primera
exploración de lápida alteraba solo el guard de `install_online` y sobrevivió
porque `install` repite la barrera. Se conservan ese log/resultado y la repetición
que cambia ambas barreras: la matriz detecta `TombstoneEqual`. No se cambia
ningún test para conseguir ese fallo. Cada mutación restaura todos los fuentes
Rust de services/runtime/engineer por SHA-256 antes de la siguiente.

Logs de mutaciones: `isa-1827-s-mutations-a` (firma y exploración conservada)
y `isa-1827-s-mutations-a-r2` (lápida completa y fecha perpetua).
La primera suite detectó dos expectativas de sobre v2 aún presentes en el test
auxiliar de pausa; se corrigieron a `None` después de la gracia, como exige v1.
La siguiente suite pasó **1040/1040 con telemetría**, 13 omisiones previas;
la suite final posterior a mutaciones repite **1040/1040 PASS**, 13 omisiones,
un lento de ACC, 126,962 s. Fmt y Clippy de services/runtime/engineer,
todos los targets con `-D warnings`, también PASS. Los comandos/resultados
finales quedan en `isa-1827-s-final-a-gates.json` y sus logs `isa-1827-s-final-a-*`.
Lifecycle final: runtime **13/13 PASS** y Engineer **5/5 PASS**. Código validado
`3463ac0c595d5750b3af6c83a2d57e8c68ea9ba3`; los commits posteriores solo documentan.
PR draft [#1841](https://github.com/isaacalbala12/Vantare-Simracing-Suite/pull/1841),
a nightly, enlazado en T3, sin integrar. CI a cargo del orquestador.
Los lints iniciales (import y detalles de tests) también se conservan en logs.
La invocación inicial de fmt desde vantare-v2 sin manifest no encontró Cargo.toml;
se corrigió con `--manifest-path native/Cargo.toml`.

Una lectura DeepSeek de la base inventarió las conversiones v2; no revisó cada
byte final ni ejecutó gates. El ejecutor contrastó el mapa, el diff y los tests.
No se consultó una instalación/backend real: retirar v2 es la decisión expresa
5 de ADR 0102 y del encargo. Los restos Installation quedan inertes, sin leerlos
ni borrarlos. No hay compatibilidad de lectura JWS después de este corte.

## Secuencia aprobada por el orquestador

A retira v2; B mueve Authority/catalog/Verifier a runtime::rights y elimina el
verificador duplicado de services; C unifica lectura y clases de Store por
documento; D limpia duplicados y contratos README; E trata un 401 de emisión
automática como NeedsSignIn sin bloquear ni revocar derechos. B debe preservar
los resultados tipados actuales de rechazo del núcleo y services no usará
claims sin ACK verificado para presentación o decisiones. Cada corte tiene
su PR y gates propios. No se modifica Plane ni se integra/publica desde el worker.
