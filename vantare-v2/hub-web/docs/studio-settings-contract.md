# Ajustes tipados de Studio

`OverlayInstance.settings` contiene una unión cerrada por `kind` para Standings,
Relative, Delta, Pedales y Fuel Strategy. Los demás tipos devuelven `null` hasta
su propia ampliación. El anfitrión proyecta los tipos de
`vantare_domain::widget_settings`, aplica sus valores nativos por defecto y su
normalización sin escribir ni sembrar `layout.json` durante una lectura.

`studio.instance` acepta `patch: { field: "settings", value: { kind, ... } }`.
Solo los campos tipados presentes cambian; un campo ausente conserva su valor.
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
