# Corte 1 · Hub Rune · VANTA-143 / #2256

Estado: **pendiente de aceptación**, no equivale a entregar ni elegir Rune.
El orquestador autorizó abrir los cinco PRs sin esperar al Mac, que duerme.
No se ejecutó el binario, una ventana ni una opción gráfica en el servidor.

| Requisito ADR 0108 §4 | Evidencia automática disponible | Pendiente para aceptar |
| --- | --- | --- |
| Windows 10 22H2 y 11, 100/125/150 % | Compilación/Clippy Windows; test Runtime a escalas 1/1,25/1,5 preparado, sin dispositivo | Ejecutar la ventana real en ambos Windows y las tres escalas; CI windows-latest no certifica esos sistemas |
| Teclado español, acentos y AltGr en campos | Catálogo compartido y casos Unicode de texto dinámico | Entrada física/IME/AltGr en un campo real; el marco no incorpora formularios y no se da este punto por probado |
| Todo por teclado y controles con nombre | Test Tab/Enter, controles enfocables con nombre y árbol AccessKit, sin gráfica | Recorrido completo real y lector de pantalla Windows/Mac; no basta el árbol simulado |
| Aspecto fiel aprobado por Isaac | Nueve temas claro/oscuro, fuentes/textos/iconos compartidos; fixtures de Electron | Capturas headless del Mac para cada paso y comparación lado a lado; ventana visible y visto bueno de Isaac |
| Media hora de uso normal sin bloqueos | Tests de protocolo, cierre, mensajes acotados, estados y Roadmap sin ventana | Sesión real continua de 30 minutos y registro de cierres/bloqueos; no se sustituye por tiempo virtual |

Clippy local final usa un solo slot, dos jobs, target persistente en D: y
`--locked`; los logs están en `D:/VantareServer/evidence/hub-rune/5-roadmap/`.
Los tests/CI definitivos y SHAs se registran en el PR 5 y #2256. Esta tabla no
convierte tests preparados o CI pendiente en resultados aprobados.

## Cola de comprobación cuando vuelva el Mac

1. Comprobar espacio libre y usar solo el target propio `~/target-isa-2256-hub-rune`.
2. Repetir formato, Clippy, tests sin dispositivo y build sobre el SHA entregado.
3. Escenas: muestrario claro/oscuro (PR 2), marco expandido/contraído y temas
   (PR 3), `core-offline`, `core-connected`, `roadmap-base`,
   `roadmap-published`, `roadmap-error` (PRs 4–5). Usar las referencias Electron
   existentes. Guardar cada comparación en `D:/VantareServer/evidence/hub-rune/<paso>/`.
4. Probar la ventana visible, teclado y lector cuando Isaac desbloquee; después
   30 minutos de uso normal. El smoke real Windows de hub-host sigue pendiente
   fuera del servidor con parada gráfica: `VANTARE_HUB_UI`, `hub-ready`, EOF y
   salida 0; comprobar también núcleo apagado y datos reales de QA sin cuentas.
5. Actualizar esta tabla con máquina, SO, escala, SHA, resultado y evidencia.
   Retirar únicamente el target Mac propio al cerrar la tanda.

Sin merge a nightly, promociones, instalador, distribución ni releases.
