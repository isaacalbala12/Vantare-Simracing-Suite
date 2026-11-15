# Delta · preparación local de F2

**Implementación visual y decisiones nuevas de arquitectura detenidas.**
Se requiere revisión del sub-orquestador antes de continuar.

Desviaciones conocidas por lectura del código, aún sin captura:

- La cápsula actual coloca referencia y valor en vertical. GPUI coloca «DELTA»
  y el valor en una sola fila; cambian también padding y cara del número.
- La barra es un rectángulo plano: faltan el degradado, extremos redondeados,
  marcas y rótulos de escala de GPUI; tampoco reproduce su modo transparente.
- Cabecera, sectores y marca son versiones simplificadas; falta el símbolo
  de la marca y reproducir exactamente la geometría y tipografía GPUI.
- Faltan los avisos y efectos de vuelta/mejora de GPUI. Eficiencia no está portado.
- La banda de pausa tiene texto español fijo y colocación provisional.

No son diferencias aceptadas ni mejoras. Antes de corregir el aspecto se
presentarán comparativas en el PC de juego, con horario autorizado.

VANTA-144 / #2333. Rama `vantareapp/isa-2333-delta-rune`, base #2357
`59f2d099d0b60d310ae62713b6247b6187bcaadc`. Sin PR ni push mientras la pila
de A no esté en nightly; no autoriza capturas ni mediciones.

Primer pintor Vantare desde `domain::delta::project_reference`: tamaños y
referencias ya guardados, etiquetas y sectores, pausa retenida. Reutiliza las
fuentes, tokens y `Tween` de Relative. `Live` actualiza texto/color/barra sin
reconstruir la vista; la barra termina en 150 ms y no programa más cuadros.
Cadence, datos, permisos y cierre siguen en el host de A. El cambio de renderer
solo despacha los dos pintores presentes: Relative y Delta.

Tests CPU con `ipc::source::fixed`, reloj virtual y Runtime real: proyección,
fin de barra/reducir movimiento, pausa/época, geometría de barra, reposo durante
30 s y cadencias 5/15/20 Hz con revocación. Eficiencia, avisos y paridad visual
quedan para completar el widget; no se presentan como implementados aquí.
