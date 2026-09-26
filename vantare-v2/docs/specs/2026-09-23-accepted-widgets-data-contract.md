# Contrato de datos de los cinco widgets aceptados

Puente técnico: [#1347](https://github.com/isaacalbala12/Vantare-Simracing-Suite/issues/1347). Base: `nightly 8b25d076`. Seguimiento en Asana por instrucción explícita de Isaac. Alcance autorizado: corregir Delta, Pedals, Standings, Relative y Horizontal Standings y verificarlos extensamente, conservando el diseño y movimiento aceptados. No incluye Pedals Telemetry ni Fuel Strategy.

## Reglas compartidas

- El driver valida las lecturas; Go calcula referencias, orden, intervalos y unidades físicas. Los ViewModels presentan el resultado. Ningún renderer obtiene datos del simulador ni persiste configuración.
- Un dato ausente, inválido o caducado nunca se transforma en un cero fresco. El cero observado es válido cuando lo permite el campo. Cada canal conserva su calidad independientemente de sus vecinos.
- Conectando, detectando, parando y desconectado no son estados listos aunque quede un frame anterior. Cambiar sesión o fuente invalida las lecturas anteriores y reinicia la identidad del movimiento.
- Studio, Desktop, OBS y Workshop usan el mismo contrato, ViewModels y `WidgetVisualHost`. Las escenas sintéticas demuestran presentación y transiciones; no certifican mediciones reales.
- Identidad y posición son distintas. El número de coche conserva ceros iniciales; no se inventa una posición desde el índice de una lista. Un ID estable gobierna animaciones y presencia.
- Idioma y formato son preferencias de presentación. Los catálogos se resuelven al cambiar idioma y las unidades en la proyección correspondiente; no se traduce ni se reconstruyen catálogos por muestra de telemetría.
- Se mantienen límites de frecuencia, historial y tamaño del frame. Las ampliaciones se miden contra los presupuestos existentes; no se elevan para hacer pasar una prueba.

## Delta

La referencia elegida (mejor personal, mejor de sesión o vuelta anterior) selecciona un resultado resuelto en Go. Si se usa una alternativa, se expone la referencia efectiva; jamás se rotula una comparación con una referencia distinta. Las referencias simultáneas de dos instancias no interfieren entre sí. Mejor/última vuelta y delta conservan calidad propia. Verde/rojo indican el signo de un dato válido; cruzar cero no desplaza la cifra. No hay interpolación que altere el dato mostrado.

## Pedals

Acelerador, freno y embrague representan lecturas normalizadas 0–1, presentadas como 0–100 %. Cada canal ausente o inválido muestra indisponibilidad, no 0 %. Valores fuera de rango se rechazan en la entrada. Desconexión no congela una entrada como si fuese actual. Se conserva la presentación aceptada y no se confunde este widget con el historial de Pedals Telemetry.

## Standings

Orden por clasificación, distinta del orden físico en pista. Posición, posición de clase, vueltas, boxes e identidad requieren evidencia propia. En práctica/clasificación se muestran tiempos de vuelta válidos; en carrera los gaps usan una referencia explícita. El intervalo corresponde al rival inmediatamente anterior de la clasificación indicada; un gap al líder no se reutiliza como intervalo. En vista de clase, el intervalo nativo solo se presenta si el predecesor absoluto comprobado pertenece a esa misma clase; en otro caso se muestra «—». No se estima restando gaps al líder. Las comparaciones de ritmo en práctica/clasificación usan el mejor tiempo de la clase presentada.

En multiclase no se mezclan segundos al líder absoluto con un rótulo de líder de clase. Una diferencia de vueltas no se calcula solo restando contadores en la línea: se considera progreso en pista y longitud real. Sin una comparación fiable se muestra «—». Vueltas cero son distintas de vueltas desconocidas. El jugador no necesita estar en la ventana visible para alimentar datos de sesión. Los controles del pie se respetan y la geometría se adapta al contenido activo. El compuesto de neumático carece de fuente V2: su activación permanece deshabilitada; los perfiles antiguos conservan su columna vacía y geometría.

## Relative

Orden por proximidad física circular en pista respecto al jugador, independientemente de la clasificación. Se requieren distancia y longitud de pista reales; no se deduce el lado usando posiciones de carrera ni gaps temporales. Cada rival aparece una sola vez, con los más cercanos junto al jugador. Rejillas pequeñas, cruces de meta y desapariciones no inventan filas.

El filtro de misma clase se aplica antes de limitar los vecinos. Número de coche y mejor vuelta llegan del contrato real. La señal de doblado expresa diferencia de progreso respecto al jugador, con calidad válida y solo por circuitos completos de separación. Cruzar la línea de meta sin completar un circuito de diferencia no crea una señal. Estar delante físicamente no implica ir delante en la clasificación. Movimiento suave y color muy tenue; jugador y cifras estables. Reentradas recuperan su fila y opacidad.

## Horizontal Standings

Comparte semántica de clasificación, vueltas y calidad con Standings. No muestra segundos cuando el gap es de vueltas. El carrusel aceptado mueve únicamente las tarjetas de pilotos de derecha a izquierda, ocultándolas bajo el bloque fijo de vuelta; la copia decorativa no duplica contenido accesible. Respeta movimiento reducido. Es una opción real del widget, no una capacidad exclusiva de una escena.

El bloque «Vuelta» usa la vuelta actual del jugador, campo canónico independiente de la ventana visible. Supuesto recomendado comunicado a Isaac tras la consulta opcional; permite corrección posterior si prefiere el líder. No equivale a vueltas completadas.

## Meteorología y SOF

Decisión explícita de Isaac: **SOF no debe salir por ahora**. No se ofrece en los controles públicos ni se activa por configuraciones importadas antiguas.

La REST API de LMU proporciona meteorología en `/rest/watch/sessionInfo`. Se conectan las lecturas demostradas con sus unidades y calidad; `/rest/sessions/weather` contiene configuración/previsión y no sustituye observaciones actuales. Temperatura ambiente y de pista son campos independientes. La humedad de pista REST se convierte desde 0–1. La lluvia usa severidad nativa SHM 0–1, presentada como porcentaje de intensidad, no como probabilidad de precipitación. Viento REST carece aún de unidad demostrada y permanece ausente; véase [evidencia](../analysis/isa-1347-weather-authority.md). La dirección cardinal y la presión no se inventan si no hay autoridad demostrada. Una prueba de fixture no equivale a comprobar la sesión física actual de LMU.

## Verificación y aceptación

Regresiones de los defectos encontrados, pruebas de fronteras y calidad por campo, cambios de sesión, transporte/lector/ViewModel/renderer y configuración. Medición del frame representativo y adverso, pruebas de frecuencia e identidad, suite frontend, pruebas Go aplicables, tipos, compilación y ratchet. Una revisión independiente lee el diff integrado y repite verificaciones críticas.

La entrega identifica exactamente qué se ha comprobado y sobre qué árbol. Para certificar la salida pública todavía se necesita evidencia de una sesión LMU activa en Windows, reconexión y consumidores Desktop/OBS. La aceptación visual anterior permanece; las tareas de corrección siguen abiertas hasta su verificación. No se deduce autorización de merge, promoción ni publicación de este contrato.

## Representación y compatibilidad del transporte

Go conserva QValues y nombres descriptivos internamente. En Standings, los tiempos `gap`, `bestLap` y `lastLap` viajan como números sin pérdida de precisión y heredan una calidad base con overrides explícitos. Alias del wire: `q=quality`, `cg=classGap`, `cl=classGapLaps`, `cr=classRef`, `i=interval`, `il=intervalLaps`. Dentro de calidad, `g/b/l` representan los tres tiempos; los códigos `f/s/m/i` significan fresh/stale/missing/invalid. No se agrupan metadatos entre secciones con distinta frecuencia.

El lector admite tanto QValues anteriores como esta representación; valida y expande únicamente las filas nuevas en la entrada. Las filas congeladas reutilizadas por una actualización parcial no se vuelven a normalizar. Los widgets reciben siempre su modelo descriptivo habitual. Los tipos generados separan explícitamente `OverlayWireUpdateV2`/`OverlayStandingWireRowV2` de los modelos normalizados. Las actualizaciones parciales conservan el cómputo de bytes originales, no el tamaño expandido en memoria; un rechazo no modifica la base anterior.

En Relative, ausencia de `authority` significa `derived`; `native` y `estimated` siguen explícitos y un valor desconocido se rechaza. Posición `0` significa desconocida, conserva el frame y se presenta como «—»; negativos y posiciones fraccionarias se rechazan.

Compatibilidad unidireccional: el lector nuevo admite el wire anterior; un lector viejo estricto no tiene por qué admitir la representación nueva. Backend y frontend se distribuyen juntos y Desktop/OBS deben cargar los recursos del mismo build. No se presenta como compatibilidad entre versiones arbitrarias.

Presupuestos sin ampliar: 65.536 bytes para el escenario representativo y 73.728 para el adverso. Con 104 coches, tres referencias Delta, historial de 120 y las tres ventanas Relative, el corte integrado mide 64.880 bytes (nombres de 20 caracteres), 71.120 (32 caracteres) y 73.096 al mezclar tres calidades en todas las filas. No equivale a afirmar que cualquier longitud de texto o cualquier combinación imaginable cabe; el límite duro sigue rechazando excesos.
