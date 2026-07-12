# Strategy Planner Product B — Diseño canónico

**Fecha:** 2026-07-13
**Estado:** diseño aprobado; pendiente de revisión del documento por Isaac
**Referencia visual:** `C:\Users\isaac\Desktop\strategy-base.html`
**Producto objetivo:** primera versión pública de Strategy Planner

## 1. Autoridad y antecedentes

Esta especificación es la autoridad de producto y arquitectura para Product B. El documento `docs/analysis/tyre-strategy-planner-analysis.md` queda como antecedente histórico y no debe utilizarse como contrato canónico: describe un alcance anterior, una arquitectura limitada y reglas que han cambiado.

Product A ya está implementado y validado manualmente. Product B no lo extiende de forma incremental en su UI: crea el nuevo workspace público y reutiliza únicamente piezas de lógica que superen una auditoría total. Product C se apoya en los contratos validados de Product B, pero podrá realizar reworks o refactors profundos si sus necesidades de optimización, publicación o ejecución live lo exigen.

## 2. Resultado de producto

Product B debe ofrecer una herramienta pública, local y fiable para construir planes de carrera a partir de telemetría LMU o de entradas manuales. La interfaz general debe alcanzar una fidelidad visual casi 1:1 con el HTML de referencia y ser validada manualmente por Isaac.

Product B incluye:

- Galería privada local de planes y variantes.
- Descubrimiento e importación de telemetría DuckDB creada por LMU.
- Correcciones no destructivas en modo básico y avanzado.
- Modelos derivados con procedencia, confianza y tratamiento explícito de datos insuficientes.
- Workspace de tres columnas con estrategias, stints e inventario.
- Inventario manual de neumáticos individuales y drag and drop explícito.
- Cálculos de combustible, Virtual Energy, paradas, desgaste y fuel saving.
- Escenarios básicos auditados o sustituidos.
- Comparación básica de variantes.
- Persistencia, recuperación, importación y exportación exclusivamente locales.
- Layouts wide, medium y compact.

Product B no incluye:

- Sincronización cloud ni publicación de planes privados.
- Estrategias presentadas como óptimas.
- Vigilancia permanente de la carpeta de LMU.
- Seguimiento live, replanificación, overlays o spotter.
- Construcción de una herramienta completa de análisis de telemetría.
- Uso de un LLM para generar decisiones de estrategia.

## 3. Enfoque arquitectónico

Se adopta un nuevo workspace sobre capacidades reutilizables de Product A. La primera fase realizará una auditoría total y clasificará cada pieza existente como:

1. Reutilizable sin cambios.
2. Reutilizable después de aislarla o corregirla.
3. Sustituible.
4. Retirable cuando Product B alcance paridad.

No se conservarán contratos, algoritmos o UI por compatibilidad sentimental. La reutilización exige tests de caracterización, fórmulas verificables y ejemplos reales convincentes. Product A permanecerá temporalmente como red de seguridad; su UI se retirará gradualmente cuando Product B alcance paridad funcional y validación humana.

## 4. Telemetría como capacidad transversal

El parser de LMU no pertenece al Strategy Planner. Debe ser una capacidad compartida:

```text
DuckDB LMU
    -> lector DuckDB
    -> adaptador de esquema LMU
    -> modelo canónico de telemetría Vantare
       -> proyección Strategy Planner
       -> futura proyección de análisis de telemetría
       -> futuros consumidores
```

### 4.1 Responsabilidades

El núcleo compartido:

- Descubre archivos y esquemas.
- Lee sesiones, vueltas, canales y muestras.
- Normaliza nombres, unidades, tiempos e identidades.
- Conserva procedencia y calidad.
- Expone las capacidades disponibles.
- Permite consultas por sesión, vuelta, canal y rango temporal.
- Carga muestras de alta frecuencia solo bajo demanda.

El núcleo no contiene reglas de stints, combustible, neumáticos ni estrategias. React no ejecuta SQL ni importa DuckDB.

La proyección de Strategy Planner obtiene resúmenes por vuelta: ritmo, consumo, Virtual Energy, desgaste, condición y datos necesarios para el plan. Una futura sección de análisis podrá consultar trazas de alta frecuencia sin rehacer el lector.

### 4.2 Acceso DuckDB

LMU guarda por defecto la telemetría en:

`C:\Program Files (x86)\Steam\steamapps\common\Le Mans Ultimate\UserData\Telemetry`

Vantare debe detectar las bibliotecas de Steam, localizar LMU automáticamente y permitir corregir la ruta. Al abrir el selector se escanea la carpeta; existe un botón de actualización. La vigilancia permanente queda aplazada para Product C.

