# Ajustes tipados de Studio

`OverlayInstance.settings` contiene una unión cerrada por `kind` para Standings,
Relative, Delta, Pedales y Fuel Strategy. Los demás tipos devuelven `null` hasta
su propia ampliación. El anfitrión proyecta los tipos de
`vantare_domain::widget_settings`, aplica sus valores nativos por defecto y su
normalización sin escribir ni sembrar `layout.json` durante una lectura. Los marcadores nativos de herencia y migración conservan su significado:
los opcionales ausentes o nulos no reciben presets de un widget nuevo,
`contentVersion` ausente mantiene la migración legacy y Pedales sin Look usa el
valor legacy de su propio serde. El resto se completa con `widget-defaults`.
`practiceColumns: null` devuelve la sesión a la herencia de las columnas
principales, como GPUI; no aplica de nuevo los presets de alta.

`studio.instance` acepta `patch: { field: "settings", value: { kind, ... } }`.
El parche cambia únicamente los valores solicitados en memoria. Si hay un cambio real, el guardado persiste el struct completo normalizado exactamente como GPUI, más los miembros desconocidos. Un parche vacío o sin cambio no escribe.
Los campos anulables de columnas permiten `null` para volver al valor heredado.
El `kind` debe coincidir con el de la instancia. No se admiten campos desconocidos,
rutas, ficheros, URLs ni comandos. `brandVisible` solo se proyecta: cualquier
intento de enviarlo en un parche se rechaza. Los valores escritos se validan
antes de normalizar: un exceso se rechaza, nunca se recorta silenciosamente.
Relative no tiene un máximo general de siete columnas; ese límite sigue siendo
exclusivo de la migración Eficiencia legacy en `domain`.

El guardado mantiene el CAS y `.lock` existentes, `files::save(Mode::Observed)`,
los derechos y la protección del documento. Una operación sin cambios no escribe
ni añade historial. Los miembros almacenados que el Hub no conoce se conservan,
también dentro de `format` y `style` de las columnas. Como el adaptador previo,
una edición compacta el fichero y ordena sus claves raíz; no promete conservar
los bytes completos. Una proyección que no cabe en el marco devuelve una vista
`protected` sin instancias en vez de terminar la sesión.

Los tipos y las opciones de TypeScript se generan desde Rust. Los derives de
`domain` están apagados en producción; se activan por `hub-host/bindings` o por
la dependencia de desarrollo de hub-host. El workspace usa resolver 3: durante
`nextest --workspace` se unifica esa feature para los tests de otros crates, de
forma esperada. Los grafos de producción excluyen dependencias de desarrollo y
no incorporan `ts-rs`; el archivo de tests sí puede incluirlo.

Las listas `columns`, `practiceColumns` y `qualifyingColumns` son listas COMPLETAS:
el orden recibido sustituye al anterior y las columnas omitidas se eliminan.
Los detalles omitidos de una columna existente se conservan por `metricId`;
una columna nueva no puede generar un `id` que choque con uno ya existente.
Los números, incluido `gap`, se serializan por el camino nativo de `domain`,
sin ensanchar f32 a f64 al escribir.

Diferencia deliberada con GPUI, pendiente de decisión de Isaac: el Hub nuevo
mantiene TODO el documento protegido si sus ajustes son ilegibles. Nunca lo
reescribe, archiva, sustituye ni siembra; no crea archivos durante la lectura.
GPUI rechaza también el layout completo, pero `Editor::open` archiva el original
y permite editar un layout vacío si la copia durable tuvo éxito.

Las entradas de transporte malformadas cortan la sesión durante la decodificación,
según el patrón existente del anfitrión. El renderer y el proceso principal validan
antes de enviarlas. `brandVisible` sigue solo lectura; GPUI sí permite elegir
Marca auto/show/hide, diferencia pendiente de decisión de Isaac.

Al guardar un cambio real se eliminan los campos conocidos que domain omite,
como valores por defecto con skip_serializing_if y opcionales nulos.
Un parche que solicita exactamente el valor ya normalizado no escribe aunque
el documento almacenado todavía contenga un valor sin normalizar.


## Aplicar formato de tabla

Solo los parches de Standings y Relative admiten `tablePreset?: TableSize`
(`compact`, `standard`, `expanded`, generados desde Rust). Es una orden cerrada,
no un ajuste persistido. Se rechaza combinarla con cualquier otro campo salvo
`kind`, incluso con `columns: null`. Solo se aplica al Look Vantare.
Las recetas se generan desde `vantare-ui` con el ejemplo `table-presets`; el
anfitrión incluye su JSON y nunca depende de UI/GPUI. El ejemplo también genera
el oráculo de carga, edición y guardado con las operaciones nativas.

GPUI no guarda el nombre del formato: lo deduce comparando columnas exactamente
(`hub/src/inspector.rs`, `table_template`). La futura fila del Hub será una acción
«Aplicar formato…», sin atribuir al documento una selección que no contiene.
GPUI aplica la receta sin confirmación (`studio/inspector_panel.rs`, ChoiceChanged).
Se conserva ese comportamiento; Deshacer recupera el documento anterior completo,
incluidas las columnas personalizadas reemplazadas.

Standings aplica el formato a Carrera, la sesión inicial del inspector GPUI.
Como `session_columns_mut(Session::Race)`, fija primero las columnas heredadas de
Práctica y Clasificación para que no cambien con Carrera; conserva sus overrides
explícitos, incluidos los vacíos. El Hub no añade un selector de sesión.
La receta restablece ids y campos conocidos de las columnas, conserva los miembros
desconocidos de las columnas supervivientes por `metricId` y los del documento.
Se mantiene el CAS, las guardas de derechos/documento protegido y el historial
existentes. Una receta que no cambia el resultado no escribe ni añade historial.

Reproducir sin abrir ventanas, desde `vantare-v2` y mediante la cola:

```powershell
pwsh -NoProfile -File native/scripts/compilar.ps1 cargo run --manifest-path native/Cargo.toml -p vantare-ui --example table-presets -- native/hub-host/data/table-presets.json native/hub-host/fixtures/studio-table-preset-golden.json
```

Los tests de UI comparan ambos archivos con la salida del ejemplo. Los tests del
escritor comparan los dieciocho casos (widget × tamaño × actual/legacy/personalizado)
con ese oráculo independiente y verifican Deshacer/rehacer.
