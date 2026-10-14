# Entrega #1609 / VANTA-22 · PostHog consentido

Issue: [#1609](https://github.com/isaacalbala12/Vantare-Simracing-Suite/issues/1609),
GitHub Project Vantare, `area:plataforma`, sin milestone comprometido.
Rama `vantareapp/isa-1609-posthog-uso-embudo`; base nightly `69fa2d65`.
Reanudación CLI del 14/10: commit T3 `f69554f9` y cambios heredados conservados.
Código local verificado: `f5837cd3`; contrato/servicios `a82a283b`, paneles
`7003f0d1` y corrección de paginación `089bae4b`.
PR draft [#1617](https://github.com/isaacalbala12/Vantare-Simracing-Suite/pull/1617)
a nightly; Plane «Por revisar», verificado el 14/10 a las 01:51 UTC. Código y
documentación publicados en la rama de issue; CI remoto en curso, sin resultado
final en la consulta inicial. Los gates anteriores son locales.
No se ha integrado, publicado ni probado PostHog real.

## Resultado preparado

- Consentimiento de uso independiente de fallos; casilla apagada, aceptación o
  rechazo persistidos, revocación en Ajustes y descarte de pendientes. El sí
  antiguo sin `usage_decided` no habilita productores ni emisor.
- Páginas del Hub y tiempo con ventana activa; tipos visibles de widgets y
  tiempo, sin duplicar instancias del mismo tipo. Reloj monotónico e intervalos
  observados: suspensión >2 s excluida; no actividad anterior al permiso.
- Funciones instrumentadas: añadir widget, iniciar cadena de perfil, recalcular
  plan editado, enviar informe y preparar checkout. Solo nombres cerrados.
- Instalación, cuenta disponible y acceso comercial son **observaciones**.
  No representan instalación completada, registro o recibo monetario.
- API `diagnostics::consented_usage_id(root)` para #1610; ausencia sin permiso,
  mismo UUID v4 que el sender y ningún ID de cuenta/licencia/huella.
- Ocho definiciones de paneles UE, script inerte por defecto y snippet web sin
  SDK/autocapture/replay. Pruebas con red/almacenamiento simulados.

Catálogo y límites: [eventos](eventos.md); [snippet](web-snippet.md);
[paneles y activación posterior](paneles.md).

## Regresiones y evidencia

1. **Consentimiento heredado:** RED de T3 conservado en
   `C:/tmp/1609-evidence/consent-red.txt`: con `usage:true` antiguo se creaba
   cola. `Privacy::load` ahora cierra ese caso y exige decisión independiente.
2. **Orden del embudo:** RED reproducido por CLI en
   `services-red-out.txt`: la primera señal era `account_signed_in` en vez de
   `installation_observed`. Se reserva la instalación bajo el mismo lock antes
   de cuenta/licencia; no se crean marcadores sin permiso ni se repiten al revocar.
3. Durante la revisión del trabajo heredado se movió el evento de Launcher al
   arranque correcto de la cadena; un perfil rechazado no registra éxito. El
   evento comercial exige concesión comercial vigente y excluye roles/módulos.
4. **Listado de paneles incompleto:** RED→GREEN offline de una respuesta sin
   `next`. El script ahora exige paginación confirmada antes de crear nada;
   arreglo `089bae4b`, ocho tests PASS y log `paneles-pagination-red.txt`.

Logs fuera del repo: `C:/tmp/1609-evidence/`. Los targets son propios del
worktree (`native/target/gates`); no se copian cachés a evidencia.

Fuentes de revisión: `native/services/src/diagnostics.rs` (consentimiento,
identidad y cola), `diagnostics/sender/analytics_tests.rs` (payload HTTP y RED/GREEN),
`native/hub/src/settings/privacy.rs` (persistencia/revocación),
`native/hub/src/shell/analytics.rs` y `native/ui/src/app/usage.rs` (relojes de estado
con pruebas inyectadas, sin GUI ni esperas temporizadas).

El primer Nextest se detuvo con 1489 PASS y un fallo en el test de ruta por
defecto: el runner externo había fijado `VANTARE_NATIVE_DATA_ROOT`, que contradice
la precondición de ese test. Se conserva `test-first-err.txt`; se repite completo
con el override ausente, `LOCALAPPDATA`/`APPDATA` temporales y captura desactivada
en el build. DuckDB se lee de su directorio de desarrollo, sin copiar cachés ni
acceder a ajustes/datos reales. No se cambia el test ni el código de rutas.
La segunda ejecución detectó separadores `/` del runner incompatibles con
`cmd.exe /c mklink` en la prueba de junctions (740 PASS). Se normalizaron sus
rutas temporales a `C:\tmp\...`; el mismo binario/test pasó antes de repetir
la suite. Evidencia `test-second-err.txt` y `shortcut-harness-green.txt`.

| Verificación | Resultado |
| --- | --- |
| Paneles Python offline | 8 PASS |
| Snippet Node, permiso/payload/revocación | PASS |
| Fragmento ISA-1609 e integridad retirada | PASS, 456 huellas |
| Check workspace | PASS |
| Services (hito `a82a283b`) | 122 tests + 2 procesos PASS |
| Fmt y Clippy (`-D warnings`) | PASS |
| Nextest workspace final | 1659/1659 PASS; 7 skips del perfil del repo |
| Lifecycle | 18/18 PASS (5 Engineer + 13 Runtime) |
| Telemetría separada | No requerida: no se modifica runtime/domain/ipc/testdata |

## Pendientes para el orquestador

- **Panel real:** falta clave personal UE. No se ha buscado, leído ni pedido
  por chat. No se ejecutó `--apply`. Revisión y autorización posterior antes de
  escribir; el script no crea cuentas ni contrata servicios.
- **Embudo exacto:** Marketing necesita integrar el snippet en su repo; #1591/
  PR #1600 necesita la elección de Setup, sin cambios desde esta rama. Atribución
  web→app y registro/compra exactos necesitan fuentes y consentimiento durable
  backend. No hay porcentajes individuales web→app sin ese puente.
- **UI:** no consta diseño Opus específico del consentimiento de uso. Se conserva
  la adaptación heredada de tarjeta/casilla Orbit existentes; revisión visual
  pendiente. No hay diseño nuevo, captura ni QA de interfaz física desde CLI.
- **QA aislada:** aceptar/rechazar, reiniciar, cambiar página/foco, ocultar widgets
  por bandeja/sesión/fuera de pista/licencia y revocar en Ajustes. Usar una raíz
  temporal; nunca instalación, ajustes ni datos reales de Isaac.
- La población son instalaciones que aceptan; cola acotada a 32 slots y pérdida
  posible de observaciones. Revocar detiene nuevas observaciones/envíos después
  de revalidar; una petición ya enviada no puede retirarse del transporte. Datos
  ya recibidos requieren procedimiento de borrado remoto separado antes de activar.

Sin dependencias nuevas, instalador modificado, credenciales, producción,
compras/cuentas reales, merge, promoción, release ni anuncio público.
