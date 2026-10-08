# Combinación unificada — ISA-1063

Decisión de Isaac: sustituir Simulador + Evento + Combinación por una pantalla.
Flujo vigente: Inicio → Combinación → Reglas → Pilotos → Sesiones → editor.
Se conserva el identificador #step-3 de Combinación para no romper enlaces.
Los antiguos #step-1/#step-2 conducen a ella; no son pasos adicionales.

Revisión visual independiente: **9,1/10**, sobre unified-combination.png y A4.
Sin recortes ni solapamientos. Diferencias menores de mapa/iconos/cheurones.
Calendario visible y sin conectar; no se crean eventos de muestra.

Verificado en Chrome: Inicio→Combinación→Reglas, retroceso inverso, cinco
etiquetas en stepper, Algarve conservado al volver, sin desbordamiento horizontal
a320/768/1024/1440; consola sin errores. Sintaxis2JS y diff correctos; digest regenerado.
No tests/build productivos: solo prototipo documental. Originales y motor intactos.

Archivos: wizard-preview.js, recorded-editor.js, journey-parity.css, index.html;
galería/capturas, README, handoff y roadmap. Base56ce59cd, misma rama/worktree.
Sin push, PR nuevo, CI remoto, merge ni release. Integración productiva pendiente.
