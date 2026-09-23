# ISA-1347 — evidencia de corrección y límites de lanzamiento

Base: `8b25d076` (`origin/nightly`). Rama `vantareapp/isa-1347-widgets-data-contract`. [Contrato](../specs/2026-09-23-accepted-widgets-data-contract.md). [Autoridad meteorológica](isa-1347-weather-authority.md). Revisión visual previa de los cinco widgets conservada; no incluye Fuel Strategy ni Pedals Telemetry.

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

## Prueba física que sigue pendiente

En el mismo build candidato de Windows: comparar widgets con la sesión real de LMU en práctica, clasificación y carrera; probar parada/reconexión y cambio de sesión; verificar pedales sueltos/a fondo y ausencia de canal; comparar Delta con las tres referencias; doblaje/desdoblaje y cruces de meta; parrilla multiclase y ventana con jugador fuera de las filas visibles; repetir lectura en Desktop y OBS. Contrastar temperaturas, pista mojada y lluvia no-cero con el simulador, y correlacionar el código de bandera REST.

Viento no se publica sin unidad demostrada. La lluvia representa severidad, no probabilidad. SOF no se ofrece por decisión de Isaac. No se certifica el 100% de funcionamiento físico a partir de mocks o de compilación cruzada. Las cinco correcciones siguen En curso en Asana hasta cerrar esta evidencia; la aceptación visual permanece completada.
