> Roadmap #1535: las referencias a plan.md/generador en este documento son históricas.
> ClickUp es la única fuente; ver [mantenimiento vigente](../roadmap-maintenance.md).

# Launch Edition: catálogo fijo y funciones posteriores (#1510)

Decisión vigente: Isaac, `DECISIONES-VANTARE.md` §6j y `founder/launch.md`,
08-10-2026. Una LE perpetua conserva las funciones de lanzamiento y sus
arreglos de errores graves. Las funciones nuevas aparecen bloqueadas,
también en testers, con candado y «Incluida en Pro». Esta entrega no publica
la venta, un módulo ni una build.

## Corte mínimo implementado

`CatalogAccess::LaunchV1` congela los IDs Standings, Relative, Delta y Pedals
(`standings`, `relative`, `delta`, `pedals`), los cuatro de la semana inicial
en §6j. Los otros 14 renderers presentes en la base candidata no se consideran
publicados por el hecho de estar compilados: quedan fuera de ese catálogo.
Un widget nuevo queda fuera automáticamente. Un arreglo del mismo ID conserva
acceso; no se compara la fecha del reloj, de compra ni de la build.
Una ampliación funcional dentro de un widget inicial no puede presentarse como
bugfix para heredar ese ID: necesita un corte explícito propio antes de publicarse.

Free conserva Standings y Pedals. Pro vigente accede al catálogo completo.
Owner puede verificar el catálogo completo; tester y nightly tester sin LE
conservan sus permisos de prueba previos. Una LE junto a tester/nightly tester
mantiene el corte comercial. Los permisos de canal `testers`/`nightly` no
conceden funciones. LE + Pro accede mientras Pro esté vigente y vuelve a LE
al vencer, sin degradar a Free ni extender el vencimiento.

Para módulos, Calendario es inicial. Engineer, Strategy y Analysis quedan
fuera del corte LE actual: §6j describe su publicación posterior. Las
capacidades de módulo ya existentes siguen siendo necesarias; esta política
no concede módulos a Pro ni convierte «Próximamente» en una función publicada.
Antes de publicar uno, se revisan sus grants y la navegación beta existente.
Recomendación a Isaac: confirmar este inventario al revisar la PR. El contrato
histórico incluía Engineer y mejoras futuras: la decisión nueva se aplica aquí
sin cambiar silenciosamente el contrato histórico ni la oferta de Polar.

## Autoridad y rutas

Supabase emite `vantare.edition.launch_v1`, perpetua y firmada con
`scope_version: launch_v1`, en el formato v1 existente. Rust verifica firma,
subject/dispositivo, scope, revocación, reloj y vencimientos. Las capacidades
online sin firma nunca conceden derechos locales. `license::catalog::access`
solo recibe el resultado vigente de esa autoridad en el núcleo.

El núcleo publica la clase de catálogo por control IPC **v4**. Se añade el
campo obligatorio `catalog`: `free`, `launch_v1` o `pro`. Hay que compilar y
distribuir núcleo, servicios, Hub y overlays de la misma revisión. No cambia
la licencia firmada, su canonicalización, el backend, la compra ni #1506.
La política vence también en la próxima transición de Pro/LE: el consumidor
no puede usar la antigua ampliación Pro después de su límite verificado.
Se conserva la excepción Live que ya calcula `Authority`; no se añade gracia.

Studio conserva las instancias bloqueadas de perfiles, muestra candado y
texto, impide añadirlas y sustituye su vista por un panel de bloqueo. No borra
sus ajustes/posición. La previsualización local de Workshop y las capturas
aisladas siguen sin conceder derechos al runtime. El host productivo de
overlays no proyecta ni pinta widgets denegados y actualiza el bloqueo al
cambiar el catálogo; importar/editar un JSON no amplía los derechos.

## Runbook para Isaac (sin acciones en producción del worker)

1. Revisar los cuatro IDs iniciales y el inventario de módulos anterior;
   acordar cualquier excepción antes de integrar. No cambiar IDs por un bugfix
   ni ampliar la allowlist LE al añadir un widget nuevo.
2. Comprobar en sandbox que LE sigue emitiendo el grant perpetuo ya existente
   con `scope_version: launch_v1`, y Pro su `paid_through`. No crear productos,
   cambiar precios ni tocar el checkout atribuido de #1506 para este corte.
3. Compilar el conjunto nativo de esta revisión con las variables públicas
   de build del candidato. No mezclar ejecutables IPC v3 y v4.
4. Con cuentas de QA Free, LE, LE+tester, Pro y LE+Pro: abrir Studio; los
   cuatro iniciales deben estar habilitados para LE, Radar debe mostrar
   candado/«Incluida en Pro», y Free solo Standings/Pedals. Intentar añadir
   por teclado y ratón. Abrir un perfil que ya tenga Radar: conservar la
   instancia/ajustes y mostrar el bloqueo en Studio y pista.
5. Verificar LE offline después de reiniciar; vencer Pro en LE+Pro fuera
   de una sesión Live (la excepción Live existente conserva su contrato) y
   comprobar que Relative sigue y Radar se bloquea. Revocar LE online y
   comprobar retirada de acceso. Los tests locales no prueban este backend.
6. Revisar e integrar por el canal autorizado; no desplegar Supabase por esta
   PR: no contiene migración ni Edge Function. Isaac conserva la autorización
   de promociones y publicación.

`docs/roadmap/plan.md` falta tanto en esta base como en `origin/nightly`
consultado. No se crea una segunda fuente ni se publica el roadmap Supabase.
Las instrucciones recientes de esta tarea sitúan seguimiento en GitHub; las
referencias Notion de la base son anteriores y se conservan sin reescritura.
