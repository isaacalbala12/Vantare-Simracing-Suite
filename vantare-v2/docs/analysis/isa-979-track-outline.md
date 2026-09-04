# ISA-979 — contorno estático V2

PERF-001 de la auditoría ISA-978. Base: `813b96c43028353a599903fb035268c354b58896`.
Issue: https://github.com/isaacalbala12/Vantare-Simracing-Suite/issues/979
Rama: `vantareapp/isa-979-cache-track-outline`; PR draft #980 contra nightly.

## Resultado medido

MEASURED-MAC-RELATIVE, Apple M5/Go1.25/Node22.23.2; el benchmark es JavaScript del constructor real importado por Vite SSR, el formato benchstat es solo el formato de comparación (no se presenta como benchmark Go). Fixture 44 coches móviles, Circuit de la Sarthe, 1.363 puntos; 1.000 warm-up, 10×3.000 operaciones. Misma toolchain, sin carga simultánea de otros benchmarks. BASE mediana 213.84 µs, HEAD 6.14 µs; checksum idéntico 634590000. No extrapolar a FPS, RAM GPU ni latencia Wails.

```text
goos: darwin
goarch: arm64
           │ /tmp/vantare-astra-20260904/runtime/impl-base-bench.txt │ /tmp/vantare-astra-20260904/runtime/impl-head-bench.txt │
           │                         sec/op                          │             sec/op               vs base                │
TrackMapV2                                             213.837µ ± 4%                       6.140µ ± 4%  -97.13% (p=0.000 n=10)

```

La caché se aloja en una clausura privada y conserva una sola geometría estática, dimensiones, proyección y path. No expone estado mutable de producto, retiene frames ni duplica autoridad V2. Alternar pistas reemplaza esa única entrada; dos mapas de pistas diferentes podrían reducir su hit rate, sin alterar resultados. Primera llamada mantiene el coste original, sin precomputar todos los circuitos al arrancar. El módulo libera la entrada cuando se destruye su contexto JS. Marcadores/estado/contenido se calculan cada vez.

## Gates

Antes del cambio, 11 tests focales PASS, incluyendo las nuevas caracterizaciones: cada pista/alias, cambio y vuelta a pista, dimensiones, marcadores móviles, stale/desconectado y contenido. Después: mismos 11 PASS; suite 441 archivos/3.430 tests PASS; typecheck PASS; build PASS; lint global y focal PASS. Warnings AbortError de teardown happy-dom conservados, sin tests fallidos. No cambios Go; race del candidato en transporte/Strategy/Engineer/Spotter/radio PASS en ISA-978. El gate Go general del candidato es rojo en macOS por causas preexistentes documentadas allí.

El ensayo Chromium usa renderers productivos; solo prueba consumidores auxiliares, no ventanas WebView2. El PR requiere CI Windows antes de integración. Ninguna promoción ni FPS canónico certificados.

## Reproducir

Desde vantare-v2, instalar lockfile congelado. El recolector versionado en el PR de ISA-978 se ejecuta con `node scripts/performance/measure-track-map.mjs frontend <salida-externa> <label>` sobre BASE y HEAD secuencialmente. Las series completas, perfiles y comandos se adjuntan al paquete de evidencia ISA-978. Suite: `pnpm --dir frontend test`, `typecheck`, `build`, `lint`.

## Revisión y rollback

Un archivo productivo, sin dependencias, cambios de schema, transporte, paquetes de pistas, frecuencias, estado canónico o retirada legacy. La instrucción expresa del usuario autoriza memoización selectiva medida; este derivado privado no crea un store global. Roadmap actualizado únicamente en `milestones:performance-policy`; digest regenerado contra el SHA base del PR apilado. Rollback: revertir este PR completo. La rama candidata #977 debe conservar o integrar antes su migración; no mezclar su delta acumulado con este pequeño cambio al revisar.

El bundle añade 261 bytes minificados al chunk compartido de widgets; no cambia el número de módulos (1.089). El digest obligatorio añade además ~3,6 KB al chunk Hub y no es trabajo de render por frame. El harness HEAD conserva cero suscripciones tras 50 ciclos. Los workflows actuales solo lanzan branch gates para PRs contra nightly/testers/master; este PR apilado no tiene ese CI automático hasta retarget tras integrar su base. El workflow de build manual exige SHA ya contenido en nightly/testers, por lo que no se ejecuta fingiendo esa condición. CI Windows queda pendiente, sin autorización de merge.

Corrección de base: el contrato no admite PRs apilados. La entrega se rebasa a nightly `659b2c57dc2c7fc75962cc3c8e425ed1289266ec`; el archivo productivo es byte-idéntico en ambos snapshots antes del cambio. Se conservan las métricas originales etiquetadas NEXT_CANDIDATE, y se repiten BASE/HEAD y checks sobre nightly. No se arrastra la migración #977. El comentario anterior sobre falta de CI apilado describe el intento descartado; el PR final apunta a nightly.
