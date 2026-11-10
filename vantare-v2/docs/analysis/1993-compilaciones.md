# VANTA-137 / #1993 — compilación Rust

Base: nightly `d84ca4aa91397e60031eee58d08235b4c329a6af`.
Sin cambios de producto, dependencias nuevas, merge ni publicación.

## Alcance vigente

Isaac canceló la partición del Hub durante la ejecución: se rehace en web.
La extracción inicial de Orbit queda congelada, sin PR ni compilación validada,
en `D:/VantareServer/worktrees/isa-1993-orbit`, rama
`vantareapp/isa-1993-orbit`. No forma parte de esta entrega.

El camino rápido cubre los crates Rust del núcleo y overlays. `comprobar.ps1`
selecciona el crate y sus dependientes directos, excluyendo siempre Hub y Admin.
Las dependencias opcionales inactivas no incorporan productos al camino rápido.
Los defaults se conservan solo para los paquetes seleccionados: comprobar
Runtime no activa por accidente la interfaz GPUI del instalador.

## Targets y cola

Como máximo dos compilaciones, recortadas además por memoria disponible.
Cuatro jobs por compilación en este servidor. Targets reutilizados entre ramas:
`D:/VantareServer/targets/slot-0`, `slot-1`; runner: `D:/VantareServer/targets/ci`.
Los slots se limpian al superar 20 GB o tras 14 días sin uso; CI tiene un límite
separado de 35 GB. Limpieza bajo mutex, sin enlaces ni locks Cargo abiertos.
Menos de 15 GB libres en D: detiene el build. Las reservas anidadas síncronas
reutilizan el slot del ancestro.

La prueba A → B → A detectó que Cargo 1.95 reutilizaba el ejecutable de A al
compilar otro checkout del mismo paquete. Al cambiar de checkout se invalidan
los paquetes locales mediante `cargo clean -p`, conservando dependencias de
registro/git. Repetir en el mismo checkout conserva incremental. La prueba
corregida comprueba los tres ejecutables reales, sin sccache.

Sccache se traslada a `D:/VantareServer/cache/sccache`, limitado a 5 GB; el
wrapper usa el puerto local 4227. Los comandos Cargo directos y gates pasan el
target por CLI para no separar la caché por `CARGO_TARGET_DIR`.

## CI y cobertura

Los nombres obligatorios permanecen: `Validate promotion path` y
`Validate Vantare blocking gates`. Clippy sustituye el check duplicado e incluye
el banco bench de Runtime. Nextest conserva los perfiles default/ci y el corpus;
lifecycle conserva su arnés y los dos ejecutables de overlays normal/QA.
Las PR seleccionan los crates cambiados y todos los dependientes transitivos.
Configuración global, manifiestos, assets compartidos y rutas desconocidas
fuerzan workspace. Los contratos entre procesos añaden UI → Runtime y
Storage → Hub/Analysis a la selección. Nightly, testers y merge_group validan
el workspace completo. Los controles de distribución/instalación se conservan;
solo se omiten en PR de vistas hoja del Hub. La instalación de Nextest ya
comprobaba su versión en la base y conserva ese comportamiento.

El runner propio conserva sus artefactos e incremental; no ejecuta rust-cache,
que eliminaba paquetes propios e incremental. Los targets explícitos de
mediciones/distribución también deben estar en D: y tienen exclusión mutua.

## Evidencia

En curso: `D:/VantareServer/evidence/isa-1993`.
Base del Hub anterior a la cancelación: 652 tests PASS, 4 skips existentes;
ejecución 308 s. No es una medición del camino rápido nuevo.
Había una compilación ajena de frameworks de UI en C:; no se detuvo. Las
mediciones afectadas por esa carga deben identificarse como tales.
El intento de benchmark del Hub se detuvo al cambiar el alcance.
No se ha usado el Mac ni se estima su rendimiento sin medirlo.

Evidencia histórica conservada en [#1465/#1654](1465-compilacion-historico.md).
