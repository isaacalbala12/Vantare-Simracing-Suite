# Calendario · contrato de publicación (VANTA-131, paso 9)

`race_schedule_current` sigue siendo la fuente oficial. Services valida la
agenda antes de entregarla por IPC al Hub; si es inválida, ofrece el respaldo
de RaceControl cuando está disponible. El Hub identifica ese respaldo como
**no oficial**. No se publica ni corrige una agenda desde el cliente.

La autoridad de validación es Services en Rust. El corpus compartido está en
`vantare-v2/fixtures/calendar/cases.json`; los tests de Services y Hub lo
recorren, junto a la publicación LMU de octubre. No se crea una segunda
función SQL: nadie la llamaba y su contrato divergía con el de Rust.

El publicador `race_schedule_draft_save`/`race_schedule_publish` permanece como
está. Decidir si su dueño pasa a admin (VANTA-132) o si se retira corresponde
a Isaac. Si VANTA-132 traslada la publicación a admin, validará al publicar
con este corpus en su propia issue. La subida de capturas sigue desactivada.
