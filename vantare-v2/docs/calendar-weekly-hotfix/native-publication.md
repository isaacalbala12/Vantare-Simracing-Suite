# Calendario nativo · feedback 9-oct (#1496)

La fuente sigue siendo el anuncio LMU reenviado al canal Discord configurado.
El lector existente `cmd/lmu-calendar-bot` guarda candidatos, no publica.
Consultar [su runbook](discord-calendar-bot.md). No sustituir el anuncio por
un agregador ni trasladar las fechas del seed para publicar.

1. Ejecutar el lector existente con `--once`, con su credencial protegida ya
   configurada. No requiere copiar ni imprimir tokens. Revisar texto, canal,
   fecha y series del candidato; el hash detecta alteraciones, no autentica LMU.
2. Preparar el payload local desde la raíz `vantare-v2`:
   `python scripts/calendar-publication.py --inbox <bandeja> --message-id <id> --output C:/tmp/calendar-draft.json`.
   Rechaza candidatos caducados/futuros, ambiguos, fuente alterada y otro canal.
3. **Pedir autorización de Isaac antes de escribir en producción.** Verificar
   proyecto de destino y cuenta interna Owner activa; una sesión Clerk no
   sustituye el JWT Supabase del usuario interno verificado. No usar anon ni
   inventar `auth.uid()`. Con el cliente Owner existente de Wails, usar guardar
   borrador/revisar/publicar; alternativamente enviar el JSON preparado al RPC
   `race_schedule_draft_save` bajo esa misma sesión autorizada. Releer
   `race_schedule_my_draft`, comparar horario/texto/series y enviar su ID a
   `race_schedule_publish` como `{"p_draft_id":"<UUID revisado>"}`.
4. Releer `race_schedule_current`: deben coincidir ID, ventana UTC y series.
   En Hub nativo pulsar Actualizar horario y revisar Agenda/Carteles/Tiempos.
   Favorita: estrella y reinicio conservan la serie. Campana: guarda preferencia
   separada; **no existe aún entrega de avisos ni autolanzamiento**. La cuenta
   atrás usa el reloj real y se repinta cada 30 s; solo muestra salidas vigentes.
   No certificar avisos reales con una preferencia guardada.

## Prueba sin publicación

Una sesión con acceso tester vigente muestra **Probar calendario**. Carga el
catálogo real archivado del 25-ago con ventana trasladada siete días SOLO EN
MEMORIA; aparece PRUEBA LOCAL en las tres vistas. Marcar estrella/campana y
revisar próxima carrera/cuenta atrás. Salir de la prueba o perder acceso
restaura el horario y las preferencias previas. Reiniciar también descarta la
prueba. Ningún horario ni preferencia de prueba se escribe en la caché.

Checks: `python -m unittest discover -s scripts -p test_calendar_publication.py`,
fmt, Clippy, Nextest y lifecycle por cola. El test Rust verifica acceso denegado,
ventana vigente, favorita/aviso efímeros, ausencia de caché y restauración.

El 9-oct se recibió el anuncio vigente del canal configurado, mensaje
`1556611324048445536`: 11 series, ventana 6–13 oct. El parser ahora acepta
horas separadas por comas, marcado Discord en línea y textos de hora dentro
del juego; regresión basada en el texto real en `internal/calendar/testdata`.
La fuente y el borrador preparado están en `C:/tmp/feedback-0910/`.
La continuación tras el reinicio corrigió también los calificadores consecutivos
de combustible y VE/NRG: no se muestran como clases de coche. El candidato
reprocesado conserva texto/hash/fechas de origen en `calroad-discord-reparsed-inbox.json`;
usar `calroad-calendar-draft-resume.json` para la revisión Owner. Los borradores
anteriores se conservan como evidencia histórica, no como payload final.
Agenda dibuja hasta cuatro salidas por celda horaria y cuenta las adicionales
con «+N salidas»: evita generar toda la semana densa como elementos GPUI.
El horario completo se conserva; los filtros se aplican antes del resumen y
Tiempos/Carteles permiten consultar la próxima salida de cada serie.
Escena QA `calendario-lmu-local`: carga ese horario REAL, sin trasladar fechas;
usa el renderer y reloj del Hub, en datos aislados, e indica que Supabase está
pendiente. La fixture nativa es el horario serializado por el bot existente.
El seed empaquetado no se modifica ni se renueva su caducidad artificialmente.

Pendiente: revisión Owner y autorización para publicar. El mensaje futuro
del 13-oct (`1557775660158550197`) se rechaza por splits ausentes tras parseo
en WEC-Xperience: no se adivina el número ni se publica un candidato parcial.
Revisar ese próximo anuncio antes del 13-oct. El calendario oficial de
[eventos especiales](https://lemansultimate.com/special-events-calendar-q3-4-2026/)
sirve para contrastar el evento; los slots proceden del anuncio Discord.
