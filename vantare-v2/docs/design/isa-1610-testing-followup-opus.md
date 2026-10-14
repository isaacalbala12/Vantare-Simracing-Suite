# #1610 / VANTA-29 · Diseño: Mis informes, avisos y crédito opt-in

Autor: sub-agente de diseño (Opus), solo lectura sobre `C:/tmp/1610-opus-design`
(detached; HEAD real `0807fbd0`, no `69fa2d65`: un commit docs posterior, sin
cambios en `native/hub/src/testing`). Sin builds, red, edición ni subagentes.
El padre implementa lógica y cableado. Nada aquí es dato real ni captura de runtime.

## 0. Premisas comprobadas en el código

| Hecho | Evidencia |
| --- | --- |
| La lista actual solo muestra recibos de la sesión; estado único «Recibido» | `testing/view.rs:407-498`, `testing/model.rs:161-166` |
| El recibo IPC solo trae `report_id, report_state, idempotent, created_at` | `native/ipc/src/services_protocol/report_document.rs:46-51` |
| Estados reales del servidor: `draft, submitted, validated, duplicate_linked, incomplete, closed` | `supabase/migrations/20260802130100_testing_center_core.sql:18` |
| El servidor solo admite `reporter_role in (tester, primary_tester, owner)` y canal `nightly/testers` | mismo archivo `:14`, `:16` |
| Testing Center visible solo con rol tester | `shell/navigation.rs:56`, `shell/sidebar.rs:17-22` |
| Avisos `Source::Beta` ocultos a no testers; acciones solo `launcher`/`settings:updates` | `notifications.rs:30-39`, `:410-416`, `:461-466` |
| Consentimiento ligado al digest de la vista previa | `testing/model.rs:110-136`, `testing/editor.rs:78-90` |
| Componentes Orbit disponibles: `neo_card`, `neo_header`, `list_row`, `tag`, `pill`, `chip`, `empty_state`, `skeleton`, `callout`, `Checkbox`, `pending_button`, `small_button`, `RailSection` | `orbit/neo.rs`, `orbit/controls.rs:591-695,749,1158-1194`, `orbit/kit.rs:353,539`, `orbit.rs:838,995` |

Consecuencia: «todos los usuarios pueden enviar», «aceptado/arreglado» y
«crédito» **no existen hoy en servidor ni IPC**. La UI de abajo debe pintarse
solo con lo que el padre cablee; si un dato falta, se usa el estado honesto
indicado, nunca un valor de ejemplo.

## 1. Acceso: todos pueden enviar

- `Section::Testing` visible para todo usuario **verificado y no bloqueado**
  (quitar `&& self.tester` solo para Testing; Calendario no cambia).
- En la barra lateral, Testing Center sale del grupo «Para testers» al grupo
  general con el nombre **«Informes»** para no testers y **«Testing Center»**
  para testers (mismo `Section`, solo cambia la etiqueta).
- No tester: la página muestra directamente la vista Informes **sin pestañas**
  (no hay Resumen/Cuestionarios/Comunidad que enseñar; no se pintan bloqueadas).
  Cabecera `neo_page_header("Informes", "Cuéntanos qué falla o qué mejorarías. Cada informe llega al equipo de Vantare.")`.
  El botón «Borradores y diagnóstico» se mantiene (es local).
- Tester/owner: sin cambios en pestañas (`model::VIEWS`).
- Requisito de backend para el padre (no de UI): ampliar `reporter_role` y canal
  (stable) en servidor. Hasta entonces, si el envío de un no tester se rechaza,
  el editor muestra el `callout` de error existente con:
  «Tu cuenta aún no puede enviar informes desde este canal. Tu borrador sigue guardado.»

## 2. Pantalla «Mis informes»

Sustituye `reports_panel` cuando `report_view == List` y en Resumen.

### 2.1 Layout (centro)

```
┌ neo_card (flex_1, min_h_0) ───────────────────────────────────────┐
│ neo_header("Mis informes", "v-testing")      [small_button Recargar] │
│ text 11 ink_3: «Últimos N informes de tu cuenta.»  (N = lo devuelto)│
│ ┌ scroll (id testing-receipts, overflow_y_scroll, gap 10) ────────┐ │
│ │ fila · fila · fila …                                           │ │
│ └────────────────────────────────────────────────────────────────┘ │
└────────────────────────────────────────────────────────────────────┘
```

- La línea «Flujo previsto: Recibido → Reproducido → …» (`view.rs:511-517`) se
  **elimina**: el flujo se ve en el estado de cada fila.
- El pie «Recibos de esta sesión…» solo se muestra si la fuente es el fallback
  de sesión (ver 2.4).

### 2.2 Anatomía de fila (reutiliza `orbit::list_row` + `tag`)

