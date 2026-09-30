//! Propietario único de una DB de series v1. No se enlaza desde UI/IPC/Core.

use std::io::{self, BufRead, Write};
use std::path::Path;

use duckdb::{Config, Connection, params};
use serde_json::{Value, json};
use vantare_runtime::flows::{MAX_CHUNK_BYTES, SeriesAnalysis, SeriesChunk};

pub type Result<T> = std::result::Result<T, Box<dyn std::error::Error + Send + Sync>>;
const SCHEMA: &str = "vantare.series-db.v1";
const MAX_REQUEST_BYTES: usize = MAX_CHUNK_BYTES + 128;
pub const MAX_PAGE_CHUNKS: usize = 16;

struct Store {
    connection: Connection,
    read_only: bool,
    watermark: u64,
    analysis: SeriesAnalysis,
    failed: bool,
}

impl Store {
    fn open(path: &Path, read_only: bool) -> Result<Self> {
        let exists = path.exists();
        if read_only && !exists {
            return Err("DB histórica inexistente".into());
        }
        let config = Config::default()
            .access_mode(if read_only {
                duckdb::AccessMode::ReadOnly
            } else {
                duckdb::AccessMode::ReadWrite
            })?
            .enable_autoload_extension(false)?
            .enable_external_access(false)?
            .threads(2)?
            .max_memory("256MB")?;
        let mut connection = Connection::open_with_flags(path, config)?;
        if !exists {
            let tx = connection.transaction()?;
            tx.execute_batch("CREATE TABLE series_meta (singleton BOOLEAN PRIMARY KEY CHECK(singleton), schema_version VARCHAR NOT NULL, watermark UBIGINT NOT NULL, finished BOOLEAN NOT NULL, attempted UBIGINT NOT NULL); CREATE TABLE series_chunks (idx UBIGINT PRIMARY KEY, payload BLOB NOT NULL CHECK(octet_length(payload) <= 32768));")?;
            tx.execute(
                "INSERT INTO series_meta VALUES (true, ?, 0, false, 0)",
                [SCHEMA],
            )?;
            tx.commit()?;
        }
        // No inicializar ni migrar archivos ajenos, aunque sean DuckDB válidos.
        let (schema, watermark): (String, u64) = connection.query_row(
            "SELECT schema_version, watermark FROM series_meta WHERE singleton",
            [],
            |row| Ok((row.get(0)?, row.get(1)?)),
        )?;
        if schema != SCHEMA {
            return Err("versión de almacenamiento desconocida".into());
        }
        let maximum: u64 = connection.query_row(
            "SELECT coalesce(max(idx), 0)::UBIGINT FROM series_chunks",
            [],
            |row| row.get(0),
        )?;
        if maximum != watermark {
            return Err("watermark inconsistente; preservar DB para diagnóstico".into());
        }
        let analysis = SeriesAnalysis::new(1)?;
        let mut store = Self {
            connection,
            read_only,
            watermark,
            analysis,
            failed: false,
        };
        // Consultas históricas no recorren toda la sesión al abrir.
        if read_only {
            return Ok(store);
        }
        let mut after = 0;
        loop {
            let page = store.page(after, MAX_PAGE_CHUNKS)?;
            if page.is_empty() {
                break;
            }
            for chunk in page {
                store.analysis.consume(&chunk)?;
                after = chunk.index;
            }
        }
        Ok(store)
    }

    fn page(&self, after: u64, limit: usize) -> Result<Vec<SeriesChunk>> {
        if !(1..=MAX_PAGE_CHUNKS).contains(&limit) {
            return Err("página fuera de límites".into());
        }
        let mut statement = self.connection.prepare("SELECT idx, CASE WHEN octet_length(payload) <= 32768 THEN payload ELSE NULL END FROM series_chunks WHERE idx > ? ORDER BY idx LIMIT ?")?;
        let rows = statement.query_map(params![after, u64::try_from(limit)?], |row| {
            Ok((row.get::<_, u64>(0)?, row.get::<_, Vec<u8>>(1)?))
        })?;
        let mut chunks = Vec::with_capacity(limit);
        for row in rows {
            let (index, payload) = row?;
            let chunk = SeriesChunk::from_bytes(&payload)?;
            if chunk.index != index {
                return Err("índice/payload inconsistente".into());
            }
            chunks.push(chunk);
        }
        Ok(chunks)
    }

