# ISA-1103 — Banderas e información en Efficiency

Petición de Isaac del 2026-09-10. Rama `vantareapp/isa-1103-efficiency-session-info`,
worktree `C:/tmp/vantare-isa1103`, base visual `87cef39a` de ISA-1083. La rama de
acceso/marca ISA-1097 queda preservada y se comprobará con este corte al terminar.
No se promueve ni publica durante el desarrollo.

## Decisión visual

- Las diagonales de cabecera representan la bandera, sin animación ni transición.
  Un valor desconocido, ausente o antiguo queda neutro, nunca verde por defecto.
- Dos datos elegibles en cabecera. Signature aprovecha la zona sobre las etiquetas
  de tiempos manteniendo sus 50 px; Broadcast usa el espacio a la derecha.
- Pie opcional de 22 px con dos datos elegibles. Conserva tipografía, contraste,
  transparencia y selección del diseño aceptado. Sin carrusel automático.
- Opciones: pista, temperatura de pista/aire, tiempo restante, vueltas máximas,
  vueltas restantes estimadas, lluvia y humedad de pista. Ninguna inventa datos.

## Procedencia y límite real

`BuildSession` publica `flag` como missing: no hay señal canónica admitida de
bandera. `BuildWeather` hace lo mismo con todas las temperaturas y el tiempo.
Este corte implementa la presentación sobre el contrato V2 existente, no añade
un lector de LMU ni una autoridad paralela. En producto esos campos muestran
ausencia hasta que Telemetry Core admita la fuente. La bandera se comprobará con
valores explícitos en pruebas del contrato, sin presentarlas como prueba física.

`fuel.sessionLaps` sí contiene las vueltas restantes estimadas en Go a partir del
tiempo restante y la última vuelta del jugador. Se presenta como estimación, no
como duración total ni como `fuel.estimatedLaps` (autonomía). En práctica/clasificación
no se presenta una estimación de carrera. El límite de vueltas omite centinelas.

## Archivos y comprobaciones

ViewModel V2 y tipos de Standings; renderer/CSS/manifest/etiquetas de Efficiency;
geometría compartida, traducciones del inspector y tests correspondientes.
El Workshop reutiliza los controles del manifest y mantiene su panel desplazable
para que las opciones adicionales no desplacen el widget fuera de la vista.
Sin dependencias, cambios de persistencia, canvas espacial ni motor de animación.
Comprobar datos ausentes/antiguos, temperaturas y unidades, bandera desconocida,
configuración guardada, ambos estilos, columnas reordenadas, pie oculto, geometría
y superficies mediante el host compartido. Suite frontend, tipos/build/lint;
prueba física conjunta separada de estas comprobaciones.

## Estado

Implementación terminada. 8 tests RED de información → 12 PASS; 4 RED
de presentación → 19 PASS; 4 RED de refresco por sección → PASS. Total focal:
51 tests. La primera suite completa encontró 9 fallos relacionados con la nueva
altura, una fixture de host sin weather y el snapshot histórico del VM. Se
conserva el golden previo y se comprueban todos sus datos más los campos nuevos;
se añade ausencia explícita a la fixture y 22 px a las expectativas geométricas.
Los 120 tests de esos cuatro archivos pasan tras el ajuste y la repetición
completa posterior es verde (3377 PASS, ver Cierre P2). Build/typecheck/lint
PASS. La revisión de navegador confirma selección de circuito/tiempo desde los
controles y ambos estilos; es evidencia del harness.

## Cierre P2 — franja de información estrecha (2026-09-10)

Revisor confirmó: Signature con Posición+Piloto (238 px) ocultaba los datos de
cabecera. Corrección mínima verificada: `resolveFunctionalHeaderInfoPlacement`
en `functional-standings-layout.ts` (`inline`/`split`/`band`/`none`); si la zona
libre no admite los slots elegidos, la información pasa a una franja de 22 px
reservada también en `resolveFunctionalStandingsSize` (marco) y renderizada por
`StandingsFunctional.tsx` con estilos en `tokens.css`. Ancho habitual conserva
Signature 50 px / Broadcast 46 px; ambos slots `none` o cabecera oculta no
añaden franja (`none`). Sin slots de 0 px (SessionInfo omite `none`) ni
solapamientos (la franja vive en fila propia o bloque externo). Validados:
estrechos de ambos estilos, Pos+Piloto+Gap, todas las columnas, pie/cabecera
ocultos, stale/disconnected y columnas reordenadas; selección/estética intactas.

Evidencia final: focales 9 archivos/180 tests PASS
(`C:/tmp/vantare-isa1103-focal.log`); suite completa 425 archivos, 3377 PASS y
2 omitidos, exit 0 (`C:/tmp/vantare-isa1103-full-tests.log`, incluye los 2 RED
del P2 ya en verde; aviso `AbortError` de teardown Happy DOM sin efecto en el
resultado); `typecheck`, `build` y `lint` PASS con exit 0
(`C:/tmp/vantare-isa1103-{typecheck,build,lint}.log`). Sin cambios Go.
Evidencia de navegador del orquestador (harness 5245, CUA, no física LMU):
Signature solo Pos+Nombre 238x394 con banda de 22 px y campos Circuito Sebring
/ Restante 20:03 (82.078 y 75.281 px, sin solape); Broadcast solo Pos+Nombre
258x414 con banda de 22 px y campos visibles; con ambos datos en Ninguno la
banda desaparece (0 nodos) y Broadcast queda en 392 px (-22).
Revisión independiente Muse 1.3 Contributor aprobada sin bloqueantes; P2
238/258 cerrado. Límite vigente: bandera y temperaturas quedan en «—» hasta que
Telemetry Core admita la fuente real; no es aceptación física de Isaac.
Pendientes: prueba física conjunta e integración a Nightly.

ISA-1083 tiene CI verde en `87cef39a` (run 34431634439);
ninguna de las entregas se ha integrado en Nightly.