```
[título 13.5/650 ink, ellipsis]                         [tag ESTADO]
[módulo · fecha relativa · ID corto mono 10 ink_3]      [tag NOVEDAD]?
```

- Contenedor: `orbit::list_row(("testing-report", i), título, detalle, expanded, true, cx)`
  con un `div().flex().justify_between()` y a la derecha `orbit::tag(estado, tono)`.
  Conserva clic/Enter/Espacio para expandir (`view.rs:472-490`).
- Título: `action_text`; si vacío, «Título no disponible» (ya existe).
- Detalle: `"{módulo} · {orbit::activity_time(created_at)} · {id[..8]}"`.
- `tag("Novedad", Tone::Accent)` solo si el estado cambió desde la última vez
  que el usuario abrió la lista (marca local por `report_id`+estado visto).

### 2.3 Estados de informe → copy y tono (cerrado; desconocido = neutro)

| Valor de servidor | Etiqueta tag | Tono | Línea de detalle al expandir |
| --- | --- | --- | --- |
| `submitted` | Recibido | Neutral | «Lo hemos recibido. Te avisaremos si cambia.» |
| `incomplete` | Falta información | Warning | «Necesitamos más datos. Envía un informe nuevo con los pasos.» |
| `validated` | Aceptado | Accent | «El equipo lo ha reproducido y lo va a trabajar.» |
| `duplicate_linked` | Ya conocido | Neutral | «Coincide con otro informe; cuenta igual para priorizar.» |
| `closed` + versión de arreglo | Arreglado | Success | «Arreglado en {versión}. Actualiza para tenerlo.» |
| `closed` sin versión | Cerrado | Neutral | «Cerrado sin cambios en la app.» |
| otro / ausente | Estado no disponible | Neutral | — |

«Arreglado» exige que el padre exponga una versión real; sin ella se muestra
«Cerrado». No se infiere «arreglado» de `closed` a secas.

### 2.4 Estados de la vista

| Estado | Render |
| --- | --- |
| Cargando (primera carga) | 3 × `orbit::skeleton(1.0, 49.0)` dentro del scroll; botón Recargar `disabled("Cargando…")` |
| Recargando con datos | Lista visible; Recargar `disabled("Cargando…")`; sin skeleton |
| Vacío | `orbit::empty_state("Aún no has enviado informes", "Cuando envíes uno, aquí verás si lo aceptamos o arreglamos.")` + `primary_button("testing-empty-new", "Nuevo informe")` → Compose |
| Error de carga | `orbit::callout("No se pudo cargar tus informes. Comprueba la conexión y recarga.")`; si hay datos previos se mantienen debajo |
| Sin sesión | `empty_state("Inicia sesión para ver tus informes", "Tus informes van ligados a tu cuenta.")`; sin botón de envío |
| Sin historial remoto (servicio sin lectura todavía) | Lista de recibos de sesión actual + pie existente «Recibos de esta sesión. Estado al enviar; seguimiento posterior próximamente.» |

### 2.5 Detalle expandido (debajo de la fila, no modal)

- `text` 13 ink_2 con la línea de detalle de 2.3.
- `meta` 10 ink_3 con ID completo (seleccionable/copiable si el padre ya tiene copia; si no, solo texto).
- Fila «Crédito»: `text` 12 ink_3 «Crédito: aceptado» / «Crédito: no».
  Si backend permite retirar: `small_button("testing-credit-revoke", "Retirar crédito")`;
  si no, `pending_button(..., "Retirar crédito · Próximamente", "Aún no se puede cambiar tras el envío.")`.
- Se mantienen los `pending_button` existentes de Conversación / «A mí también me pasa».
- El texto privado no se muestra (igual que hoy).

### 2.6 Carril derecho (`rail_sections`, pestaña Informes)

- «Tus informes» (`v-testing`): `"{total} informes · {n_aceptados} aceptados · {n_arreglados} arreglados"`
  contando solo filas cargadas; si fuente = sesión, mantener copy actual.
- «Conversación»: sin cambios.
- «Un buen informe» (opcional): sin cambios.

## 3. Aviso cuando se acepta o arregla

Usa el centro de notificaciones existente (campana + badge sin leer + Inicio).
No se añade toast ni notificación de Windows.

- Nuevo `Source::Report` (serde `report`), **visible para todos** (no pasa por
  el filtro `tester` de `Beta`). Filtro del panel: «Informes».
- Nuevo destino `Action { kind: "navigate", target: "testing:reports" }` →
  `Section::Testing` con `report_view = List` y la fila expandida.
- `dedupe_key = "report:{report_id}:{estado}"` (un aviso por transición).
- Solo se publican dos transiciones; el resto se ve en la lista sin aviso:

