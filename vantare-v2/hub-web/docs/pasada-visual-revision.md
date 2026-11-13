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
