# Delta · preparación local de F2

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
