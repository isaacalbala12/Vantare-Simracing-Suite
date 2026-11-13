# VANTA-141: orden propuesto de revisión y fusión

Solo cuando el kit esté completo y el orquestador autorice la integración.
Todos los destinos son nightly. Esta tabla no autoriza ni realiza merges.

| Orden | PR | Aporta | Depende de | ¿Cerrar como sustituido? |
|---|---|---|---|---|
| 1 | [#2222](https://github.com/isaacalbala12/Vantare-Simracing-Suite/pull/2222) | Workspace Rune, Hola, guardia del Mac y medidas | Ningún PR del kit | No: conserva medidas y cambios propios del harness |
| 2 | [#2224](https://github.com/isaacalbala12/Vantare-Simracing-Suite/pull/2224) | Replay, contador y sellos comunes optativos | Independiente; unir su workspace con #2222 | No: sus últimos arreglos de 33 ms/procedencia no están completos en las ramas consumidoras |
| 3 | [#2238](https://github.com/isaacalbala12/Vantare-Simracing-Suite/pull/2238) | Relative Rune real | #2222 y #2224 | No: contiene el dibujo Rune |
| 4 | [#2242](https://github.com/isaacalbala12/Vantare-Simracing-Suite/pull/2242) | Mosaico GPUI y parche reproducible B-fast | #2224; fuentes contrastadas con #2238 | No: contiene el anfitrión y el parche fast |
| 5 | [#2241](https://github.com/isaacalbala12/Vantare-Simracing-Suite/pull/2241) | Inicio Rune y primera imagen CPU/DWM | #2222 | No: pantalla A-Rune propia |
| 6 | [#2249](https://github.com/isaacalbala12/Vantare-Simracing-Suite/pull/2249) | Electron mock y parche Hub GPUI fast congelado | No depende del dibujo B; usa el workspace común | No: fuentes de las dos variantes A restantes |
| 7 | [#2251](https://github.com/isaacalbala12/Vantare-Simracing-Suite/pull/2251) | Carga y muestreador | Ninguna dependencia de código del producto | No: auxiliares de medida únicos |
| 8 | [#2261](https://github.com/isaacalbala12/Vantare-Simracing-Suite/pull/2261) | Aguante y recuperación | #2251; auxiliares de #2273 al ejecutar | No: cuatro horas y recuperación únicas |
| 9 | [#2273](https://github.com/isaacalbala12/Vantare-Simracing-Suite/pull/2273) | Campaña, recogida, análisis, guía y ZIP | Variantes anteriores, #2251 y resumen de #2261 | No: integración del kit |

#2261 y #2273 se completan mutuamente en ejecución: son los dos últimos del
mismo bloque, sin ejecutar el kit entre ambos merges. No hay ciclo Cargo.

No hay un PR que sustituya íntegramente a otro a sus HEAD actuales. Que #2238
contenga una copia antigua de Hola y la instrumentación, o #2242 una copia de
la instrumentación, no incorpora todos los cambios posteriores de #2222/#2224.
No cerrar ninguno como sustituido antes de trasladar y verificar esos cambios.

Al integrar habrá que resolver archivos compartidos: Cargo.toml/Cargo.lock del
workspace independiente, README/.gitignore y el handoff. Conservar la unión de
hola, contador, relative e inicio, los cuatro patches Rune y las correcciones
más recientes del contador/latencia. No aceptar un archivo entero antiguo sobre
el nuevo. Regenerar el lock con Rust 1.99.1 cuando corresponda y pasar los gates
del resultado conjunto; los checks individuales no prueban esa unión.

Nightly usa Rust 1.99.1 desde #2248 / 1806f71f8. Al actualizar las ramas se sigue
rust-toolchain.toml, sin desactivar nuevos lints. Los binarios congelados del
kit conservan su SHA y toolchain medidos; una nueva compilación cambia el
inventario y exige volver a cerrar hashes/DLL. Las ramas históricas de motores
fast son archivos de construcción y no se fusionan en nightly.
