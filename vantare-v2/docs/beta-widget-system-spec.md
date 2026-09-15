# Beta Widget System Spec

> **Ámbito documental (2026-09-14):** Especificación histórica; no es una lista de capacidades implementadas ni un mandato de construir otro editor.
> [Referencia vigente](overlays-studio/os-09-overlay-workshop-contract.md).


Documento tecnico para workers que implementen el sistema beta de widgets.

Este documento no es roadmap ni documento de producto. Su objetivo es evitar interpretaciones distintas entre agentes al implementar personalizacion avanzada de widgets.

## Objetivo

La beta debe permitir configurar widgets principales de LMU de forma potente y controlada, empezando por:

- `Relative`
- `Standings`
- `Pedals`

El sistema debe soportar personalizacion tipo Racelab sin convertir `WidgetStudio` en un editor libre tipo Figma.

La regla base es:

- `WidgetStudio` edita configuracion interna del widget.
- `LayoutStudio` edita posicion, tamano y colocacion en el lienzo.

## Reglas no negociables

- No implementar todo el contrato beta de golpe.
- Cada cambio debe declarar un corte incremental concreto.
- No cambiar el formato real de perfiles sin un plan separado de schema, migracion, backup y tests.
- No migrar perfiles de forma silenciosa.
- No inventar datos si LMU no los expone de forma fiable.
- No mostrar metricas dudosas en `stable`.
- No anadir dependencias sin aprobacion.
- No mezclar refactor general con implementacion de slots, metricas o templates.
- No tocar `LayoutStudio` para implementar apariencia/datos internos.
- No tocar `WidgetStudio` para implementar posicion/tamano.

## Glosario

### Template

Define la estructura visual y funcional de un widget.

Un template declara:

- regiones,
- slots,
- columnas,
- grupos de columnas,
- filas repetidas,
- zonas de footer/header si existen,
- limites de lo que el usuario puede editar.

Un template no debe contener posicion global en pantalla. Eso pertenece al layout.

### Theme

Define la apariencia base reusable:

- colores,
- opacidad,
- tipografia,
- bordes,
- densidad,
- sombras si existen.

Cambiar theme no deberia romper slots, columns o column groups compatibles.

### Variant

Configuracion interna reutilizable de un widget.

Una variante combina:

- widget type,
- template,
- theme,
- slots,
- metricas,
- formatos,
- filtros,
- comportamiento interno.

Una variante no guarda posicion ni tamano global del widget.

### Layout

Lista de instancias colocadas en el lienzo.

Un layout define:

- que widgets aparecen,
- posicion,
- tamano,
- orden,
- si una instancia esta activa.

El layout referencia variantes por `variantId`.

### Region

Parte estructural declarada por un template.

Ejemplos:

- zona superior,
- filas de pilotos,
- footer,
- columna de informacion,
- badges,
- bloque de tiempos.

La UI puede mostrar estas regiones como partes editables, pero no debe obligar al usuario a entender el termino tecnico.

### Slot

Hueco configurable dentro de una region.

Un slot define donde puede mostrarse una metrica o elemento visual en una zona fija o semanticamente unica.

Ejemplos:

- footer derecho,
- badge de piloto,
- indicador de clase.

### Column

Columna repetida dentro de filas.

Una columna aparece una vez por cada fila/piloto.

Ejemplos:

- nombre de piloto,
- gap,
- clase,
- numero de coche,
- ultima vuelta.

### Metric

Dato seleccionable para un slot, column o column group.

Una metrica define:

- id estable,
- label,
- fuente de datos,
- formato por defecto,
- fallback,
- widgets compatibles,
- slots, columns o column groups compatibles,
- release channel y disponibilidad.

### ColumnGroup

Grupo de columnas opcionales dentro de filas repetidas.

Esto es obligatorio para `Relative` y `Standings`.

Ejemplo:

- activar `fastest lap times` anade una columna por piloto;
- activar `last lap times` anade otra columna;
- el overlay puede ensancharse o compactarse segun politica del template.

Un `ColumnGroup` no es un simple toggle visual. Cambia la estructura de filas.

En beta, la UI debe permitir activar/desactivar columnas individuales. Un `ColumnGroup` puede existir como agrupacion tecnica, pero no debe obligar al usuario a activar un bloque completo si quiere solo una columna.