| Transición | `title_key` → texto | `text_key` → texto | Severidad |
| --- | --- | --- | --- |
| → `validated` | «Informe aceptado» | «Hemos reproducido «{title}». Gracias por avisar.» | Info |
| → `closed` + versión | «Informe arreglado» | ««{title}» está arreglado en {version}.» | Info |

- `params`: `title` (≤120 bytes, truncado por grafema; usar el título del propio
  usuario, ya en su equipo) y `version`. Nada de cuenta, email ni nombre.
- Añadir las 4 claves a `notifications::message` (`notifications.rs:377-398`).
- Detección: al recargar Mis informes (manual o al abrir la sección), comparar
  con el último estado visto guardado localmente; sin sondeo periódico en esta
  entrega salvo que el padre ya tenga uno.

## 4. Casilla opt-in de crédito

### 4.1 Ubicación

En `editor.rs::consent_card`, **encima** de los botones Descartar/Enviar y
**debajo** de la línea de versión/sistema. Componente: `orbit::Checkbox::new`,
nueva entidad `credit` junto a `consent`.

### 4.2 Copy

- Casilla: **«Quiero aparecer en los agradecimientos»**
- Ayuda (`text` 11 ink_3, debajo):
  «Opcional. Si se acepta tu informe, podremos mencionar tu nombre visible de
  Vantare en las notas de la versión. No se comparte tu email ni otros datos.
  Puedes enviar sin marcarla.»

### 4.3 Reglas

- Desmarcada por defecto en **cada** informe nuevo; no se recuerda entre envíos.
- No bloquea el envío; no cambia el tono del botón.
- Forma parte del payload y del digest: cambiarla invalida vista previa y
  consentimiento (mismo patrón que los campos, `editor.rs:92-112`).
- La vista previa añade una línea a `preview_summary`:
  «Crédito: Sí, con tu nombre visible» / «Crédito: No».
- El consentimiento de envío («Consiento enviar este contenido») sigue
  separado; el crédito nunca se marca por consentir el envío.

### 4.4 Privacidad / Plane

- Plane recibe solo: ID de informe, módulo, tipo, título y textos ya
  consentidos. **Nunca** cuenta, email, nombre visible ni la marca de crédito.
- El nombre para crédito se resuelve en Supabase al publicar notas, solo si
  `credit_opt_in = true`; no se copia a Plane ni GitHub.
- Retirar crédito (si existe) borra la marca en Supabase; no reescribe notas ya
  publicadas (decirlo en la ayuda de «Retirar crédito» si se implementa:
  «No cambia notas ya publicadas.»).

## 5. Mapa a componentes existentes

| Elemento | Componente | Archivo |
| --- | --- | --- |
| Tarjeta Mis informes | `orbit::neo_card` + `neo_header` | `orbit/neo.rs:13,109` |
| Recargar | `orbit::small_button` + `orbit::disabled` | `orbit.rs:873,915` |
| Fila | `orbit::list_row` | `orbit/controls.rs:1158` |
| Estado / Novedad | `orbit::tag(label, Tone)` | `orbit/controls.rs:664` |
| Vacío / sin sesión | `orbit::empty_state` | `orbit/controls.rs:1185` |
| Cargando | `orbit::skeleton` | `orbit/kit.rs:539` |
| Error | `orbit::callout` | `orbit.rs:995` |
| CTA vacío | `orbit::primary_button` | `orbit.rs:947` |
| Pendientes | `orbit::pending_button` | `orbit.rs:838` |
| Casilla crédito | `orbit::Checkbox` | `orbit/controls.rs:749` |
| Carril | `orbit::RailSection` | `orbit/kit.rs:353` |
| Aviso | `notifications::Record` / `Center::publish` | `notifications.rs:43,200` |

Sin tokens, colores ni componentes nuevos. Mono/Grises funciona solo porque
`tag`/`status_dot` ya añaden forma por tono.

## 6. Lo que el padre NO debe hacer

- No rellenar la lista con `testing-participation.json` ni otro fixture fuera
  de `parity-capture`.
- No mostrar «Arreglado» sin versión real ni contadores globales.
- No pintar pestañas bloqueadas a no testers.
- No mandar a Plane nada de la cuenta ni la marca de crédito.

## 7. DUDAS (elegida la opción más segura)

- DUDA: dónde se publica el crédito (notas de versión / roadmap). Supuesto: notas
  de versión; el copy dice «notas de la versión».
- DUDA: «nombre visible» exacto (display name de cuenta vs alias). Supuesto: el
  nombre visible ya existente en la cuenta; si no hay, la casilla se muestra
  `disabled("Añade un nombre visible en Cuenta para recibir crédito.")`.
- DUDA: mapeo «aceptado» = `validated`. Si Plane/Intake usa otro estado, el padre
  ajusta solo la tabla 2.3; la UI no cambia.
- DUDA: ampliar `reporter_role`/canal en servidor es requisito para no testers;
  fuera del alcance de diseño.
