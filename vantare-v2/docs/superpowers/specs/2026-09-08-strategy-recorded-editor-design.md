# Strategy: asistente y edición de telemetría registrada

Fecha: 2026-09-08. Issue: #1028; continuación del expediente #694.
Estado: decisiones funcionales acordadas con Isaac; especificación escrita v1
pendiente de su revisión. No es autorización para implementar ni promover.
Base inspeccionada: `origin/nightly@d6d0992f8dbc800ccb6d75f60fffdc7c3d561da2`.

## 1. Objetivo y alcance

Transformar la experiencia de Strategy en un asistente de preparación de carrera
seguido por una pantalla de estrategia editable, calculada sobre telemetría
registrada y corregida de forma trazable. La primera entrega soporta únicamente
LMU/DuckDB. El contrato debe admitir lectores de otros formatos incorporados por
Vantare, sin un sistema de plugins ni promesa de soporte multisim ya entregado.

Live, recálculo durante la carrera e investigación OSS para esa fase quedan
aplazados hasta completar y validar este corte. Monte Carlo es una alternativa
futura que se investigará, no una arquitectura aprobada ni un requisito actual.
El nuevo alcance prevalece sobre la secuencia histórica de #694 para este corte.
El catálogo comunitario y su publicación no son prerrequisitos nuevos de esta
entrega; el código existente no se elimina de manera oportunista.

No se exige conservar ni migrar estrategias antiguas como compatibilidad del
nuevo editor: Isaac declara que no han sido usadas públicamente. Esta decisión
no autoriza borrar archivos originales, telemetría ni datos ajenos a Strategy.
No se elimina almacenamiento durante esta issue documental.

## 2. Experiencia aprobada

Se elige asistente inicial más pantalla editable frente a un asistente permanente
o un editor único denso: preparación guiada con acceso directo posterior a cada
configuración. Las pantallas son sucesivas, con una experiencia tipo videojuego;
la composición visual concreta se revisará con prototipos antes de implementar UI.

- Manual comienza configurando la carrera; no significa escribir resultados del
  motor ni aportar consumos ficticios.
- Automático busca sesiones en ubicaciones autorizadas y propone eventos o
  combinaciones disponibles. Después entra en el mismo flujo y usa el mismo motor.
- Recorrido: simulador, evento de calendario o carrera personalizada, categoría y
  coche, circuito y trazado, condiciones/reglas, pilotos, revisión de telemetría,
  generación de propuesta. Datos ya fijados por el evento se confirman, no se
  vuelven a introducir obligatoriamente.
- Identidad: simulador, categoría/coche y circuito/trazado. Una categoría con un
  solo coche puede resolver esa elección; una categoría multicar no permite
  mezclar silenciosamente todos los coches.
- Condiciones obligatorias según evento: duración o vueltas, pilotos y orden,
  disponibilidad y límites de conducción, cambios obligatorios, ventanas de
  parada, neumáticos, Fuel, energía virtual, capacidades, reservas y reglas de
  servicio. Se obtienen del evento cuando existan y se confirman/completan.
- Clima procede del evento cuando esté disponible o de configuración explícita.
  No se requiere adquisición live ni captura REST nueva en este corte.

Toda la experiencia de selección y corrección está dentro de Strategy. La revisión
sencilla muestra fuentes y causas; la visión avanzada expone sesiones, stints,
vueltas, canales y, cuando sea necesario, muestras individuales.

## 3. Archivos y correcciones

Los originales son inmutables. Se usan desde su ubicación; el usuario puede pedir
una copia a una carpeta específica. La app propone carpetas habituales y solicita
autorización inicial para leerlas; después descubre archivos nuevos dentro de
ese permiso. No amplía la búsqueda silenciosamente a todo el PC.

Correcciones reversibles: incluir/excluir observaciones, corregir clasificaciones
y límites de stint, y corregir valores concretos con motivo y valor original.
No se incluyen fórmulas masivas, interpolación automática ni transformación libre
de señales sin una necesidad y un diseño posterior demostrados.