Un `ColumnGroup` debe declarar como minimo:

- id estable;
- label;
- columns incluidas;
- visibilidad por defecto;
- ancho recomendado;
- politica de ancho;
- formatos aplicables;
- release channel;
- requisitos de datos.

### MetricFormat

Configuracion de formato aplicada a una metrica concreta.

Ejemplos:

- decimales,
- ocultar minutos en tiempos de vuelta,
- fallback `-`,
- mostrar icono o label,
- formato de nombre de piloto,
- unidad visible u oculta.

### ReleaseChannel

Canal de disponibilidad:

- `stable`: visible para usuarios normales.
- `tester`: visible con modo tester.
- `dev`: solo desarrollo local.

El modo tester se activa con la secuencia `V A N T A R E`.

El modo tester debe estar documentado para testers. No debe comunicarse como feature publica general.

## Racelab reference behavior

Racelab se usa como referencia de comportamiento para entender profundidad de configuracion. No es una UI que se deba copiar pixel a pixel.

Las capturas de referencia muestran patrones que este sistema debe poder modelar:

- preview central del overlay;
- panel lateral de configuracion;
- secciones tipo acordeon;
- activacion/desactivacion de columnas;
- columnas opcionales que ensanchan el `Relative`;
- formato por metrica, como decimales u ocultar minutos;
- reordenacion de columnas como feature futura;
- badges, flags y tags como partes separadas;
- controles globales de visibilidad, apariencia y comportamiento.

El objetivo es capturar el modelo de configuracion, no clonar la interfaz.

## Editor interaction model

El editor debe combinar organizacion por secciones con seleccion contextual.

Debe permitir:

- ver secciones tipo Racelab para agrupar ajustes;
- seleccionar partes del widget desde la preview cuando sea viable;
- saltar al ajuste correspondiente al hacer click en una parte de la preview;
- usar una lista o arbol compacto de partes para zonas dificiles de clicar;
- mostrar solo controles relevantes para la parte seleccionada.

No debe convertirse en:

- panel gigante plano;
- editor libre tipo Figma;
- lista de props sin relacion visual con el widget.

La UI puede usar nombres amigables para usuarios. Los nombres tecnicos de este documento son para workers y codigo.

## Separacion WidgetStudio / LayoutStudio

### WidgetStudio puede editar

- template elegido,
- theme elegido,
- variante actual,
- slots,
- columnas internas,
- metricas,
- column groups,
- filtros del widget,
- formatos,
- colores internos,
- visibilidad interna,
- comportamiento interno.

### WidgetStudio no puede editar

- posicion X/Y global,
- ancho/alto global de la instancia,
- orden global en el canvas,
- eliminar instancia del layout,
- acciones live de abrir/detener overlay.

### LayoutStudio puede editar

- posicion,
- tamano,
- colocacion,
- activacion de instancia,
- seleccion de variante para una instancia,
- abrir/detener overlay del perfil activo.

### LayoutStudio no puede editar

- metrica de un slot o columna,
- columnas internas,
- column groups,
- theme,
- estilo interno,
- formato de datos.

## Intrinsic size vs layout size

Activar columnas internas puede cambiar el tamano natural del contenido de un widget.

Esto no significa que `WidgetStudio` pueda editar el tamano global de la instancia.

Reglas:

- `WidgetStudio` puede cambiar estructura interna que afecte el ancho natural del widget.
- `WidgetStudio` no edita X/Y/W/H del layout.
- `LayoutStudio` decide posicion y tamano externo de la instancia.
- Si el contenido interno necesita mas ancho, el sistema debe mostrarlo en preview y usar una politica clara:
  - auto-fit interno por defecto,
  - compactacion,
  - overflow controlado,
  - aviso de que el layout necesita mas ancho.
- Ningun worker debe resolver esto moviendo o redimensionando la instancia desde `WidgetStudio`.

La beta debe priorizar ensanchado automatico del contenido interno cuando se activan columnas. El usuario debe poder controlar cuanto ocupa una columna mediante formatos visuales cuando aplique.

Ejemplos:

- mostrar una vuelta como `1:35.765`;
- mostrar una vuelta como `35.765`;
- ajustar decimales;
- ocultar unidades o labels.

Las decisiones exactas de formato visual deben marcarse como por concretar en el miniplan correspondiente si todavia no estan cerradas.

