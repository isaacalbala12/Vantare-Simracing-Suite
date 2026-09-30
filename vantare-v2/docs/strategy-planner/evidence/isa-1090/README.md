# ISA-1090 — discovery y aplicación real de sesiones

2026-09-09. Rama `vantareapp/isa-1090-analysis-discovery-limit`, base
`7d504d780095b0d81044824d7d2182599e94ac89`, worktree C:/tmp/vantare-isa1090.

## Corrección y pruebas

La composición nativa limitaba discovery a 128 candidatas y traducía
ErrCandidateLimit como formato incompatible. Ahora admite hasta 1024, como el
importador existente, y distingue el exceso con un error específico. No trunca
resultados. Discovery sigue siendo metadatos; cuatro sesiones abiertas máximo
y los límites de bytes, páginas y correcciones permanecen intactos.

Regresión RED/GREEN con 400/1024/1025 entradas de metadatos; prueba de
composición nativa. Full `go test ./...` y `go vet ./internal/app ./cmd/vantare`
PASS, GOCACHE aislada. Frontend: 420 archivos y 3308 tests PASS (327.97 s),
build y lint PASS. Vitest imprime AbortError durante teardown de happy-dom,
sin tests fallidos; no se oculta. Build conserva aviso de chunks >500 kB.
La primera ejecución Go rechazó por vet una aserción redundante del nuevo test;
corregida antes del rerun completo. `git diff --check` PASS.

## Wails y archivos reales

Build diagnóstica sin tags production, configuración heredada del proceso,
datos/configs y perfil WebView aislados; no .env ni credenciales copiadas.
No equivale a validar entitlement ni distribución de producción. Se coordina
exclusividad con #1072; sólo se inicia/cierra PID20604 de este worktree. LMU
no se inicia ni se cierra.

1. Buscar sesiones descubre **416** candidatas, sin leer contenido. Tras la
   ventana de estabilidad se abre únicamente la fuente Imola ya expuesta en
   #1088, identificada por fecha/tamaño; los archivos reservados no se abren.
2. Abrir/preparar muestra United Autosports #21:ELMS25 / Autodromo Enzo e Dino
   Ferrari y revisión `aa52f44e5cb6`.
3. Usar estas sesiones confirma **Sesiones aplicadas**. El repositorio aislado
   guarda included=true, stable session
   `ac32a2eae049a7dc680d1cc558e8a9e235524d26206341f2b91f3f162f3ed607`,
   baseDigest `b63f364f329f57c4f9f3fce69441d3212a306077252eba145de86dca5921a680`,
   revisionId/snapshotId
   `aa52f44e5cb620c800b6190ff8609a37d2e61db5fd7d5b69e2f58c6d5236e0f8`.
4. Cerrar explícitamente elimina la sesión preparada. SHA256 de los originales
   Imola y Monza siguen iguales a #1088. Se cierra la app y se verifica PID ausente.

Captura real: [sesión aplicada](wails-session-applied.png). No es aceptación
visual del diseño A4: aún falta su porte completo y la biblioteca necesita una
presentación navegable, no una lista extensa de fecha/tamaño.

## Límite que permanece

El evento controlado Imola de 120 minutos vuelve a agotar el plazo del solver
(8.005 s tras aplicar, `calculation_timeout/input.variants.0`). Registrado en
#1089, sin modificar solver aquí. La pantalla de estrategia apareció de forma
transitoria antes del timeout; **no es un cálculo completado**. No se certifica
estrategia óptima, precisión física ni recorrido completo hasta resultado.

Logs locales: C:/tmp/isa1090-{go-test,frontend-test,build,lint}.log y
bin/data/logs/vantare.log del worktree. Para repetir: build diagnóstica aislada,
evento/combinación Imola, buscar, esperar estabilidad, buscar, abrir la fuente
correcta, aplicar, verificar referencia persistida y cerrar. Nunca importar en
bloque el corpus que contiene la reserva independiente.

Entrega local: sin push, PR, CI remota, merge, promoción o release.
