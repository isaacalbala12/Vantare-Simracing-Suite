# Calendario · contrato de publicación (VANTA-131, paso 9)

`race_schedule_current` sigue siendo la fuente oficial. Services valida la
agenda antes de entregarla por IPC al Hub; si es inválida, ofrece el respaldo
de RaceControl cuando está disponible. El Hub identifica ese respaldo como
**no oficial**. No se publica ni corrige una agenda desde el cliente.

La función `public.race_schedule_valid(jsonb)` valida el mismo contrato en SQL
y solo concede `EXECUTE` a `service_role`. El corpus compartido está en
`vantare-v2/fixtures/calendar/cases.json`; los tests de Services, Hub y
PostgreSQL lo recorren, junto a la publicación LMU de octubre. El rollback
retira únicamente la función nueva.

El publicador `race_schedule_draft_save`/`race_schedule_publish` permanece como
está. Decidir si su dueño pasa a admin (VANTA-132) o si se retira corresponde
a Isaac; esa decisión no se anticipa en esta migración.