El formato avanzado inicial de beta debe incluir:

- tiempos;
- nombres;
- anchos;
- colores por columna cuando aplique;
- alineacion si el template lo permite.

## Profile Schema v2 conceptual

El schema v2 debe soportar:

- un perfil con varios layouts internos;
- layout `general` obligatorio;
- layouts opcionales por sesion;
- variantes de widgets reutilizables;
- instancias de widgets que referencian variantes;
- separacion entre configuracion interna y posicion/tamano;
- metadatos de origen para recomendados copiados como propios;
- version de schema para migraciones futuras.

No se define todavia el JSON final.

Cualquier implementacion de schema v2 debe tener un miniplan propio con:

- alcance exacto,
- migracion,
- confirmacion de usuario,
- backup,
- tests con fixture antiguo,
- verificacion manual.

## Layout types

El sistema debe partir de un catalogo central, no de strings sueltos.

Layouts previstos:

- `general`: obligatorio.
- `practice`: opcional.
- `qualifying`: opcional.
- `race`: opcional.
- `endurance`: opcional.

Si falta un layout especifico, el fallback es `general`.

El auto-switch por sesion entra en beta. Si la sesion no se detecta bien o no hay layout especifico, el sistema debe usar `general`.

Si el usuario esta editando y hay cambios sin guardar, el auto-switch no debe pisar la edicion activa. Debe bloquearse, aplazarse o pedir confirmacion segun el flujo concreto del miniplan.

## Recommended vs Own

Los recomendados son readonly.

Al guardar un recomendado como propio:

- se copian layouts;
- se copian variantes usadas;
- las copias pasan a ser editables;
- se guarda metadata de origen;
- no se muta el recomendado original.

Las vistas de usuario deben separar visualmente:

- creados por mi;
- guardados desde recomendados.

## Recommended variant rules

Un recomendado no se edita directamente.

Si el usuario intenta editar un recomendado:

- mostrar aviso de solo lectura;
- ofrecer `Crear copia editable`;
- ofrecer `Cancelar`.

Al crear copia editable:

- se copian layouts necesarios;
- se copian variantes usadas;
- la copia queda en la zona de guardados desde recomendados;
- la copia ya puede editarse;
- el recomendado original no cambia.

## Variantes vivas

Una instancia de widget referencia una variante.

Si una variante se usa en varios layouts, editarla afecta a todas sus instancias.

Las variantes deben ser visibles para el usuario desde el primer corte que incluya personalizacion persistente.

Antes de editar una variante con `usageCount > 1`, la UI debe avisar:

- editar variante compartida;
- duplicar y editar solo aqui;
- cancelar.

## Templates, regions, slots, columns y column groups

Un widget no debe modelarse como `header / rows / footer` fijo salvo que ese sea solo un template concreto.

El modelo correcto es:

- template declara regiones;
- region declara slots, columns y/o column groups;
- slot declara tipos de metrica compatibles;
- column declara metricas compatibles para filas repetidas;
- column group declara columnas opcionales y politicas de ancho;
- editor se genera desde el template.

Esto permite que un futuro template tenga:

- sin header;
- header lateral;
- footer flotante;
- filas compactas;
- tarjetas por piloto;
- formato broadcast;
- horizontal minimal;
- endurance stack.

## Template compatibility and semantic roles

Cambiar de template puede afectar slots, columns y column groups.

Cada parte importante debe declarar un `semanticRole` cuando sea posible.

Ejemplos:

- `driverName`
- `gap`
- `interval`
- `bestLap`
- `lastLap`
- `footerLap`

Al cambiar template:

- el sistema debe intentar mapear ajustes por `semanticRole`;
- si una parte no tiene equivalente, debe avisar;
- el aviso debe listar que ajustes se perderan;
- el usuario debe confirmar o cancelar;
- no debe haber perdida silenciosa.

No se exige conversion perfecta entre templates. Si el mapeo es dudoso, se debe pedir confirmacion.

## Metric catalog

Las metricas deben vivir en catalogos, no como props sueltas en componentes.

Cada metrica debe declarar:

- `id`;
- `label`;
- fuente de datos;
- widgets compatibles;
- slots compatibles;
- columns compatibles;
- column groups compatibles si aplica;
- formatter;
- fallback;
- release channel;
- estado de fiabilidad.

Los ids de metricas deben ser estables y no depender de labels visibles.