Se separan las correcciones de una sesión de la selección utilizada por un plan.
Cada propuesta aceptada referencia una versión exacta de fuentes, correcciones,
selección, reglas y cálculo. Cambiar datos no reescribe planes aceptados. Se detecta
un archivo modificado mediante identidad de contenido; no se confía solo en la ruta.
Si un archivo desaparece sin copia, el plan guardado puede consultarse, pero se
explica que no puede repetirse el análisis desde ese original. La representación
técnica exacta de revisiones se resolverá reutilizando el repositorio existente.

## 4. Calidad por cálculo

Una vuelta invalidada por LMU no es automáticamente inútil. Se acepta cuando siga
siendo representativa para la familia calculada. Un incidente puede invalidar el
ritmo sin invalidar todas las lecturas; se pueden aprovechar tramos sanos si las
fronteras y unidades permiten hacerlo de forma verificable.

La auditoría previa debe revisar formación, entrada/salida de boxes, paradas,
banderas, trompos, daños, tráfico, cortes, lecturas erróneas, discontinuidades,
temperatura de pista, estado del circuito, compuestos, edad/desgaste de neumáticos,
carga de Fuel y energía virtual. Cada condición será detectable, incierta o no
soportada según la señal real. Un ritmo lento por sí solo no demuestra un incidente.

Se distinguen variaciones normales de anomalías: no excluir degradación real,
vueltas lentas válidas o cambios de condiciones para obtener predicciones optimistas.
La selección automática informa razones y permite revisión. Una inclusión manual
queda como corrección explícita y no oculta defectos duros de integridad.

Las sesiones se combinan por compatibilidad y calidad demostrada, con selección
visible. No se extrapola automáticamente entre clima, temperatura, compuesto o
coches; los ajustes entre condiciones necesitan observaciones que los respalden.
No se pretende separar efectos de Fuel y neumático si los datos no lo permiten.

Los umbrales y tamaños mínimos de muestra son resultados de una auditoría del
corpus previa a implementar criterios. Esta spec fija cómo validarlos, no números
arbitrarios ni la garantía imposible de detectar cualquier incidente sin señales.

## 5. Motor y resultados

Se reutiliza SolverV2 como autoridad de optimización. Objetivo: menor tiempo total
previsto dentro del modelo y restricciones, con margen e incertidumbre explícitos.
Fuel y energía virtual permanecen separados. No se confunde capacidad con recurso
inicial necesario ni ausencia de datos con cero consumo.

Primero se presenta una propuesta y, solo cuando sean útiles, alternativas
justificadas con los mismos datos y reglas. Después pueden fijarse piloto, parada
o duración de stint, también arrastrando sus límites. Recalcular conserva la
restricción, indica su coste respecto al óptimo inicial y explica inviabilidad.
Una petición imposible puede quedar pendiente de edición; no se presenta como
plan ejecutable. No cambia silenciosamente el recurso o la regla para hacerla válida.

Estadísticas baratas se actualizan al editar; la optimización es explícita mediante
Recalcular. El plan queda marcado como desactualizado si cambian sus entradas.
Cancelación y presupuesto de cálculo deben terminar también el trabajo backend.

Sin telemetría suficiente se permite configurar y guardar la carrera y calcular
solo magnitudes respaldadas: cada resultado declara dependencias ausentes,
procedencia y alcance. No se llama estrategia óptima completa a una salida parcial.
No se usan referencias externas para rellenar huecos de forma automática.

En resistencia, un piloto sin observaciones puede recibir el ritmo del piloto de
referencia con aviso y diferencia editable en segundos/vuelta, mostrando también
el tiempo resultante. Es una estimación versionada, no telemetría observada; no
implica diferencias inventadas de consumo o desgaste. Esta excepción no habilita
escenarios generales de ahorro/ritmo hipotético, excluidos inicialmente.

## 6. Fronteras y reutilización

La ubicación visible de la edición no cambia las responsabilidades internas:

1. Lectores e importación en Telemetry Analysis normalizan formatos y declaran
   capacidades, unidades, identidad y calidad. LMU/DuckDB es la única implementación
   exigida. Strategy no abre SQL ni añade otro acceso a archivos del simulador.
2. Analysis conserva la autoridad sobre sesiones, correcciones y derivación de
   familias. Expone contratos al consumidor, no su almacenamiento privado.
3. Strategy conserva evento, selección de entradas, restricciones, revisiones,
   propuestas y SolverV2; Go calcula y valida.
