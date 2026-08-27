# Auditoría de interferencias de telemetría y Nightly vigente

Issue: #868  
Fecha: 2026-08-27  
Base auditada: `origin/nightly@a02a1463de59c64389c6815c859425af08133833`

## Resultado inicial

La ausencia de datos en la pantalla **Telemetry Orbit** no es una caída de la
captura LMU ni una regresión introducida por la promoción de Analysis/Strategy.
En la Nightly vigente, esa pantalla sigue sin estar conectada a una fuente real:
`realTelemetrySessions()` devuelve siempre `[]` y el propio test productivo
exige el estado vacío cuando el modo demo está apagado.

Durante la reproducción, la build instalada sí mantuvo una conexión TCP con
LMU en `127.0.0.1:6397`. LMU respondió con una sesión `PRACTICE1`, 18 vehículos,
circuito activo y estado de navegación de evento. El transporte de Vantare
respondió `200`, publicó `telemetry:overlay:status` con estado `live` y entregó
una proyección completa con epoch y secuencia crecientes. Por tanto:

1. LMU estaba produciendo datos.
2. El driver/runtime vivo de Vantare los estaba recibiendo.
3. El transporte Overlay los estaba publicando.
4. Telemetry Orbit no los consume y queda vacío por construcción.

Si el síntoma observado corresponde a un overlay y no a la pestaña Telemetry,
la captura y el transporte ya quedan descartados como causa total; habría que
seguir desde el consumidor visual, el perfil y el widget concretos.

## Cuatro rutas que no deben confundirse

| Ruta | Estado en `origin/nightly` | Evidencia |
| --- | --- | --- |
| LMU en vivo -> Telemetry Core -> Overlay/Engineer/Strategy live | Presente | Runtime instalado conectado a 6397 y SSE Overlay en `live` con snapshot completo. |
| DuckDB histórico LMU -> servicio Telemetry Analysis | Promovida por #866 | `TelemetryAnalysisService` registrado en `cmd/vantare/main.go`; reader y runtime Windows incluidos. |
| Sesiones autorizadas -> catálogo/cold start -> Strategy Orbit | Promovida por #867 | `LMUImporter`, `SessionCatalog` y selección automática presentes y compuestos. |
| Sesiones post-sesión -> Telemetry Orbit | Pendiente | `telemetry-orbit-source.ts:38-40` devuelve `[]`; no hay binding, evento Wails ni store que alimente la página. |

## Paridad entre la build instalada y Nightly

El ejecutable instalado tiene SHA-256
`67f24143083f82d4decb5815446b6772da0a4e395d7963c286aa4ac5d79233c7`.
Coincide exactamente con el asset `vantare.exe` de
`v0.1.0.7-nightly.12`, cuyo commit objetivo es `8a90c3a7`.

La última Nightly publicada es `v0.1.0.7-nightly.13`, objetivo `91efbb8e`.
La rama actual está en `a02a1463`, después de #866 y #867. No existe todavía
una release que convierta esos dos merges en la aplicación instalada.

Comparando Nightly.12 con `a02a1463`:

- no hay cambios en `internal/telemetry`, por lo que el camino de telemetría en
  vivo que ejecuta la build instalada es el mismo que el de la rama actual;
- sí se añaden/cambian `internal/telemetryanalysis`, el servicio histórico, el
  cold start y los consumidores de Strategy;
- no hay ningún cambio en
  `frontend/src/hub/telemetry-orbit/telemetry-orbit-source.ts`;
- #867 declara expresamente que `TelemetryOrbitPage` continúa fuera de alcance.

Conclusión: los merges recientes no rompieron el camino live y tampoco podían
hacer aparecer datos en Telemetry Orbit. La app instalada no prueba todavía el
reader/cold start recién promovido porque es anterior a esas promociones.

## Issues que interfirieron o pueden confundirse con el síntoma

### Telemetría viva

- **#675 / PR #676** promovió el rework Go-first de Telemetry Core. Es la base
  del camino live que hoy sí entrega snapshots.
- **#678, #679 y #680** registran derivación de combustible, capacidades reales
  y fingerprint LMU. Son deuda/ajustes del canónico, no explican que Telemetry
  Orbit tenga cero sesiones.
- **#695, #696, #697 y #707** son deuda abierta de cadencias, daño y churn. No
  bloquean la recepción completa observada durante esta práctica.
- **#709** mantiene abierto un frame congelado al transicionar de sesión a menú.
  Puede interferir en cambios de estado, pero no coincide con la reproducción
  actual: LMU está dentro de práctica y la secuencia sigue avanzando.

### Histórico LMU y Strategy asistida

- **#802** corrigió el crash por typed nil y la raíz de staging inexistente.
- **#809** corrigió el panic al etiquetar incidentes fuera del rango de vueltas.
- **#810** mantuvo visible el banner, amplió el timeout y aisló sesiones malas.
- **#813** redujo la importación medida de 13m40s a 1m41s-2m21s leyendo 17
  canales declarados y usando hasta cuatro helpers. La issue sigue abierta
  aunque su implementación está incluida en el acumulado promovido.
- **#816** corrigió la segunda página de 16.385 filas rechazada por el límite
  del reader.
- **#824** sigue abierta, pero la Nightly actual ya contiene la disponibilidad
  automática basada en catálogo y causas concretas. Su extensión de calendario
  y el estado del tracker deben revisarse antes de darla por cerrada.
- **#831 y #832** corrigieron, respectivamente, el fallback cruzado de clima y
  la reserva de combustible; afectan cálculos de Strategy, no captura live.
- **#861 / PR #866 / PR #867** promovió el acumulado a `nightly`, excluyendo de
  forma explícita el wiring de Telemetry Orbit.

## Señales de proceso y CI

- El push final de `nightly@a02a1463` completó los dos jobs requeridos en verde
  (run `33024772922`).
- El fallo previo visto tras #866 fue el test PTT de voice input; no era un gate
  de telemetría y fue demostrado como flake antes del merge final.
- Issue #813 permanece abierta pese a estar implementada y promovida; #824
  también mezcla comportamiento ya presente con una ampliación posterior.
  Esta desalineación del tracker es una fuente real de confusión al reconstruir
  qué está o no en Nightly.

## Siguiente reproducción

1. Construir o publicar una aplicación desde `a02a1463` para probar realmente
   #866/#867; Nightly.12 no sirve como evidencia de ese corte.
2. Confirmar con Isaac si el vacío denunciado era la pestaña Telemetry o un
   widget Overlay concreto.
3. Si era Telemetry Orbit, abrir una issue de implementación separada: conectar
   catálogo y páginas históricas al frontend con estados honestos, sin datos
   sintéticos ni fallback.
4. Si era un overlay, capturar el widget/perfil afectado y seguir el snapshot ya
   demostrado desde `telemetry:overlay:projection` hasta su ViewModel visual.

No se propone ni aplica un arreglo en #868: esta rama conserva el diagnóstico y
la evidencia; cualquier cambio de comportamiento requiere issue propia.
