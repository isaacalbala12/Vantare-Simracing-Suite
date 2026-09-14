# ISA-979 — contorno estático V2

PERF-001 de la auditoría ISA-978. Base: `813b96c43028353a599903fb035268c354b58896`.
Issue: https://github.com/isaacalbala12/Vantare-Simracing-Suite/issues/979
Rama: `vantareapp/isa-979-cache-track-outline`; PR draft #980 contra nightly.

## Resultado medido

Base de entrega: origin/nightly `659b2c57dc2c7fc75962cc3c8e425ed1289266ec`.
El archivo productivo antes del cambio es idéntico en nightly y NEXT_CANDIDATE.
MEASURED-MAC-RELATIVE. Apple M5, Node22.23.2, constructor JS real cargado por Vite SSR;
44 coches, Le Mans/1.363 puntos, warm-up1.000, 10×3.000 operaciones. Formato benchstat
solo para comparar las series JS, no un benchmark Go. BASE y HEAD en el mismo
worktree secuencialmente, con restauración comprobada de fuentes.

```text
goos: darwin
goarch: arm64
           │ /tmp/vantare-astra-20260904/runtime/nightly-base-bench.txt │ /tmp/vantare-astra-20260904/runtime/nightly-head-bench.txt │
           │                           sec/op                           │               sec/op                vs base                │
TrackMapV2                                                209.493µ ± 2%                          6.919µ ± 4%  -96.70% (p=0.000 n=10)
```

Checksum idéntico 634590000; no se convierte el resultado en FPS ni latencia Wails.
La comparación previa sobre candidato fue 213,837→6,140 µs; se conserva en ISA-978
etiquetada, sin mezclar sus cifras con la base final.

La caché se aloja en una clausura privada y conserva una sola geometría estática, dimensiones, proyección y path. No expone estado mutable de producto, retiene frames ni duplica autoridad V2. Alternar pistas reemplaza esa única entrada; dos mapas de pistas diferentes podrían reducir su hit rate, sin alterar resultados. Primera llamada mantiene el coste original, sin precomputar todos los circuitos al arrancar. El módulo libera la entrada cuando se destruye su contexto JS. Marcadores/estado/contenido se calculan cada vez.

## Gates

Antes del cambio, 11 tests focales PASS: cada pista/alias, alternancia, dimensiones,
marcadores móviles, desconexión/stale y contenido. En candidato: 3.430 tests PASS,
typecheck/build/lint PASS. Repetición en la base final nightly: 433 archivos y
3.299 tests PASS, build (tsc -b incluido) y lint global PASS. Avisos AbortError
de teardown happy-dom conservados, sin tests fallidos.

Chromium del candidato usa renderers productivos y deja cero suscripciones tras
50 ciclos; no certifica ventanas WebView2. Sin cambios Go. La suite Go general
del candidato tiene fallos macOS preexistentes documentados en ISA-978.
El PR #980 final apunta a nightly y requiere sus checks Windows antes de integrar.
El validador local de roadmap requiere GITHUB_TOKEN ausente; no se extraen
credenciales de gh para eludirlo. El digest sí pasa comprobación local contra base.

## Reproducir y revisar

Recolector en ISA-978: `node scripts/performance/measure-track-map.mjs frontend
<salida-externa> <label>` sobre BASE y HEAD secuencialmente. Series, perfiles y
comandos en su paquete de evidencia. Suite: `pnpm --dir frontend test`,
`typecheck`, `build`, `lint`.

Un archivo productivo, +26/-3 líneas; sin nuevas dependencias, schema, transporte,
frecuencias o cambios Core. La autorización expresa de memoización selectiva
medida se limita a este derivado privado, no a un store global. El coste del
caché fue +261 bytes minificados del chunk de widgets en el candidato. El digest
puede cambiar el bundle del Hub y se registra por separado.

Roadmap: únicamente `milestones:performance-policy`, regenerado contra nightly.
Rollback: revertir este PR completo. No merge, promoción ni release. PR draft:
https://github.com/isaacalbala12/Vantare-Simracing-Suite/pull/980
