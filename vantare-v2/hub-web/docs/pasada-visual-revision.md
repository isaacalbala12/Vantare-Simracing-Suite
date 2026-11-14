# Revisión de la pasada visual · 13 de noviembre

La línea base sigue fijada en nightly e689cba4f. Las correcciones se publican por pantalla, con UI y capturas acreditadas por separado; no se confunde una captura posterior con la línea base.

| PR    | Corrección                                                                                       | 1280×800 oscuro plegada/abierta | 1280×800 claro plegada/abierta |
| ----- | ------------------------------------------------------------------------------------------------ | ------------------------------- | ------------------------------ |
| #2278 | Avisos completos, carrusel con scroll visible, reglas de Perfiles acotadas y pie de Aplicaciones | 18,66 → 6,24 / 16,93 → 7,03 %   | 22,08 → 5,85 / 18,89 → 6,47 %  |
| #2283 | Compacto solo en General; estados de Atajos y ayudas de otras pestañas conservados               | 7,85 → 4,91 / 8,47 → 5,63 %     | 14,55 → 5,83 / 12,47 → 6,51 %  |

El empeoramiento previo de General claro (16,07 %) queda corregido: las filas habían perdido su relleno vertical y las ayudas de avisos se habían convertido en notas permanentes. Se recupera el relleno del GPUI y toastsHelp vuelve a ser opcional; el motivo real de launcherHelp permanece visible. La revisión inicial se conserva en `pasada-visual/revisiones/v1`.

Chromium real comprueba los textos largos, foco, Perfiles/Aplicaciones/Nuevo perfil, estados registrados/sin confirmar, Atajos vacío y las ayudas de Privacidad/Diagnóstico. La comprobación está integrada en el job web. Renderer y scripts pasan tipos. Las nuevas capturas están en `D:/VantareServer/evidence/hub-web/pasada-visual/despues`; tablas y pares en `PR-2278/RESULTADOS.md` y `PR-2283/RESULTADOS.md`. Todas se hacen con captura.lock, una a la vez y sin compilaciones simultáneas.

Los candidatos QA combinan únicamente los estilos independientes de estos PR y los ya aprobados de Cuenta/Testing. `CANDIDATO-DESPUES.json` contiene procedencia, SHA de ASAR y blobs Git de cada UI; `instance.json` enlaza cada captura al candidato usado. Ninguno se distribuye. Se conservan también los cierres QA forzados tras cinco segundos: son una limitación de las ejecuciones, no una salida normal ni un resultado oculto.

H-V01 sigue abierto. Inicio ya carga PNG reales cuando existen; faltan los artefactos nativos acreditados. Los cinco tipos que usa Inicio tienen una foto base disponible, pero la receta global actual requiere los 19 tipos y cuatro corpus siguen incompletos. Tampoco hay recibo de Workshop verificado contra nightly. El guard exige todos los worktrees limpios y hay cambios ajenos en el checkout de integración que este worker no puede borrar. La evaluación está en `D:/VantareServer/evidence/hub-web/pasada-visual/H-V01.md`; no se inventan historiales ni se sustituyen PNG reales por recortes de capturas.

El informe general conserva explícitamente las celdas pendientes de referencia o inspección. No se declara terminada la pasada completa.

## Referencia de Studio

REF-ST01 afecta a la maqueta A de SHA-256 `fa9acc97776ef3e65662a0bea8c0eaae51891bb263dfc8376f408682694571c4`, con barra abierta. En `variante-a.html:183`, `.main` es su propio contenedor; la consulta de las líneas 230–232 intenta cambiar la rejilla del mismo `.main`. Los nombres se ocultan, pero la rejilla sigue en 248 px. ESPEC-A §11 exige 72 px en compacto. El producto aplica la consulta a un hijo y cumple esa medida.