El flujo seguro es:

1. Detectar el archivo.
2. Comprobar que no sigue cambiando.
3. Crear una instantánea local.
4. Abrir la instantánea en solo lectura.
5. Inventariar esquema y compatibilidad.
6. Normalizar únicamente datos requeridos.

La investigación inicial comparará el driver oficial Go y el CLI oficial. La elección requiere verificar Windows, Wails, binarios nativos, tamaño, licencia, compatibilidad del formato y empaquetado. No se añade ninguna dependencia antes de esa decisión documentada.

### 4.3 Investigación con datos reales

Antes de fijar consultas se necesitan archivos reales anonimizados de práctica, clasificación y carrera. La investigación debe documentar tablas, columnas, tipos, relaciones, versiones y disponibilidad de circuito, coche, clase, clima, vueltas, validez, combustible, Virtual Energy y neumáticos.

No se asumirá que LMU expone todos los campos. Los fixtures de contrato deben representar también archivos incompletos, bloqueados, incompatibles y de versiones diferentes.

## 5. Capas de datos y trazabilidad

Product B separa cinco capas:

1. **Fuente original:** instantánea local inmutable, identificada por huella y metadatos.
2. **Sesión normalizada:** contrato versionado independiente del esquema LMU.
3. **Correcciones:** capa no destructiva con valor anterior, nuevo valor, fecha y motivo opcional.
4. **Modelo derivado:** promedios y distribuciones con procedencia, vueltas válidas y confianza.
5. **Plan:** consume modelos derivados o entradas manuales; nunca consulta DuckDB directamente.

Los valores derivados deben expresar su procedencia como dato observado, corrección, entrada manual, rango o desconocido. La confianza visible será `Alta`, `Media` o `Baja`, basada en cantidad de vueltas válidas, consistencia y origen. No se mostrará un porcentaje de confianza artificial.

Varias sesiones compatibles pueden combinarse, ponderando por vueltas válidas y conservando trazabilidad hasta cada sesión. La compatibilidad exige circuito, trazado, clase y coche exactos. Condiciones seca, húmeda y mojada producen modelos separados. Cambios de versión o BoP generan una advertencia y el usuario decide incluir o excluir sesiones antiguas.

Pit in/out y vueltas marcadas como invalidadas por LMU se excluyen automáticamente. Otras anomalías se marcan; el usuario decide si excluirlas. Se muestran promedio bruto y filtrado.

Si faltan datos, Vantare no fabrica precisión: utiliza un valor manual, un rango o `desconocido`. Para desgaste sin telemetría ni manual se usa inicialmente `40–70% restante` al final del stint, editable por plan y compuesto.

## 6. Selección y edición de telemetría

La pantalla previa muestra los archivos detectados como sesiones comprensibles: circuito, coche, fecha, tipo, condición, duración, vueltas y estado de importación cuando el esquema lo permita. El usuario puede seleccionar varias sesiones compatibles o usar entrada manual.

Una nueva importación de una fuente ya conocida crea una revisión pendiente. La UI ofrece:

- Aplicar al plan.
- Guardar como variante.
- Descartar.

Las correcciones no modifican la instantánea original.

### 6.1 Editor básico

Permite editar promedios relevantes de ritmo, consumo, desgaste, Virtual Energy y tiempos de parada. Muestra original, corregido y restaurar.

### 6.2 Editor avanzado

Es una tabla por vuelta con las columnas importantes, valores originales/corregidos, validez, exclusión y motivo. No edita muestras de alta frecuencia. Las gráficas son de inspección, no una segunda fuente de edición.

## 7. Galería y privacidad

Todos los planes privados permanecen exclusivamente en el equipo. No se diseña sincronización futura ni publicación automática.

La galería sigue el patrón de Overlay Studio:

- Jerarquía circuito -> clase -> coche -> evento.
- Varias variantes por evento.
- Una variante activa.
- Tarjetas resumen y vista compacta opcional.
- Búsqueda, condición, fecha, estado y etiquetas locales.
- Duplicar, importar, exportar y eliminar.
- Resumen generado con circuito, coche, variante, stints, compuestos, paradas y calidad de datos.

El borrador automático se guarda separado de la última revisión confirmada. `Guardar` consolida la variante; `Guardar como variante` crea otra. Existe historial local limitado y restaurable.

La exportación es una acción explícita. Al importar un archivo se valida versión y compatibilidad, se marca como externo y no se confía automáticamente en sus supuestos.

## 8. Inventario de neumáticos

