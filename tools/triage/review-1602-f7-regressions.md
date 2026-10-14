# F7=C · decisión de Isaac · 14/10/2026

El texto libre del tester nunca se exporta. No se intenta detectar nombres o
etiquetas privadas en prosa: título, cuerpo, notas y contexto quedan locales.
Las columnas SQL existentes reciben etiquetas fijas, sin migración. El Hub
explica que las notas no se envían; el formulario de triaje admite notas vacías.

Antes del proveedor se omiten título/cuerpo y títulos de candidatos duplicados.
Los eventos tienen nombres cerrados; el log nativo es JSON de nivel/módulo/tiempo
relativo, con un máximo de 300 registros. Hardware omite nombres CPU/GPU y acepta
solo números acotados, booleanos, OS cerrado y versiones restringidas. Tipos,
módulos, huellas y versiones mantienen el catálogo de F6.

T3, Intake directo y replay durable omiten el título y el cuerpo del tester.
Summary usa una etiqueta fija, preliminary_fix=null y reasons=[]: tampoco se
exporta un eco libre generado por el proveedor. No hay reanálisis de spools.
Sin texto, el criterio anterior de 200 caracteres no se puede acreditar:
contenido_minimo=no y un veredicto valido se degrada a dudoso. No se inventa un
checklist ni se acepta para descuento; la decisión sigue siendo humana.

Las rutas nativas anteriores TestingContribute/TestingAnswer y Report también
retiran los campos escritos. Los borradores siguen locales. Report mantiene
la revocación por cambios mediante un hash local efímero que nunca entra en
el payload; intentos anteriores con prosa se conservan en cuarentena y no se
reenvían bajo el mismo id con otros bytes. Recibos antiguos ya confirmados se
conservan como historial de solo lectura, nunca como reintentos. Las imágenes de la ruta histórica
con capturas conservan su flujo existente y no entran en el proveedor de triaje.

Regresiones: test_review_1602_f7 (proveedor, HTTP T3, POST Intake, duplicados,
replay sin reanálisis e Intake directo; seis fixtures F7 más prosa ordinaria,
hardware hostil y sockets prohibidos); f7_tester_free_text_never_reaches_the_rpc_preview;
f7_report_notes_are_local_and_old_text_attempts_are_rejected;
f7_system_projection_keeps_numbers_and_closed_values_only. La prueba loopback
de respuestas conserva puntuación/reintento y comprueba p_note vacío.

RED Python: ocho subcasos de texto/replay y hardware hostil; RED nativo:
fuga SyntheticOtherPerson en preview real y OrdinaryPrivateTesterNote en Report.
Logs externos E:/tmp/isa1594-f7-evidence/. Primera fixture Report tenía un id
inválido; corregida al contrato draft_+64 hex y repetida sobre código anterior
para acreditar la fuga real. Restaurar la fuente conservó un mtime anterior y
Cargo reutilizó el binario RED; se refrescó el archivo y se repitió, sin cambiar
la aserción ni suprimir lints. Los fallos iniciales se conservan.

Las regresiones previas mantienen las aserciones de ausencia de secretos,
consentimiento, ACK, exactitud HTTP, referencias y autoridad. Las expectativas
de prosa/redacción cambian por ausencia de claves o etiqueta fija conforme a
la decisión. SQL/producción, proveedor, despliegue y QA física no se ejecutan.
Gates finales y SHAs se registran en el handoff vivo y la PR.

## Verificación final y fusión de nightly

F7 cbb3b2af; nightly 8194c949 integrado en 10d2b439 (ocho conflictos);
nightly e5c90be5 integrado en 4083e4fc (un conflicto de identidad). Conservados
Edge/historial/avisos/crédito #1610, analítica consentida #1609 y revocación #1615
antes de persistir identidad, con cancelación de triaje. Services IPC v9 combina
los contratos; Hub/services se recompilan juntos y rechazan peers v7/v8.

La revisión final reprodujo un problema de la redacción heredada: nombres de
perfil `type`, `fingerprint`, `at` o `ServicesCommandFailure` podían cambiar
claves y valores del resumen ya cerrado. Test
`f7_closed_session_metadata_is_independent_of_profile_names`: RED (type=NULL),
GREEN (tipo, SHA256, nombre de evento y timestamp exactos). Se elimina esa
redacción del resumen y se deja el parser anterior solo en tests históricos;
wrapper clean_tree sin consumidores retirado, sin allow. Hito 4557b5d5.

Sobre 4083e4fc: fmt/check/Clippy workspace PASS, Nextest 1736/1736 (12 skips,
1 lento PASS) y lifecycle 18/18. Tras el cambio final exclusivo de services:
fmt/check/Clippy y Nextest 165/165 PASS. Python 57/57 con sockets prohibidos,
followup mocks 4/4 y quality/retirement 456 PASS. Difusión solo a rama de issue.

Telemetría 25/25 sobre 10d2b439; ACC lento 774 s PASS. No repetida: fuentes,
contrato y filtro del perfil idénticos en el código final. El único delta
adicional en runtime es rights/tests.rs, excluido de ese perfil y cubierto por
Nextest final. Evidencia first-nightly/telemetria.log y telemetry-reuse-delta.txt.
No se atribuye este gate a ejecución sobre otro SHA.

Cola versionada, CARGO_BUILD_JOBS=2, target exclusivo
E:/tmp/isa1594-native-gates y timeout 3600 s por gate. Fallos iniciales conservados:
fixture Report con id inválido (RED repetido con id válido), mtime de fuente
restaurada/Cargo con binario anterior, expectativa de contexto local, new_uuid
perdido por automerge, límites de tamaño de funciones y wrapper legacy sin uso.
Corregidos sin supresión ni aserciones de privacidad debilitadas.

Sin pnpm porque la UI es Rust/GPUI. Sin SQL/pgTAP, provider, informes reales,
deploy, publicación ni QA visual/física nuevos. Imágenes de la ruta histórica
se conservan fuera del proveedor. Riesgo: menor contexto diagnóstico; no se
acredita contenido mínimo ni se inventa aceptación para descuento. CI y HEAD
final de documentación se consultan y registran en PR/issue/buzón.
