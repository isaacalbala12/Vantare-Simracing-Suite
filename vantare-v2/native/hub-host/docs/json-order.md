# Orden de los documentos del anfitrión

Auditoría de VANTA-138 / #1995 tras #2140. La misma entrada y la misma edición
deben producir los mismos bytes con o sin `serde_json/preserve_order`.
No se convierte un struct a `Value` para conseguir orden: eso puede ensanchar
f32 y cambiar sus bytes. Se conserva el camino nativo de serialización.

## Puntos que pasan por mapas dinámicos al escribir

| Documento / límite de escritura | Dependencia anterior | Garantía explícita |
| --- | --- | --- |
| Calendario, `config::State::write_config_document` | `to_vec_pretty(&doc.value)` heredaba el orden del Map: fuente al leer o declaración del struct en `alerts_save` | `sort_all_objects()` antes de serializar; ordena objetos recursivamente, conserva arrays y valores |
| Launcher, `apps::edit` y `editor::save` → `Store::replace` | Los structs son estables, pero los Values dentro de `wails_import.launcher` cambiaban de orden. El BTreeMap exterior no ordena sus objetos anidados | Ambos límites ordenan únicamente esos Values antes de llamar al mismo store/CAS nativo. El crate launcher queda intacto |
| Altas del kit, `settings::layout::onboarding::apply` | Construye un Value con `json!`, incluidos los settings de widget-defaults, antes de capturarlo en Fields. El orden anidado podía depender del Map; hoy el asset ya viene ordenado | Ordenación recursiva del Value antes de capturarlo. No cambia los defaults ni el formato compacto previo |

Calendario concentra en ese único límite `utc_set`, `follow_set`,
`notify_week_set` y `alerts_save`. Preferencias admite miembros desconocidos y los
conserva semánticamente; Seguidos y Avisos siguen siendo esquemas cerrados.
Ordenar no relaja validación, protección, revisión, cerrojos ni CAS. No se
introducen guardados en lecturas ni para operaciones que antes eran no-op.

El Launcher conserva el formato de structs y listas y solo ordena objetos dentro
de los datos históricos. Acciones de perfil y edición de aplicaciones comparten
`apps::edit`; el editor de perfiles tiene su propio límite `editor::save`.
La siembra inicial del lector usa `Document::fresh_install`, sin wails_import,
y no pasa por un Value persistido. Ninguna detección se convierte en una ruta
nueva ni se alteran comandos o argumentos.

## Caminos que ya eran independientes de la feature

| Escritor | Razón y límites |
| --- | --- |
| Studio: `Open::bytes`, `put`, `setting_edit::apply`, `known_object`, `normalized_columns` | Los campos propietarios se escriben desde `BTreeMap<String, Box<RawValue>>`. Los Values intermedios se proyectan de nuevo a Settings y/o Fields antes de escribir. Los structs nativos usan `to_raw_value`, incluido gap. Los miembros desconocidos permanecen como RawValue, con sus bytes y orden de entrada |
| Studio: `ordered::remove_rates` | Mapa propio de pares en Vec; conserva explícitamente el orden de origen al quitar frecuencias. No usa el Map de serde_json |
| Rendimiento: `layout::Document::save` | BTreeMap de RawValue para raíz y performance; overrides se leen como BTreeMap. Los objetos opacos conservan los bytes de entrada |
| Ajustes: `store::Store::commit`, `save_appearance` | Document, Preferences y StoredAppearance son structs tipados. La ruta `rebase` usa Value, pero lo convierte a Document antes de guardar; el orden del Value no llega al fichero |
| Privacidad: `State::save`, adopción | Privacy tipado; la adopción copia bytes existentes y el marcador es texto fijo |
| Calendario: `feed::publish` | Feed/Event tipados, con un Vec de eventos; no hay mapas dinámicos |
| Peticiones de lanzamiento y favorito | Request enum tipado, con ID del perfil; no hay Value ni Map persistido |
| Presentación en Studio/Onboarding | Contador u64, texto fijo o eliminación del fichero; ningún objeto dinámico |

Los informes locales y el diagnóstico del anfitrión se proyectan desde structs
(o BTreeMap tipados). Triage ya ordena su Value con sort_all_objects antes de
crear el JSON de previsualización; no es un escritor local de documentos.
Los guardados delegados a Services no pasan por un serializador de disco del
anfitrión. No se cambia ese protocolo ni ningún crate de núcleo.

## Oráculos y ejecución

`fixtures/writer-bytes/` fija los bytes de Calendario, ambos caminos del Launcher,
Ajustes y su espejo, Studio opaco, Studio tipado con gap 2.7 y el kit de Onboarding.
Son expectativas explícitas: no se actualizan desde el código bajo prueba.
Las listas conservan su orden; se prueba un objeto desconocido dentro de una
lista y objetos RawValue con claves z/a y espacios que no deben reordenarse.
Los documentos de prueba no contienen rutas ejecutables, cuentas ni datos reales.

El workflow existente `hub-contract-portable.yml` añade dos jobs Windows:

- `sorted`: `cargo test --locked -p vantare-hub-host --lib writer_bytes`.
- `insertion`: lo mismo con `--features serde_json/preserve_order`.

Se usan los defaults reales del anfitrión; no se desactivan features por CLI.
No se selecciona runtime ni el workspace. La feature bindings de domain que
activan las dependencias de desarrollo sigue siendo exclusiva de tests, como
se acordó en #2140. No se activa qa-e2e ni bindings del anfitrión.
`VANTARE_EXPECT_JSON_ORDER` exige que cada job use realmente su representación
esperada. Los mismos oráculos se ejecutan también en los tests ordinarios del
workspace, con la representación que tenga su grafo.