El inventario es manual y contiene neumáticos individuales, no juegos. Su configuración principal es un control sencillo `Máximo de neumáticos`.

Al indicar `N`, Vantare crea `N` elementos visibles (`Soft #1`, `Soft #2`, etc.). La interfaz muestra compuesto, vida restante, stints asignados y estado. Reducir el máximo no puede eliminar silenciosamente neumáticos utilizados.

Cada stint expone cuatro destinos: FL, FR, RL y RR. El usuario arrastra explícitamente neumáticos del inventario a esos destinos, como en TinyPedal pero con el lenguaje visual de Vantare.

Reglas:

- Un neumático puede reutilizarse en varios stints.
- La primera posición donde se monta fija permanentemente FL, FR, RL o RR.
- Un intento posterior de cambiar esa posición se bloquea.
- Los compuestos pueden mezclarse libremente y sin advertencia.
- Los neumáticos nuevos se resaltan.
- El inventario muestra cuántos stints utiliza cada neumático.
- Las asignaciones imposibles se rechazan antes de modificar el plan.
- Debe existir interacción accesible equivalente al drag and drop.

Solo los neumáticos procedentes de clasificación pueden llegar gastados. El usuario decide cuáles son y parten con `80–90% restante`, editable cuando exista un dato mejor. Ya llegan con posición bloqueada. Ninguna otra sesión previa consume neumáticos.

## 9. Workspace y fidelidad visual

El flujo principal es:

1. Galería local.
2. Crear o abrir variante.
3. Seleccionar sesiones o entrada manual.
4. Revisar/corregir datos.
5. Workspace de tres columnas.
6. Comparar variantes.
7. Guardar y volver a galería.

El HTML es la referencia visual canónica. En wide se muestran las tres columnas: escenarios y fuel saving a la izquierda, stints en el centro e inventario/entrada manual a la derecha. En medium el plan central permanece y los laterales son paneles. En compact se usa un flujo por pestañas o pasos.

La fidelidad se verifica mediante baselines del HTML, fixtures deterministas, capturas Playwright, comparación visual en wide/medium/compact y aprobación manual de Isaac. Toda diferencia inevitable por shell, datos reales, scroll o responsive se documenta; el modelo no reinterpreta el diseño por iniciativa propia.

Product B no se considera terminado solo porque la lógica funcione: la interfaz debe estar validada y alcanzar paridad visual casi 1:1.

## 10. Entrada manual y cálculos

La entrada manual simplificada utiliza divulgación progresiva e incluye duración/vueltas, ritmo, consumo, depósito, parada, compuestos, inventario, desgaste estimado y Virtual Energy cuando corresponda.

Las carreras por tiempo calculan vueltas estimadas editables. Las carreras por vueltas calculan duración estimada. Combustible y Virtual Energy son modelos separados y se presentan conjuntamente cuando el coche usa ambos.

Editar un stint muestra una preview del impacto antes de aplicar. Se permite añadir, eliminar, duplicar y reordenar stints con validaciones.

### 10.1 Fuel saving

Se muestran dos objetivos:

1. **Completar el stint:** con capacidad 100 L y necesidad 101 L, ahorrar 1 L total distribuido entre las vueltas.
2. **Extender el stint:** ahorrar el consumo equivalente a una vuelta adicional.

La UI muestra déficit, ahorro total, ahorro por vuelta, vueltas sobre las que aplicarlo y coste temporal solo si existe evidencia o valor manual. Sin datos de coste temporal, se omite esa estimación.

### 10.2 Escenarios básicos

Los escenarios de Product A requieren auditoría completa: contratos, fórmulas, restricciones, generación de candidatos, ranking, explicaciones y casos límite. Se caracterizan con tests y casos reales. Si no son convincentes se sustituyen antes de exponerlos.

Product B los denomina `Escenarios básicos`, nunca `Óptimos`. Solo se generan alternativas válidas y se explican sus diferencias. La comparación muestra tiempo, paradas, combustible, neumáticos, riesgo, confianza y supuestos.

## 11. Persistencia y errores

Planes, variantes, borradores, correcciones, índices e instantáneas derivadas son locales. Los contratos tienen versión, IDs estables, backups y migraciones comprobables.

Casos obligatorios:

- DuckDB todavía en escritura: pendiente, no error destructivo.
- Archivo corrupto/incompatible: error aislado y accionable.
- Archivo duplicado o movido: identidad por huella y metadatos, no solo ruta.
- Fuente eliminada: mostrar planes afectados antes de confirmar.
- Sesiones incompatibles: impedir mezcla accidental.
- Dato ausente: manual, rango o desconocido.
- Corrección inválida: conservar último estado válido.
- Migración fallida: backup y apertura segura en solo lectura cuando sea viable.
- Cierre inesperado: recuperación del borrador.
- Logs: rutas sanitizadas y sin contenido sensible.