    fn append(&mut self, chunk: &SeriesChunk) -> Result<u64> {
        if self.read_only {
            return Err("histórico read-only".into());
        }
        if self.failed {
            return Err("transacción incierta; reabrir antes de continuar".into());
        }
        let payload = chunk.to_bytes()?;
        if chunk.index <= self.watermark {
            let previous: Vec<u8> = self.connection.query_row(
                "SELECT payload FROM series_chunks WHERE idx = ?",
                [chunk.index],
                |row| row.get(0),
            )?;
            if previous != payload {
                return Err("índice repetido con contenido distinto".into());
            }
            return Ok(self.watermark);
        }
        self.analysis.consume(chunk)?;
        // Si SQL/COMMIT falla, el estado en memoria ya no describe la DB.
        // Fallar cerrado: solo reabrir recupera el último prefijo confirmado.
        self.failed = true;
        let tx = self.connection.transaction()?;
        tx.execute(
            "INSERT INTO series_chunks VALUES (?, ?)",
            params![chunk.index, payload],
        )?;
        tx.execute(
            "UPDATE series_meta SET watermark = ? WHERE singleton",
            [chunk.index],
        )?;
        tx.commit()?;
        // El cliente nunca recibe watermark adelantado a un COMMIT efectivo.
        self.watermark = chunk.index;
        self.failed = false;
        Ok(self.watermark)
    }
}

/// Protocolo local de arrays JSON, un frame por línea, comandos cerrados.
/// EOF cierra la conexión. Error termina el proceso sin ACK ni reintento oculto.
pub fn serve(
    path: &Path,
    read_only: bool,
    mut input: impl BufRead,
    mut output: impl Write,
) -> Result<()> {
    let mut store = Store::open(path, read_only)?;
    respond(&mut output, &json!(["ready", store.watermark]))?;
    while let Some(bytes) = read_frame(&mut input)? {
        let command: Value = serde_json::from_slice(&bytes)?;
        let fields = command.as_array().ok_or("comando inválido")?;
        let response = match fields.as_slice() {
            [Value::String(name), chunk] if name == "append" => {
                let chunk = SeriesChunk::from_bytes(&serde_json::to_vec(chunk)?)?;
                json!(["ack", store.append(&chunk)?])
            }
            [Value::String(name)] if name == "status" => json!(["status", store.watermark]),
            [Value::String(name), after, limit] if name == "page" => {
                let after = after.as_u64().ok_or("cursor inválido")?;
                let limit = usize::try_from(limit.as_u64().ok_or("límite inválido")?)?;
                let chunks = store.page(after, limit)?;
                let values = chunks
                    .iter()
                    .map(|chunk| Ok(serde_json::from_slice::<Value>(&chunk.to_bytes()?)?))
                    .collect::<Result<Vec<_>>>()?;
                json!(["page", values])
            }
            [Value::String(name)] if name == "stop" => break,
            _ => return Err("comando desconocido o campos inválidos".into()),
        };
        respond(&mut output, &response)?;
    }
    Ok(())
}

fn read_frame(input: &mut impl BufRead) -> io::Result<Option<Vec<u8>>> {
    let mut bytes = Vec::new();
    let count =
        io::Read::take(input, (MAX_REQUEST_BYTES + 1) as u64).read_until(b'\n', &mut bytes)?;
    if count == 0 {
        return Ok(None);
    }
    if count > MAX_REQUEST_BYTES || bytes.last() != Some(&b'\n') {
        return Err(io::Error::new(
            io::ErrorKind::InvalidData,
            "frame truncado o fuera de límites",
        ));
    }
    bytes.pop();
    Ok(Some(bytes))
}

fn respond(output: &mut impl Write, value: &Value) -> Result<()> {
    serde_json::to_writer(&mut *output, value)?;
    output.write_all(b"\n")?;
    output.flush()?;
    Ok(())
}

#[cfg(test)]
mod tests;
