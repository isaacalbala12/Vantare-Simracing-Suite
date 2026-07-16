# ISA-92 — matriz visual estricta, segunda pasada

Autoridad: `C:\Users\isaac\Desktop\Vantare-Overlays\vantare-v2\layout-studio-v10.html`
Referencia: `C:\Users\isaac\AppData\Local\Temp\isa92-strict-reference.png`
Ruta de captura: `V52Shell` real → `StudioRoute` real → `OverlayStudioV3`, sin offsets ni mutaciones DOM del shell.

## Matriz referencia → implementación

| Elemento de referencia | Componente real | Token o medida autoridad | Resultado medido | Excepción / estado |
|---|---|---|---|---|
| Fondo Studio | `.v52-shell-bg` + `.osv3-workbench` | `#080808`; gradientes rojos localizados | El Studio deja ver el fondo real V52; sin fondo plano superpuesto | Shell real conservado |
| Panel glass | lista, canvas e inspector | `rgba(13,13,15,.7)`, blur `20px`, saturate `160%`, borde blanco `.04`, radio `12px` | Coincidencia computed-style exacta en los tres paneles | PASS token |
| Cabecera | `StudioHeader` | breadcrumb `11px`; título Rajdhani `30px`; descripción `14/20px`; bloque `96.5px` | `1812×96.5`; ancho/alto exactos; `y +2px` | `+2px` deriva de topbar V52 real de `58px` frente a shell ficticio de `56px` |
| Composición wide | `ResponsivePanelControls` | izquierda `240px`; gaps `16px`; canvas `1220px`; inspector `320px` | Anchos y posiciones X exactos; altos `-2px` | Desfase vertical del shell real; sin overflow |
| Catálogo | `WidgetListPanel` | header `16/16/12px`; búsqueda `30px`; fila `37.5px`; icono `18px`; active gradient rojo | Lista poblada, iconos, búsqueda, contador, active gradient y scroll; delta unmasked `3.667%` | Nombres, estados e iconos proceden del documento/catálogo real; sin máscaras |
| Toolbar canvas | `CanvasToolbar` | alto `36px`; padding horizontal `16px`; borde blanco `.05` | `1218×36`, ancho/alto exactos; delta unmasked `2.258%` | Fit/background/safe area reales están en popover; sin máscaras |
| Canvas chrome | `StudioCanvas` | panel glass, selección `#E63946`, stage contenido | Toolbar+footer delta unmasked `4.119%`; geometría X/W exacta | Interior stage excluido por estado grid autorizado; no se enmascaró chrome |
| Action bar | `CanvasActionBar` | controles glass compactos | Visible con selección; click, z-order y acciones verificados en ruta real | Acciones reales adicionales conservadas |
| Footer canvas | `PreviewSourceControls` | alto `44px`; `rgba(0,0,0,.2)`; borde `.05` | `1218×44`, geometría exacta; delta unmasked `5.643%` | Controles Mock/Live, sesión, pista y Browser View reales; sin máscaras |
| Rail | `InspectorRail` | ancho `72px`; item `52×44`; preview `32×22`; active line `2px` | Ancho exacto, alto `-2px`; delta unmasked `4.969%` | Secciones reales exceden la referencia; sin máscaras |
| Inspector | `StudioInspector` + secciones | header `41px`; body `14/16px`; cards `#0a0a0e`, radio `8px`, borde activo rojo `.5` | `246px` body, cards/tokens exactos; delta unmasked `12.072%` | Contenido funcional real difiere del mock HTML y se conserva; sin máscaras |
| Dirty/saved/disabled/no selection | store + header + rail | puntos ámbar/verde y toggle | Cuatro estados capturados por interacción real | PASS funcional |
| Medium | drawer inspector | catálogo `240px`, drawer `320px`, toolbar `36px`, footer `44px` | Drawer completo en `x936..1256`, sin overflow; transición esperada antes de medir | Topbar V52 global se solapa a `1280px`; fuera de ownership ISA-92 |
| Compact | drawers lista/inspector | drawer `320px`, toolbar `36px`, footer `44px` | Drawer completo, cabecera visible, Escape verificado; sin overflow | Topbar V52 global se solapa a `900px`; fuera de ownership ISA-92 |
| Tipografía | variables Studio | Inter / Rajdhani / Space Mono | Familias, `13/19.5px` en fila y tokens medidos coinciden | PASS token |
| Scrollbars | listas e inspector | thumb `#2a2a32`, ancho `5px`, hover rojo | Scroll interno, sin scroll de página | PASS estructura |

## Geometría wide

La captura real conserva el shell V52. El HTML usa una topbar ficticia de `56px`; V52 usa `58px`. Por ello todo el Studio empieza `2px` más abajo y dispone de `2px` menos de alto. Dentro del área Studio, X, anchuras, gaps, toolbar y footer coinciden exactamente.

| Región | Referencia | Real | Delta |
|---|---:|---:|---:|
| Header | `x84 y76 1812×96.5` | `x84 y78 1812×96.5` | `x 0, y +2, w 0, h 0` |
| Catálogo | `x84 y172.5 240×883.5` | `x84 y174.5 240×881.5` | `x 0, y +2, w 0, h -2` |
| Canvas | `x340 y172.5 1220×883.5` | `x340 y174.5 1220×881.5` | `x 0, y +2, w 0, h -2` |
| Inspector | `x1576 y172.5 320×883.5` | `x1576 y174.5 320×881.5` | `x 0, y +2, w 0, h -2` |
| Toolbar | `1218×36` | `1218×36` | `0×0` |
| Footer | `1218×44` | `1218×44` | `0×0` |

## Política y lectura de métricas

- `strict-parity-metrics.json` publica el delta bruto completo (`50.140%`) con threshold por canal `12` y cero máscaras. Es informativo, no un gate: compara foto frente a grid y shell ficticio frente a V52 real.
- Los deltas regionales anteriores también son **unmasked**. No alcanzan el `<1%` literal porque incluyen textos, iconos, controles y secciones reales distintos de los mocks del HTML. No se oculta el fallo ni se declara paridad numérica.
- El gate verificable sin ambigüedad es el de geometría/tokens: X/anchos internos exactos, superficies glass exactas y `+2px` vertical documentado por shell real.
- La validación humana de Isaac prevalece, tal como exige el comentario de rechazo.

## Estados semánticos capturados

- [x] Ruta real con topbar/dock/shell V52.
- [x] Perfil canónico poblado y copy largo en español.
- [x] Widget seleccionado mediante click real.
- [x] Rail, sección e inspector activos.
- [x] Dirty y action bar visibles.
- [x] Saved, disabled, solid y sin selección por separado.
- [x] Wide, medium, compact y drawer inspector compact.
- [x] Sin máscaras globales ni regeneración de baselines.
