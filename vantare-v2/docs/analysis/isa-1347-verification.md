# ISA-1347 — evidencia de corrección y límites de lanzamiento

Base inicial: `8b25d076` (`origin/nightly`). Antes de publicar se incorporó `247db1c7` (PR #1351, audio Windows), sin cambios de widgets; tras entrar #1348 y #1340 en Nightly, la rama se rebasó linealmente sobre `origin/nightly@b725c402` y se regeneró el artefacto del roadmap. Rama `vantareapp/isa-1347-widgets-data-contract`. [Contrato](../specs/2026-09-23-accepted-widgets-data-contract.md). [Autoridad meteorológica](isa-1347-weather-authority.md). Revisión visual previa de los cinco widgets conservada; no incluye Fuel Strategy ni Pedals Telemetry.

## Cobertura funcional

| Widget | Datos y fronteras verificadas por regresiones |
| --- | --- |
| Delta | Tres referencias resueltas por Go, referencia efectiva/fallback, dos instancias independientes, delta/mejor/última vuelta con calidad propia, cero y cambios de signo sin desplazamiento; fuente detectando/conectando/parando no lista. |
| Pedals | Canales 0–1 independientes, cero observado frente a missing/invalid, límites y desconexión, recuperación; datos retenidos no se anuncian como actuales. |
| Standings | Posición real/ausente, clase y líder explícitos, segundos frente a vueltas, calidad PIT/vueltas, cero vueltas, intervalo nativo y predecesor de clase, ritmo por clase en práctica/clasificación, pie configurable y geometría 22px, ventana del jugador y redondeo al minuto. |
| Relative | Proximidad circular con longitud real, delante/detrás junto al jugador, parrillas pequeñas, no duplicados, misma clase antes de limitar vecinos, dorsal/mejor vuelta, señal de circuito completo respecto al jugador sin falso doblado al cruzar meta, posición desconocida y unidades meteorológicas. |
| Horizontal | Calidad/rango de posición, gap en vueltas, vuelta actual del jugador independiente de filas visibles, SOF excluido, carrusel productivo y copia decorativa sin duplicar accesibilidad, movimiento desactivado con rango desconocido. |

El consumidor Redline comparte la VM de Standings: las batallas ahora usan su dato numérico validado; no convierten «+1 vuelta» en un segundo ni asumen que el primer coche visible es líder.

## Revisión independiente

La revisión del corte `e6ed38e5` encontró cuatro P2: stopping, referencia de intervalo en clase, ritmo comparado entre clases y señal de doblado basada en déficits al líder. Revalidación sobre `aee6a415`: corregidos los cuatro, 95 pruebas focales de widgets y 59 Redline aprobadas, suites focales Go y cinco fronteras del indicador de doblados aprobadas. Sin nuevos P1/P2 en ese alcance. El cambio posterior de serialización requiere su revisión separada.

## Ejecuciones globales y alcance de la evidencia

La primera suite frontend integrada detectó incompatibilidades de fixtures, un hueco de 8px antes del pie y la falsa batalla Redline. Se corrigieron preservando geometría de perfiles antiguos y usando autoridad numérica. No se rebajaron assertions ni presupuestos para conseguir aprobación.

El primer intento global Go no constituye PASS: faltaba la compilación frontend que se incrusta en Go; encontró además la fixture de benchmark con el antiguo tipo LapDistance y dos fallos de diagnostics. La fixture se adaptó, frontend se compiló y el build cruzado Windows aprobó. El paquete launcher quedó ejecutándose sin concluir y se detuvo tras más de siete minutos. Los dos fallos de diagnostics (`TestDiagnosticsBridgeCreatesPrivateEmptyCatalog` y `TestDiagnosticsBridgeRealCatalogDoesNotExposeStorageIdentity`) se reprodujeron independientemente en el checkout limpio de base `8b25d076`, con el mismo resultado. Se repetirá la suite con un límite de tiempo explícito en el corte final; estos intentos no se presentan como validación final.

## Cierre automatizado del producto `95ad1dc3`

- Frontend completo: **480 archivos, 4.037 pruebas aprobadas, 2 omitidas**, sin errores no controlados. Aviso de acceso remoto al roadmap no causó fallo.
- Compilación frontend/TypeScript y lint completo aprobados tras los últimos ajustes de lector y fixtures.
- Go: paquetes telemetry (guard de conexión), core, driver LMU, derive, overlayv2, transporte y replay aprobados. Generador de tipos `-check` aprobado.
- Build cruzado `GOOS=windows CGO_ENABLED=0 go build ./...`: aprobado. No equivale a ejecutar la app en Windows.
- Presupuestos Go de wire y goldens aprobados: 64.880 / 71.120 / 73.096 bytes según escenario documentado. Pruebas del lector conservan precisión, calidad, límite estricto y actualización atómica.
- Calidad sobre el conjunto: **PASS, NEW=0, MOVED=0, policy_changed=false**, sin modificaciones de política ni baseline.
- Revisión independiente de implementación y del formato compacto: aprobada. Encontró posición desconocida Relative que rechazaba el frame y se corrigió antes de cerrar; la regresión atraviesa el lector. [Informe final](isa-1347/final-review.md), [wire](isa-1347/wire-review.md), [primera revisión y revalidación](isa-1347/independent-review.md).
- Suite global Go: **no aprobada en macOS**. Los fallos de diagnostics, SQLite y launcher se reprodujeron en la base `8b25d076`; launcher agota el tiempo y el ejecutable usa símbolos exclusivos de Windows. [Comparación de base](isa-1347/base-platform.md). Las incompatibilidades propias de esta entrega (inventario de campos, hash replay y detección de interfaces JSON) fueron corregidas y sus paquetes pasan. No se silenció ninguno de los fallos previos.

El hash de replay cambia por la nueva derivación de vueltas relativas y la representación del frame; la prueba sigue exigiendo el mismo digest entre reproducción paso a paso y temporizada. El inventario de campos conserva el orden real de `ObservedState`. El guard de conexión reconoce métodos JSON únicamente con firma exacta y declaración de interfaz estándar comprobada por Go; 14 casos positivos y negativos protegen ese reconocimiento, sin listas amplias de excepciones.

Publicación de revisión: [PR #1352](https://github.com/isaacalbala12/Vantare-Simracing-Suite/pull/1352), destino Nightly y rebasada sobre `b725c402`. El run remoto de `c2999ac5` falló en parseo compacto (1,906 ms frente al límite de 1,5 ms). El lector se optimizó para evitar normalización redundante de filas legacy y asignaciones/validaciones repetidas en filas compactas. El siguiente head `5bf052c8` aprobó promoción, gates bloqueantes y GitGuardian, pero el ratchet reportó `jscpd NEW=2` por validaciones de forma duplicadas; el seguimiento extrae ahora `validQualityValueShape`. El scan directo conserva solo un duplicado cuyo hash `15c68f8e` ya está en el baseline. En local: pruebas dirigidas 39/39; última muestra bajo carga, legacy 1,188 ms y compacto 1,440 ms (<1,5 ms); suite completa 481 archivos, 4.035 PASS y 2 omitidas con `--maxWorkers=2`; build, typecheck y lint PASS después de la extracción. El aggregate local del ratchet no es ejecutable en este Windows porque faltan `staticcheck` y `deadcode` y la plataforma solo corre la configuración Windows; el nuevo run Linux de CI debe confirmar que jscpd vuelve a `NEW=0`. Isaac autorizó explícitamente la integración a Nightly el 2026-09-23. El contrato de roadmap sigue siendo exactamente `milestones:functional-widget-design`; JSON regenerado desde la base actual. Todavía no hubo merge ni promoción.

## Prueba física que sigue pendiente

En el mismo build candidato de Windows: comparar widgets con la sesión real de LMU en práctica, clasificación y carrera; probar parada/reconexión y cambio de sesión; verificar pedales sueltos/a fondo y ausencia de canal; comparar Delta con las tres referencias; doblaje/desdoblaje y cruces de meta; parrilla multiclase y ventana con jugador fuera de las filas visibles; repetir lectura en Desktop y OBS. Contrastar temperaturas, pista mojada y lluvia no-cero con el simulador, y correlacionar el código de bandera REST.

Viento no se publica sin unidad demostrada. La lluvia representa severidad, no probabilidad. SOF no se ofrece por decisión de Isaac. No se certifica el 100% de funcionamiento físico a partir de mocks o de compilación cruzada. Las cinco correcciones siguen En curso en Asana hasta cerrar esta evidencia; la aceptación visual permanece completada.

## Seguimiento post-merge (2026-09-24)

La [PR #1352](https://github.com/isaacalbala12/Vantare-Simracing-Suite/pull/1352) sí se fusionó por squash en Nightly: `f50ab4ab96c4e646d7534d50c804f41087c446db`, verificado en `origin/nightly`. Su CI pre-merge aprobó promotion path, blocking gates, quality ratchet y GitGuardian; el digest del roadmap post-merge también pasó. El workflow post-merge Branch channel gates [run 35931966848](https://github.com/isaacalbala12/Vantare-Simracing-Suite/actions/runs/35931966848) falló en la suite frontend: el parser compacto midió 1,626 ms frente al límite de 1,5 ms (480 archivos pasaron, uno falló; 4.034 pruebas pasaron y 2 se omitieron). La issue #1347 continúa abierta con `state:nightly`.

Seguimiento correctivo en la rama `vantareapp/isa-1347-nightly-parser-perf`, basada en ese SHA de Nightly, commit inicial `17c0e91a`: el parser ya no crea un codificador y un buffer por frame ASCII; los textos Unicode mantienen la comprobación exacta del límite UTF-8 de 72 KiB. La regresión cubre ASCII en el límite, ASCII excedido y Unicode excedido aunque su longitud en caracteres quepa. PR draft [#1354](https://github.com/isaacalbala12/Vantare-Simracing-Suite/pull/1354), checks remotos en curso.

Evidencia local: pruebas dirigidas de contrato/rendimiento 24/24; muestra final legacy 0,686 ms y compacto 0,812 ms; suite completa en la misma corrección antes del ajuste equivalente del patrón ASCII para ESLint, 481 archivos y 4.036 PASS (2 omitidas); typecheck, lint, build y `git diff --check` PASS. Los gates de #1354 deben validar el head exacto. Sin cambios de roadmap, promoción, release ni afirmación de prueba física; LMU activo en Windows/Desktop/OBS sigue pendiente.
