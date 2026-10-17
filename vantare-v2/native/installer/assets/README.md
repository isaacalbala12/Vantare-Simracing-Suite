# Assets del instalador

El logo y las fuentes proceden de `instalador-r3.html`, ventana #E aprobada por
Isaac (#1591), SHA-256
`ca1e9bd31ba76fda1031e1b93ba6a090ef889b911cf20d58f30e0181867ad841`.
Los TTF reproducen los WOFF2 incrustados: Inter 400/500/600/700, Rajdhani 700
y Space Mono 400. Las familias privadas de Inter fijan el peso correcto en
DirectWrite. No se reutiliza el Rajdhani 600 del Hub.

`extract-fonts.py` documenta la conversión realizada con fontTools/Brotli ya
instalados; **no es un requisito de build ni de ejecución**. Cargo solo incluye
los TTF existentes. OFL de las tres familias se incrusta también en los EXE y
se instala como `installer-notices.txt`. No añade paquetes al grafo de Cargo.

La referencia HTML original permanece intacta fuera del repositorio. El modo
`parity-capture` es de QA: dibuja estados con metadatos explícitos y no ejecuta
instalaciones ni aperturas. Sus capturas prueban presentación, no el éxito de
una operación.
