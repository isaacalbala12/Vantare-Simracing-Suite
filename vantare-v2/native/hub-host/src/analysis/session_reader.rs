//! Consultas internas v2; cada operación comparte un solo plazo y recoge el helper al fallar.
use super::*;
use serde::de::DeserializeOwned;
const PAGE_SIZE: usize = 256;
const MAX_LAPS: u64 = 4096;

fn metadata_page<T: DeserializeOwned>(
    frame: Value,
    tag: &str,
    version: &str,
) -> Result<Option<(u64, Vec<T>)>> {
    if frame == json!(["unsupported", "meta"]) {
        return Ok(None);
    }
    let Value::Array(mut fields) = frame else {
        return Err(invalid("Respuesta de metadatos inválida"));
    };
    if fields.len() != 4 || fields[0] != tag || fields[1] != version {
        return Err(invalid("Versión o forma de metadatos inválida"));
    }
    let total = fields[2]
        .as_u64()
        .ok_or_else(|| invalid("Total de metadatos inválido"))?;
    let rows = fields.pop().ok_or_else(|| invalid("Faltan filas"))?;
    let length = rows
        .as_array()
        .ok_or_else(|| invalid("Filas de metadatos inválidas"))?
        .len();
    if length > PAGE_SIZE
        || u64::try_from(length).map_err(|_| invalid("Filas fuera de límites"))? > total
    {
        return Err(invalid("Total o límite de filas inconsistente"));
    }
    let rows = serde_json::from_value(rows).map_err(|e| invalid(e.to_string()))?;
    Ok(Some((total, rows)))
}
impl Reader {
    /// Uso exclusivo del worker propietario del Reader; no llamar desde el puente.
    pub fn sessions(&mut self) -> Result<Vec<SessionSummary>> {
        self.sessions_until(Instant::now() + self.timeout)
    }
    pub(super) fn sessions_until(&mut self, deadline: Instant) -> Result<Vec<SessionSummary>> {
        let result = (|| {
            self.unchanged(deadline)?;
            let frame = self.request(&json!(["session-summaries"]), deadline)?;
            let rows =
                metadata_page::<SessionSummary>(frame, "session-summaries", "series-session.v1")?
                    .map_or_else(Vec::new, |(_, rows)| rows);
            if rows
                .windows(2)
                .any(|rows| (rows[0].epoch, rows[0].session) <= (rows[1].epoch, rows[1].session))
            {
                return Err(invalid("Orden o identidad de sesiones inválidos"));
            }
            self.unchanged(deadline)?;
            Ok(rows)
        })();
        self.finish_result(result)
    }
    pub fn lap_times(&mut self, epoch: u64, session: u64) -> Result<Vec<LapTime>> {
        let deadline = Instant::now() + self.timeout;
        let result = (|| {
            self.unchanged(deadline)?;
            let mut laps = Vec::new();
            let mut after = None;
            let mut expected = None;
            loop {
                let frame = self.request(
                    &json!(["lap-times", epoch, session, after, PAGE_SIZE]),
                    deadline,
                )?;
                let Some((total, rows)) =
                    metadata_page::<LapTime>(frame, "lap-times", "series-laps.v1")?
                else {
                    if expected.is_some() {
                        return Err(invalid("Metadatos desaparecidos entre páginas"));
                    }
                    break;
                };
                if total > MAX_LAPS {
                    return Err(error(ErrorCode::Limit, "Más de 4096 vueltas por sesión"));
                }
                if expected.is_some_and(|expected| expected != total) {
                    return Err(invalid("Total de vueltas cambiado"));
                }
                expected = Some(total);
                let remaining = usize::try_from(total)
                    .map_err(|_| invalid("Total de vueltas inválido"))?
                    .checked_sub(laps.len())
                    .ok_or_else(|| invalid("Demasiadas vueltas"))?;
                if rows.len() != remaining.min(PAGE_SIZE) {
                    return Err(invalid("Página de vueltas incompleta"));
                }
                for row in rows {
                    let key = (row.car, row.lap);
                    if (row.epoch, row.session) != (epoch, session)
                        || after.is_some_and(|previous| key <= previous)
                    {
                        return Err(invalid("Identidad u orden de vueltas inválidos"));
                    }
                    after = Some(key);
                    laps.push(row);
                }
                if u64::try_from(laps.len()).map_err(|_| invalid("Vueltas fuera de límites"))?
                    == total
                {
                    break;
                }
            }
            self.unchanged(deadline)?;
            Ok(laps)
        })();
        self.finish_result(result)
    }
}