4. React/Wails presenta el asistente, edición avanzada y resultados sin un segundo
   cálculo de estrategia en TypeScript. No obliga a navegar a otra sección.

La implementación auditará la reutilización del catálogo, selección por calendario,
importador, proyección v2, repositorio y tests de SolverV2 antes de sustituirlos.
La evolución de contratos requiere revisión acotada y ADR solo si cambia las
responsabilidades aprobadas. No se añade una dependencia en esta spec.

## 7. Errores y continuidad

Se distinguen falta de archivos, permisos, formato no soportado, runtime ausente,
archivo cambiado, corrupción, muestra insuficiente y cálculo inviable. Cada estado
conserva configuración y ofrece una acción concreta de recuperación.
La recuperación y cancelación pendientes de #819/#821 y el diagnóstico de #803
deben contrastarse con la base actual e incluirse cuando bloqueen el recorrido.
No se dan por pendientes de implementar #813/#824 sin revisar lo ya integrado.
Respuestas tardías no reemplazan una revisión nueva ni levantan bloqueos de otra.

## 8. Aceptación y evidencia

Dos pruebas independientes son obligatorias: corrección matemática del motor y
validez empírica de los datos/modelo. Una no sustituye a la otra.

- Corpus: inventariar carreras completas reales del PC, con autorización de lectura,
  sin modificar originales ni versionar rutas personales o material sensible.
- Separar sesiones de preparación y evaluación antes de ajustar criterios; ninguna
  carrera se predice usando sus propios resultados futuros. Evitar duplicados entre
  conjuntos y documentar cobertura por combinación y condiciones.
- Anotar y revisar muestras reales con incidentes, vueltas invalidadas utilizables,
  vueltas lentas normales, cambios de temperatura, neumáticos y boxes. Medir tanto
  contaminación que pasa el filtro como datos válidos que se excluyen por error.
- Comprobar fórmulas/unidades y reproducir decisiones contra enumeración exhaustiva
  en espacios acotados, incluidas reserva Fuel/VE, reglas de servicio, límites de
  pilotos, ventanas, empates, inviabilidad y cancelación.
- Evaluar predicciones en carreras reservadas: ritmo, consumo, tiempo y decisiones,
  separando conducción representativa, pit e incidentes. Los contrafactuales de una
  estrategia que no se corrió siguen siendo evaluaciones del modelo, no prueba de
  superioridad física observada.
- Prerregistrar métricas, umbrales y N mínimo a partir del conjunto de preparación
  antes de abrir evaluación. Una muestra insuficiente no puede declararse PASS.
- Recorrido real Wails/DuckDB: autorizar, descubrir, preparar, revisar, corregir,
  calcular, restringir, comparar, guardar, reiniciar y reproducir. Incluir ausencia
  de fuentes, errores recuperables, archivo cambiado y copia opcional.
- Gates de implementación: Go, frontend, typecheck real, build, lint aplicable,
  pruebas visuales/interacción e integración DuckDB, con resultados separados de
  pruebas Wails reales. Medir duración, memoria y cancelación sobre corpus real.

El cierre no promete exactitud fuera del modelo ni detección infalible de incidentes.
Exige evidencia reproducible de que los criterios aprobados evitan sesgos medidos
y de que el motor resuelve correctamente los inputs aceptados.

## 9. Secuencia propuesta para el plan posterior

1. Auditar implementación y corpus, criterios de calidad y cobertura de señales;
   definir protocolo y umbrales antes de programar nuevos filtros.
2. Concretar contratos mínimos, revisión de fuentes/correcciones y resultados
   parciales; resolver fiabilidad que bloquee el recorrido.
3. Validar prototipos del asistente y pantalla editable con Isaac.
4. Implementar cortes pequeños por issue reutilizando el motor y los owners.
5. Cerrar pruebas matemáticas, empíricas y Wails; resolver hallazgos.
6. Solo tras aceptación del corte, estudiar extensamente proyectos OSS y evaluar
   enfoques de recálculo live/Monte Carlo, compatibilidad de licencias y límites
   de evidencia; escribir un diseño propio para esa fase.

La revisión de esta spec precede al plan ejecutable y al código. No constituye
autorización de merge a nightly, promoción a testers/master ni release.
