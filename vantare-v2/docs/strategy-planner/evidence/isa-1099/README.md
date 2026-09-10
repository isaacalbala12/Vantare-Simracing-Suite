# ISA-1099 — T11 uso por familia

## T11a — preparación pura de uso por familia

Base b70673d063e203ecb664c20e6074f7c964cdbbc4, rama
vantareapp/isa-1099-recorded-family-use, C:/tmp/vantare-isa1099/vantare-v2.
Objetivo por número/inicio/fin/base; familia existente, original y motivo,
rechazo de ambigüedad/cambio de interpretación. Colecciones separadas, timestamps
normalizados para identidad. Inclusión rechaza vueltas incompletas y cobertura
unknown/missing/invalid/unsupported; stale conserva su marca para el consumidor.
La prueba detectó que presenceWeight(unknown)>0 no sirve como gate de integridad;
se corrigió el nuevo validador sin cambiar pesos/criterios heredados. Focales y
vet Analysis PASS, build de base y global Go -p1 PASS. Instalada exclusivamente
la resolución congelada/offline existente, sin dependencias nuevas.
Dos paths lógicos/test. Todavía sin custodia, derivación ni UI de familias.
Evolución documentada en sdd/family-corrections-evolution.md. Siguiente T11b:
conjunto sin solapes y vista de usos, después custodia mixta existente.
Pendientes T11e: identidad completa en consumidores y tráfico como exclusión
blanda separada. #1096 queda congelada en b70673d0 con 3478 tests frontend PASS.
Sin Wails, banco real/heldout, precisión ni revisión visual >9 nuevos.
Sin push, PR, CI remota, merge, promoción o release.
