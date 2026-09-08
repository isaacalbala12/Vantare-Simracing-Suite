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

Pruebas en curso: RED de aviso y correlacion nativa; 7 UI y paquete app PASS.
Validacion de publicacion mediante servidor local de tests; no se publica nada real.
Pendientes: suites completas, review y Wails con copia aislada de bandeja real.