La tabla conserva el porcentaje bruto y lo marca como defecto de referencia, no como fallo del producto. El par de prueba está en `D:/VantareServer/evidence/hub-web/pasada-visual/comparaciones/1280x800/light/studio-estado-delta/expanded/comparison-reference-left.png`. El original HTML no se modifica para reducir la diferencia. `pasada-visual-referencias.json` deja la anotación ligada al hash exacto; una maqueta nueva requiere recibos nuevos.

Se han verificado los 104 recibos de Studio: fuente, estado, tamaño, tema, barra, Chromium/V8 y nueve hashes de fuentes. Esa verificación demuestra la procedencia; no oculta el defecto de la maqueta.

La reserva del orquestador comenzó al terminar la escena a las 10:41:48 CET del 13/11 y se levantó por aviso expreso a las 11:01; no hubo adquisiciones propias durante esa reserva. Las tandas posteriores propias ceden 75 segundos, sin cerrojo, después de cada dos escenas para permitir entrar a la cola nativa.

## Cobertura calculada

La primera matriz completa contiene 352 comparaciones (44 escenas × dos tamaños × dos temas × dos barras), sin errores de generación. Hay 104 recibos de Studio verificados. La inspección humana sigue abierta: una cifra disponible no acredita por sí sola ausencia de defectos. Calendario compacto se corrige en #2296; las miniaturas de Inicio y el defecto REF-ST01 siguen señalados explícitamente.

## Reserva para L56 · 13/11

La tanda se detuvo a las 13:50:37 CET, al cerrar normalmente la ventana que ya estaba en curso. No se adquiere ningún turno gráfico antes de las 14:15:26 CET (más de veinte minutos libres). El guard se aplica también a los comprobadores locales y al empaquetado que usa el candado como reserva. No hay trabajos gráficos propios en espera que puedan arrancar por su cuenta.

Al reanudar, cada dos escenas se ceden tres minutos completos sin candado. El presupuesto de bloque persiste entre las invocaciones propias; antes de otra adquisición, un bloque de ocho minutos también fuerza ese hueco. No se interrumpe el turno de otro worker.

Calendario #2296 está listo: 40 pares, media de 1280×800 13,55 → 10,32 %, sin condiciones que empeoren. El cierre forzado intermedio se conserva con su repetición normal. Inicio #2299 ya tiene validación real de 32 combinaciones; solo 12/32 capturas finales estaban hechas al aplicar la pausa. Apariencia #2301 y el resumen compacto de Rendimiento #2303 tienen su código separado y esperan validación gráfica.

La matriz versionada de 352 métricas es una instantánea de la línea base y de los candidatos registrados al calcularla; no se atribuyen a ella las capturas posteriores aún incompletas. La generación final se hará cuando estén completas. H-V01 (PNG nativos) y REF-ST01 (maqueta de Studio contradictoria) permanecen documentados.

## Reanudación tras interrupción · 14/11

La reserva de L56 se respetó: la primera captura posterior empezó a las 14:24:34 CET del 13/11, más de 33 minutos después del último cierre propio. El primer hueco adicional quedó registrado entre 14:25:00 y 14:28:00, sin candado. La tanda posterior sufrió una interrupción externa y dejó el recibo de su escena y un candado con PID 1520.

A las 01:37 del 14/11 se comprobó que ese PID ya no existía y no quedaban Electron ni Hub; se retiró el candado huérfano y quedó anotado en progreso.log. Los resultados interrumpidos se conservan en revisiones/home-v11-interrupcion-20261113. Se repite una vez la captura de los casos con limpieza forzada; no se altera su recibo ni se declara un cierre normal sin comprobarlo.

Los PR #2299 (Inicio), #2301 (Apariencia) y #2303 (Rendimiento) tienen CI verde, pero aún no se presentan como visualmente terminados. Falta completar y revisar sus pares finales. La tabla global sigue siendo una instantánea, no una afirmación de que se haya reconstruido y capturado todo el nightly actual.