## 12. Product C

Product C queda como roadmap e investigaciones separadas. Puede introducir reworks y refactors profundos; Product B es una base validada, no una restricción arquitectónica permanente.

Áreas previstas:

- Optimización multiobjetivo: tiempo, riesgo, neumáticos, robustez y equilibrio configurable.
- Comparación avanzada y sensibilidad.
- `Estrategias de Vantare`: referencias oficiales públicas, versionadas, de solo lectura y copiables a la biblioteca privada.
- Investigación aislada de LLM; sus resultados deben ser verificables por algoritmos deterministas y puede concluir que no aporta valor.
- Seguimiento live del plan activo.
- Detección de desviaciones y replanificación con confirmación.
- Contrato versionado reducido para overlays, widgets y spotter.

Una actualización oficial nunca sobrescribe una copia privada. La investigación de publicación debe definir producción, validación, firma, distribución y actualización sin utilizar telemetría privada del usuario.

## 13. Desarrollo incremental y gates

Orden de microcortes previsto:

1. Auditoría total de Product A.
2. Investigación DuckDB con archivos reales.
3. Contrato transversal de telemetría.
4. Baseline visual estático del flujo completo.
5. Galería y persistencia.
6. Descubrimiento e indexación LMU.
7. Normalización de sesiones/vueltas.
8. Correcciones básicas.
9. Tabla avanzada por vuelta.
10. Modelos derivados, procedencia y confianza.
11. Workspace con datos reales.
12. Inventario y drag and drop.
13. Combustible y Virtual Energy.
14. Fuel saving.
15. Auditoría/sustitución de escenarios básicos.
16. Comparación y variantes.
17. Responsive.
18. Accesibilidad, i18n y rendimiento.
19. Migración útil y retirada controlada de Product A.
20. Cierre público de Product B.

Cada microcorte termina en una pausa y exige tests, Playwright cuando aplique, comparación visual cuando aplique, build, code review, evidencia documentada y validación manual de Isaac. Nada entra en `develop` hasta estar probado al 100% por Isaac y recibir aprobación explícita.

Los planes de ejecución para modelos menores deben ser autocontenidos: objetivo, no alcance, archivos esperados, contratos, tests primero, comandos, fixtures, stop conditions, entrega y verificación manual.

## 14. Linear y Git

Se crearán dos proyectos:

- `Strategy Planner — Product B`: proyecto de entrega pública.
- `Strategy Planner — Product C`: roadmap e investigaciones.

Product B se divide en issues padre por fase y subissues ejecutables por microcorte. Las investigaciones DuckDB, escenarios básicos, optimizador, LLM, estrategias oficiales y ejecución live son issues independientes.

Cada issue ejecutable con cambios en repo utiliza una rama Linear, un worktree y un chat Codex. Los agentes pueden crear rama, commit, push y PR; no pueden integrar en `develop`. La aprobación manual se registra antes de integración.

## 15. Criterios de cierre de Product B

Product B se considera completado cuando:

- El flujo completo funciona con telemetría real y entrada manual.
- La fuente original y las correcciones son auditables y no destructivas.
- Varias sesiones compatibles producen resultados trazables.
- El inventario individual y su drag and drop cumplen las reglas de posición.
- Fuel, Virtual Energy, desgaste y fuel saving están verificados.
- Los escenarios básicos han sido auditados o sustituidos.
- Galería, variantes, borradores y recuperación funcionan localmente.
- Wide, medium y compact pasan Playwright y revisión visual.
- Accesibilidad, i18n y presupuestos deterministas de rendimiento están cubiertos.
- No hay publicación ni subida automática de datos privados.
- La UI alcanza fidelidad casi 1:1 y recibe aprobación manual de Isaac.
- La migración desde Product A está probada y su retirada no pierde capacidades útiles.

## 16. Decisiones explícitamente diferidas

- Esquema exacto de DuckDB LMU hasta inspeccionar muestras reales.
- Driver Go o CLI hasta validar empaquetado y licencia.
- Umbrales exactos de confianza hasta analizar distribución de datos reales.
- Presupuestos numéricos de rendimiento hasta obtener baseline.
- Algoritmos óptimos, publicación oficial, LLM y runtime live hasta Product C.
- Reworks/refactors concretos de Product C hasta conocer sus contratos finales.
