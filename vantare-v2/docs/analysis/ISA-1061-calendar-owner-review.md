# ISA-1061 - Aviso Owner y revision de horario Discord

Aprobado por Isaac: aviso persistente, acceso directo, resumen y aceptar/publicar explicitamente.
Base ISA-1058 591b48b7 sobre nightly d6d0992f. Rama aislada vantareapp/isa-1061-calendar-owner-review.

Se reutilizan bandeja nativa, pantalla Ajustes y publicador existente. El aviso
consulta solo para Owner en Hub visible (inicio/foco/visibilidad y cada minuto),
no en Studio. No toasts repetidos ni dependencia nueva. Revisa el candidato mas
reciente no caducado. El enlace selecciona su messageId/hash, no un indice.

La fuente es de solo lectura y el parser nativo produce vigencia, series y diff.
Aceptar y publicar guarda el borrador revisado y publica exclusivamente despues
de su ACK; guardar solo borrador sigue disponible. Parse/save llevan requestId,
publicacion confirma draftId. Respuestas ajenas no habilitan ni confirman acciones.
Esta correlacion exige ampliar los handlers y servicio existentes (sin permisos nuevos).

Un recibo local por candidato se escribe solo tras ACK de publicacion y retira
el aviso. No es autoridad de publicacion: reiniciar el perfil puede volver a
ofrecer revision. No sincroniza recibos entre instalaciones. El bot sigue separado,
lee Discord y no publica. HUD/OBS/Studio sin modificaciones de producto.

Validacion de publicacion mediante servidor local de tests; no se publica nada real.


ISA-1061 review inicial REQUEST_CHANGES 12200d59: dos P2 de ciclo de vida.
Reproducidos RED: ACK perdido al salir de Ajustes y operacion bloqueada al
cambiar idioma. Corregidos: listener de una publicacion sobrevive a navegacion
hasta ACK/error y mantiene el recibo; cambiar traduccion conserva request pendiente.
10 pruebas de flujo PASS. Fullfrontend previo: 3308 PASS/2 omitidas, build/lint
PASS. Se revalidan cambios finales; Go completo en curso. No publicacion real.

## Estado verificado 2026-09-08

Producto final: 744009173d45b8a326e5645b65047fbd7ca39f54; review independiente ACCEPT.
147 tests focalizados PASS; Go completo PASS (sin cambios Go posteriores).
Build final incluye typecheck real y frontend; lint PASS; 44 tests roadmap PASS.
Suite completa sobre 2491c70c: 3309 PASS, 2 omitidas y 1 fallo:
OverlayFrame v2 parse P99 1.654 ms frente a 1.5 ms. Su repeticion aislada PASS.
No se declara la suite completa verde ni se atribuye causalidad a este cambio.
Los cambios posteriores solo afectan disposicion de tarjetas y script de geometria;
no se repite la suite completa tras ese ajuste. No hay ahorro CPU/GPU/RAM medido.

Wails real 2491c70c, 1264x761, bandeja publica copiada a configs aislados:
aviso Owner visible; Revisar horario selecciona mensaje 1545468817164214444,
8-15 septiembre, 11 series, +2/9 modificadas/-2; fuente readonly1653 caracteres,
Aceptar y publicar habilitado; aviso permanece tras navegar y recargar.
No se pulsa guardar ni publicar. Se cerro exclusivamente esta instancia.

La inspeccion visual reprodujo fuente recortada por tarjetas flexibles:
textarea238 px dentro de body42/card62. RED geometrico contained=false.
74400917 elimina fill de las tres tarjetas, evita encogimiento y da ancho completo
al textarea. Script read-only scripts/bench/calendar-review-layout.mjs permite
repetir la comprobacion contra el Hub con la revision abierta.
La revision automatica de permisos bloqueo el nuevo arranque sin motivo detallado:
queda PENDIENTE el GREEN geometrico y captura Wails del ajuste final. No se presenta
la captura previa como prueba de la correccion final.

Exe final bin/isa1061/vantare-calendar-owner.exe, SHA256
60d007f1b0739a6585dbc5f5a023507b45f1450d1faf974f56c2d01730026ceb.
Logs/capturas locales: results/isa1061. Instancia portable independiente; no se
copiaron credenciales ni configuracion privada. Bot original sin cambios.

## Verificacion manual pendiente

Abrir el ejecutable aislado, entrar al Hub como Owner, pulsar Revisar horario.
Comprobar que se leen candidatos y texto fuente usando scroll del panel, y que
vigencia/11 series corresponden al original. Ejecutar el script geometrico con
la URL CDP de esa instancia. Aceptar y publicar es una accion real reservada al
usuario; aqui solo se valido el flujo de ACK/errores en tests. Tras publicacion
confirmada, el aviso debe desaparecer y no repetirse para ese candidato.

Rama vantareapp/isa-1061-calendar-owner-review, base inmediata591b48b7,
base de canal nightlyd6d0992f. Entrega candidata; sin integracion, promocion,
release ni publicacion real de calendario. Push/PR draft y estado CI se registran
en la issue1061 al entregar; no equivalen a aceptacion visual pendiente.
