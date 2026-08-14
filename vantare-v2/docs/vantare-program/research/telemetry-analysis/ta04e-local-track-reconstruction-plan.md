# TA-04E — reconstrucción local de trazada entre grabaciones LMU

Estado: protocolo pre-registrado ejecutado; resultado técnico `NO-GO`. Trabajo
documental local bajo la excepción temporal sin Linear. No autoriza código,
producto visual ni promoción.

## Objetivo

Decidir si varias grabaciones LMU compatibles permiten reconstruir una forma
local métrica y repetible de la trazada, sin afirmar datum, geolocalización
absoluta, bordes físicos o anchura de pista. TA-04E separa dos preguntas:

1. **Pase confirmatorio:** consistencia de progreso/longitud, escala, forma
   rígida y cierre entre grabaciones compatibles.
2. **Análisis exploratorio:** si los canales laterales describen de forma
   empírica ambos lados con observaciones suficientes.

El análisis exploratorio es descriptivo y no puede cambiar los gates del pase
confirmatorio ni producir un `GO` a posteriori.

## Base, alcance y límites

- Rama: `work/ta04e-local-track-reconstruction`.
- Base exacta: `05bb18d35a3fd6e1b3fe62dddf164aba8e11b947`.
- Excepción autorizada: documentar las issues al final; no usar push, PR, CI
  remoto, merge, promoción o release.
- Permitido: agregados sanitizados de recordings finalizados, protocolo,
  decisión de capacidades y actualización del expediente vivo.
- Prohibido: código, tests de producto, frontend, UI, mapa, captura, coordenadas
  crudas, muestras, rutas, nombres, IDs, timestamps o metadata sensible.

**STOP visual:** TA-04B continúa bloqueada. No iniciar trabajo visual ni
delegarlo a Claude.

## Custodia, selección y compatibilidad

1. Discovery se limita a artifacts LMU finalizados y aplica los gates
   TA-02/TA-03E: archivo regular, ausencia de WAL, ventana estable, autorización
   y lectura privada read-only mediante la pila productiva.
2. La inspección registra solo conteos, percentiles, coberturas y resultados de
   gates. Ningún valor por muestra sale del proceso local.
3. Una grabación es elegible para forma si contiene al menos tres vueltas
   completas y cobertura exacta de los cinco canales requeridos por el análisis
   local.
4. Las comparaciones se realizan dentro del primer grupo compatible por pista,
   layout y vehículo que contiene al menos dos recordings elegibles. La
   búsqueda se detiene al encontrarlo; no se escoge después el mejor grupo.
5. Cada original conserva identidad e integridad PRE/POST. Staging, copias y
   herramientas temporales se cierran y eliminan al terminar.

## Pre-registro confirmatorio congelado antes del pase final

Las métricas y umbrales siguientes se fijan antes de ejecutar el pase final.
Todos los gates son conjuntivos; fallar uno produce `NO-GO` para el mapa local
técnico. No se sustituyen grabaciones, métricas o thresholds después de conocer
el resultado.

| Gate | Métrica pre-registrada | PASS requerido |
|---|---|---|
| Cobertura | presencia finita de los cinco canales requeridos en las vueltas usadas | 100 % exacto |
| Consistencia de distancia | error relativo de `Total Dist` frente a `Lap Dist` | 100 % de vueltas `<= 0,003` |
| Escala robusta | dispersión relativa robusta de longitud entre recordings | compatible con el gate de longitud TA-04A |
| Generalización de longitud | error relativo leave-one-out de longitud | 100 % de vueltas `<= 1 %` |
| Repetibilidad rígida | porcentaje de vueltas cuyo residual rígido cumple conjuntamente p95 `<= 5 m` y p99 `<= 10 m` | `>= 80 %` y al menos 3 vueltas aprobadas por recording |
| Cierre | distancia de cierre frente al threshold dinámico congelado por recording | 100 % dentro del threshold |

Los percentiles p50/p95/p99 se reportan aunque otros criterios usen cobertura
total. El residual rígido se evalúa por vuelta y se resume por recording; el
gate usa la tasa conjunta de vueltas que cumplen ambos límites. No se reemplaza
por una impresión visual ni por un percentil más favorable. El threshold
dinámico de cierre es un control de bucle cerrado, no una dispensa para los
límites rígidos p95/p99.

## Protocolo exploratorio lateral

Después de congelar el protocolo confirmatorio se permite caracterizar
`Path Lateral`/`Track Edge` como señales empíricas, sin atribuirles bordes
físicos. La descripción solo sería candidata a estudio posterior si:

- al menos 95 % de los bins de progreso contienen observaciones en ambos lados;
- cada lado aporta al menos cinco observaciones en todo bin aceptado.

Estos criterios no son gates alternativos del mapa local y sus resultados no
pueden promover `empirical_edge_envelope`, geolocalización o anchura. TA-04C
continúa siendo la autoridad semántica.

## Decisión de capacidades

El cierre registra exactamente estas familias y no infiere unas de otras:

| Capacidad | Estado posible en TA-04E |
|---|---|
| `metric_progress` / `length` | ya `valid` por TA-04A; TA-04E solo contrasta repetibilidad |
| `local_shape` | `valid` solo si pasan todos los gates confirmatorios; de otro modo `unknown` |
| `empirical_edge_envelope` | como máximo observación exploratoria; semántica `unknown` y uso de producto `incompatible` |
| geolocalización absoluta | `unknown`; fuera del poder probatorio de este protocolo |
| anchura física | `incompatible`; requiere el contrato oficial pendiente |

## Orden de ejecución y cierre

1. Congelar este protocolo antes del pase final.
2. Ejecutar discovery y seleccionar el primer grupo compatible sin optimización
   posterior.
3. Ejecutar una vez el pase confirmatorio y conservar únicamente agregados.
4. Registrar el resultado conjuntivo sin relajar umbrales.
5. Ejecutar y etiquetar por separado la exploración lateral.
6. Verificar privacidad, cleanup, coherencia documental y `git diff --check`.
7. Crear o recuperar en Linear primero TA-04C, después TA-04E vinculada; crear
   TA-04F solo como investigación futura independiente.

TA-04F debe caracterizar si el umbral de 5 m entra en conflicto con variación
real de sensor/trayectoria/piloto. No puede relajar TA-04E a posteriori. Una
nueva resolución necesita pre-registro nuevo y holdout independiente/nuevas
grabaciones, o una fuente oficial.