Reglas de ids:

- usar ids tecnicos consistentes;
- no usar texto traducido como id;
- no cambiar un id existente sin migracion;
- no reutilizar un id para otra semantica.

## Metric availability and fallback

La disponibilidad de una metrica debe separarse de su canal de release.

Campos recomendados:

- `reliability`: `available`, `experimental`, `unavailable`.
- `mockSupport`: `realistic`, `placeholder`, `mockOnly`.
- `requiresLive`: true/false.

No hace falta implementarlo como enum unico. Una metrica puede ser fiable y a la vez requerir fuente live.

Reglas:

- En `stable`, solo mostrar metricas fiables.
- En `tester`, se pueden mostrar metricas experimentales con criterio.
- En `dev`, se pueden exponer metricas para diagnostico.
- Si falta una metrica dentro de una fuente live, no se debe fingir dato mock como si fuera live.
- El fallback normal para un valor faltante es `-`.
- Si una columna entera depende de datos no fiables, no debe estar en `stable`.
- Evitar `N/D` en overlays finales salvo que un template lo justifique.

### Mock/demo state

El estado mock/demo pertenece al Hub y al editor.

Reglas:

- El Hub/editor debe indicar claramente cuando la fuente completa es mock/demo.
- El editor debe preferir un indicador general de fuente mock/demo.
- No pintar todos los valores mock en rojo por defecto.
- El estado visual por valor queda reservado para datos dudosos o faltantes, no para toda la fuente mock.
- El overlay final/OBS no debe mostrar un badge `MOCK` por defecto.
- No mezclar valores mock dentro de una fuente live sin indicarlo en el editor.

Metricas candidatas para beta:

- `none`
- `incidents`
- `position`
- `carNumber`
- `driverName`
- `class`
- `gap`
- `interval`
- `lastLap`
- `bestLap`
- `offtracks`
- `tireCompound`
- `tireWear`
- `virtualEnergy`

`SOF` y `ABS` pueden usarse como ejemplos conceptuales de metricas intercambiables, pero no entran en beta `stable` salvo decision explicita.

`offtracks`, `tireCompound`, `tireWear` y `virtualEnergy` pueden entrar en `stable` si se confirma rapido que la REST API de LMU los expone de forma fiable. Si no hay evidencia suficiente, deben empezar en `tester`.

## Telemetry and data source boundaries

El catalogo de metricas no garantiza que el dato exista en LMU.

Antes de subir una metrica a `stable`, debe existir evidencia de que el dato esta disponible y es fiable.

Reglas:

- No tocar arquitectura de telemetria LMU dentro de un miniplan de UI.
- No anadir parsers, offsets o polling nuevo sin miniplan propio.
- Si una metrica depende de una fuente no confirmada, queda en `tester` o `dev`.
- Si solo existe dato mock, marcar como `mockOnly`.
- Si el dato requiere live, declarar `requiresLive: true`.
- Los workers no deben derivar datos complejos sin documentar formula, limitaciones y tests.

Para metricas expuestas por la REST API de LMU, basta confirmar que existen para poder proponerlas como `stable`. Si durante pruebas aparecen inconsistencias, deben bajar a `tester`.

## Persistence before schema v2

Hasta que exista un miniplan de schema v2, los workers no deben inventar un formato persistente nuevo.

Reglas:

- Si un corte puede guardarse usando el formato actual sin romper compatibilidad, debe documentarlo.
- Si necesita nuevo formato, debe parar y pedir miniplan de schema/migracion.
- Se permite implementar preview o UI no persistente solo si el miniplan lo declara explicitamente.
- No guardar configuracion avanzada en campos genericos opacos para evitar migraciones dificiles.

El primer corte real de `Relative` debe guardar cambios. Si el formato actual no permite guardar de forma segura, el worker debe parar y pedir un miniplan de schema/migracion antes de implementar UI persistente.

Si el formato actual no soporta slots, columns o column groups sin hacks, se debe priorizar schema v2 antes de cualquier UI nueva persistente.

Si el inventario tecnico concluye que schema v2 es necesario, se debe parar la personalizacion persistente de widgets hasta completar el miniplan de schema/migracion.

## Relative beta contract

### Contrato beta final

`Relative` debe soportar:

- 1 template inicial Vantare propio;
- arquitectura preparada para mas templates;
- theme seleccionable;
- variante editable;
- slots generados desde template;
- columns generadas desde template;
- metricas intercambiables;
- column groups opcionales;
- filtros:
  - coches delante,
  - coches detras,
  - misma clase / todas,
  - incluir jugador;
- estilo basico por slot o column;
- formatos por metrica;
- fallbacks visibles;
- metricas por canal;
- auto-width o politica clara de compactacion si se activan columnas.

El template inicial debe partir del `Relative` actual de Vantare como base visual y funcional. No debe copiar Racelab pixel a pixel.

Las columnas base exactas del `Relative` inicial son las actuales del producto. Si el worker necesita enumerarlas, debe inspeccionar el componente/configuracion actual y documentar el inventario en el miniplan antes de cambiarlo.

El primer miniplan tecnico antes de modificar `Relative` debe ser un inventario del `Relative` actual:

- columnas actuales;
- datos usados;
- props/config actual;
- dependencias de telemetria;
- comportamiento visual;
- tests existentes;
- puntos donde no se puede guardar configuracion avanzada sin schema nuevo.

### Column groups relevantes

`Relative` debe poder modelar columnas opcionales como:

- `lastLap`
- `bestLap`
- `offtracks`
- `tireCompound`
- `tireWear`
- `virtualEnergy`
- `pitInfo` si el dato es fiable.

Activar estas columnas puede cambiar el ancho interno del widget.

Estas columnas deben poder activarse individualmente en beta.

`bestLap` y `lastLap` deben estar disponibles desde el primer `Relative` configurable para validar que columnas opcionales, formato y ensanchado automatico funcionan.

Los formatos avanzados entran en beta inicial cuando afecten al ancho o legibilidad:

- decimales;
- ocultar minuto en tiempos de vuelta;
- formato de nombre;
- ancho configurable cuando el template lo permita;
- colores por columna cuando aplique;
- alineacion si el template lo permite.

### Cortes incrementales permitidos

1. Catalogo de metricas especifico de `Relative`.
2. Un template inicial basado en el Relative actual, con una region y un slot o column editable.
3. Mas slots fijos dentro del template inicial.
4. Column groups opcionales para filas.
5. Filtros de pilotos.
6. Estilo basico por slot o column.
7. Themes.
8. Persistencia/schema/migracion, solo con miniplan separado.

## Standings beta contract

### Contrato beta final

`Standings` debe reutilizar el mismo modelo conceptual que `Relative`.

Debe soportar:

- 1 template inicial;
- slots/columnas definidos por template;
- metricas por columna;
- filtros de pilotos;
- multiclase basico;
- theme seleccionable;
- variante editable;
- formatos por metrica;
- column groups opcionales si el template los necesita.

### Decision beta

En beta no se implementa reordenar columnas salvo plan explicito.

El template define columnas/slots. El usuario puede cambiar que metrica va en cada columna compatible.

Reordenar columnas queda fuera de `stable` beta. Puede existir en `tester` si hay un miniplan propio, queda oculto para usuarios normales y no bloquea el contrato estable.

El acceso a reordenar columnas en `tester` debe depender del modo tester activado con `V A N T A R E`.

Formatos avanzados de columnas entran en beta inicial si son necesarios para legibilidad y ancho:

- decimales;
- ocultar minuto;
- formato de nombre;
- ancho configurable cuando el template lo permita;
- colores por columna cuando aplique;
- alineacion si el template lo permite.

### Cortes incrementales permitidos

1. Reutilizar catalogo/contratos validados en `Relative`.
2. Template inicial de tabla.
3. Columnas fijas con metricas intercambiables.
4. Filtros basicos.
5. Multiclase basico.
6. Estilo y formatos.

## Pedals beta contract

### Contrato beta final

`Pedals` beta v1 incluye:

- acelerador;
- freno;
- embrague;
- 1 template inicial;
- theme seleccionable;
- variante editable;
- orientacion si el template lo permite;
- etiquetas on/off;
- valores numericos on/off;
- colores;
- opacidad/fondo.

No incluye steering en beta salvo decision posterior.

`Pedals` no debe empezar hasta que `Relative` y `Standings` esten cerrados a nivel de beta o hasta que el orquestador apruebe explicitamente otro orden.

### Cortes incrementales permitidos

