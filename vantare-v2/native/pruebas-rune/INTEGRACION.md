# Integración VANTA-141 — Refs #2213

Base: origin/nightly 07825965f30322cca053174bcc17f248dfad1f5e, Rust 1.99.1.
Rama: vantareapp/isa-2213-integracion. Un único PR sustituye a los nueve
anteriores; no se cierra ninguno hasta que el orquestador fusione el nuevo.

Se incorporaron por merge, en este orden: #2222, #2224, #2238, #2242, #2241,
#2249, #2251, #2261 y #2273. Los SHA exactos constan en fuentes-medicion.json.
Las resoluciones conservan contador/latencia de #2224, Relative de #2238,
Inicio de #2241, mosaico/fast de #2242, Electron de #2249, carga/muestreador de
#2251 y controladores de #2261/#2273. El workspace independiente une hola,
contador, relative e inicio; su lock se regeneró offline con Rust 1.99.1.

## Contrato de producto intacto

El diff final no modifica overlays distribuidos, native/hub-host, instalador,
scripts de distribución, Hub web ni workspace nativo de producto. Tampoco
native/Cargo.toml, native/Cargo.lock o native/rust-toolchain.toml.

Los cambios que antes eran instrumentación optativa en archivos del producto
se conservan ahora como cuatro parches dentro del banco. Se materializan solo
en fuentes-generadas/gpui, gpui-fast, hub-fast y electron, ignorados por Git.
preparar_fuentes.py fija base y parche, verifica su hash y todos los blobs de
la fuente resultante; rechaza destinos ajenos y junctions, y no aplica nada al
árbol de producto. Los wrappers
rechazan SourceRoot ajenos a esas copias. El parche fast de #2242 NO cambia
los overlays que se distribuyen: solo la copia de medición del motor archivado.

Relative Rune y el contador usan los crates IPC/domain/profiling de la misma
copia GPUI. Subscriber, demanda y proyección siguen siendo los reales, sin
adaptadores ni versiones reescritas. Los cuatro patches Rune permanecen solo
en el workspace de pruebas. Cargo del producto no incorpora Rune ni el banco.

verificar_aislamiento.py rechaza cambios fuera del banco, su workflow propio
y el handoff canónico. Se compara con el ancestro común con origin/nightly,
para no atribuirle al kit cambios posteriores de nightly al validar el merge.

## Validación y límites

Se materializaron las cuatro variantes sin ejecutar sus programas. Las fuentes
se contrastaron con los blobs Git fijados. 54 pruebas Python pasan (8 de
latencia/aislamiento, 32 del kit, 11 del muestreador, 3 de aguante). Formato Rust
1.99.1 del workspace independiente y contratos PowerShell pasan sin gráfica.

Se intentó validar por cola, Release -j2 y Rust 1.99.1. Se corrigió la selección
de Python cuando PATH ofrece más de un ejecutable; la segunda invocación se
detuvo por captura.lock después de verificar fuentes y antes de Cargo. No se
presenta como Clippy aprobado. La CI propia compila y prueba IPC/profiling y el
contador con Rust 1.99.1, comprueba el lock/miembros Rune sin compilar su renderer
y valida aislamiento, parches, análisis y guiones. Los gates de producto siguen
siendo los existentes y no se desactivan lints.

No se recompilaron ni alteraron los binarios ya preparados del kit. Sus SHA y
medidas siguen en CONSTRUCCION.md del servidor. El ZIP PENDIENTE-INICIO sigue
incompleto hasta recuperar Inicio Rune 54ef276c3 del Mac despierto. No se hizo
otro intento SSH. Tiempos comparables pendientes autorizados para madrugada.
Medición gráfica/física solo en el PC de juego, con la grabación; nunca aquí.
Sin merge en nightly, cierres de PR, promociones, release ni servicios reales.