1. Barras basicas throttle/brake/clutch.
2. Labels y valores numericos.
3. Orientacion.
4. Colores/opacidad.
5. Themes.

## Antipatrones prohibidos

- Crear `relative.headerLeft`, `relative.footerRight` o similares como arquitectura final hardcodeada.
- Repartir props sueltas como `showLastLap`, `showBestLap`, `showDriverName` por componentes sin catalogo/template.
- Anadir columnas con CSS fijo sin pasar por `ColumnGroup`.
- Usar `Slot` como nombre generico para todo cuando realmente sea `Column` o `ColumnGroup`.
- Guardar posicion o tamano dentro de una variante.
- Editar layout desde `WidgetStudio`.
- Editar apariencia/datos internos desde `LayoutStudio`.
- Inventar datos cuando LMU no los expone.
- Ocultar errores de datos mostrando valores aparentemente reales.
- Mostrar badge `MOCK` en overlay final por defecto.
- Meter metricas dudosas en `stable`.
- Implementar reordenar columnas en beta sin miniplan propio.
- Implementar schema migration junto con UI de slots sin plan separado.
- Copiar logica entre `Relative` y `Standings` si puede compartirse mediante catalogos/contratos.
- Crear interfaces o managers genericos antes de que exista una necesidad real.
- Crear un editor libre tipo Figma para beta.
- Dar a modelos pequenos prompts multi-feature.

## Implementation order and worker workflow

La implementacion debe dividirse en miniplanes pequenos.

No se debe entregar a un worker rapido un plan completo de `Relative` o `Standings`.

Orden recomendado:

1. Documento de producto de personalizacion de widgets.
2. Miniplan de inventario tecnico del `Relative` actual.
3. Schema v2, solo si el inventario confirma que el formato actual no permite persistencia limpia.
4. `Relative` arquitectura/catalogo inicial.
5. `Relative` slots/columns basicos.
6. `Relative` columnas opcionales con `bestLap` y `lastLap`.
7. `Relative` filtros, formatos y theme.
8. `Standings` reutilizando el patron validado.
9. `Standings` columnas, metricas y filtros.
10. `Pedals` basico.

El auto-switch por sesion entra en beta. Debe apoyarse en los layout types definidos en este documento y tener fallback a `general`.

Cada miniplan debe:

- declarar objetivo;
- declarar alcance exacto;
- listar archivos esperados;
- usar TDD cuando cambie comportamiento;
- ejecutar checks focalizados;
- devolver evidencia en espanol;
- pasar por review adversarial antes de que empiece el siguiente miniplan dependiente.

Se permite paralelizar solo si:

- los miniplanes no tocan los mismos archivos;
- no dependen del mismo contrato inestable;
- tienen tests/checks independientes;
- el orquestador lo aprueba explicitamente.

Por defecto, no empezar un miniplan dependiente hasta que el anterior este revisado y aceptado.

## Testing requirements

Todo corte incremental debe incluir tests proporcionales al riesgo.

Minimos para cambios de widgets:

- test de catalogo de metricas;
- test de compatibilidad slot/column/column group con metrica;
- test de fallback cuando no hay dato;
- test de que `WidgetStudio` no muestra controles de layout;
- test de que `LayoutStudio` no edita configuracion interna;
- test de que cambios de estructura interna no modifican X/Y/W/H del layout;
- test de persistencia si se guarda configuracion;
- test de migracion si se toca schema.

Para column groups:

- activar column group aumenta estructura interna esperada;
- desactivar column group elimina sus columnas;
- formato se aplica por metrica;
- fallback no rompe filas;
  - no afecta posicion/tamano externo del layout.

## Manual verification

Cada corte debe indicar como verificar manualmente:

- abrir app;
- ir a `Overlays Studio`;
- entrar en `Widgets`;
- seleccionar widget afectado;
- cambiar slot/metrica/columna/column group;
- confirmar preview;
- guardar;
- confirmar que `LayoutStudio` no recibio responsabilidades nuevas;
- abrir overlay si aplica.

## Fuera de alcance

Fuera del sistema beta inicial:

- multisimulador completo;
- comunidad online;
- marketplace;
- cuentas;
- monetizacion dentro de app;
- editor libre de templates;
- crear themes completos desde cero;
- track map avanzado;
- reordenar columnas en beta sin plan separado;
- migration real de perfiles sin plan propio;
- dependencias nuevas de UI.
