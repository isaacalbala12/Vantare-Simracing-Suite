use std::fs::{self, OpenOptions};
use std::io::{self, Read, Write};
use std::path::Path;

use vantare_runtime::flows::{Cursor, wire};

pub fn load_cursor(path: &Path) -> io::Result<Option<Cursor>> {
    let file = match fs::File::open(path) {
        Ok(file) => file,
        Err(error) if error.kind() == io::ErrorKind::NotFound => return Ok(None),
        Err(error) => return Err(error),
    };
    let mut bytes = Vec::new();
    file.take(129).read_to_end(&mut bytes)?;
    if bytes.len() > 128 {
        return Err(io::Error::new(
            io::ErrorKind::InvalidData,
            "checkpoint demasiado grande",
        ));
    }
    let value = serde_json::from_slice(&bytes)
        .map_err(|error| io::Error::new(io::ErrorKind::InvalidData, error))?;
    wire::decode_cursor(&value).map(Some)
}

pub(super) fn save_cursor(path: &Path, cursor: Cursor) -> io::Result<()> {
    // Temporal único por intento: un resto huérfano o un PID reutilizado no
    // deben impedir guardar. Solo se borra el temporal propio tras un fallo
    // de escritura; nunca los ajenos. Reintento acotado ante colisión.
    static NEXT: std::sync::atomic::AtomicU64 = std::sync::atomic::AtomicU64::new(0);
    for _ in 0..8 {
        let uniq = NEXT.fetch_add(1, std::sync::atomic::Ordering::Relaxed);
        let nanos = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|elapsed| elapsed.as_nanos())
            .unwrap_or(0);
        let temp = path.with_extension(format!(
            "checkpoint-{}-{nanos}-{uniq}.tmp",
            std::process::id()
        ));
        let mut file = match OpenOptions::new().create_new(true).write(true).open(&temp) {
            Err(error) if error.kind() == io::ErrorKind::AlreadyExists => continue,
            Err(error) => return Err(error),
            Ok(file) => file,
        };
        let result = (|| {
            file.write_all(wire::encode_cursor(cursor).to_string().as_bytes())?;
            file.sync_all()?;
            drop(file);
            fs::rename(&temp, path)
        })();
        if result.is_err()
            && let Err(error) = fs::remove_file(&temp)
        {
            eprintln!("limpieza de checkpoint: {error}");
        }
        return result;
    }
    Err(io::Error::new(
        io::ErrorKind::AlreadyExists,
        "temporal de checkpoint ocupado tras varios intentos",
    ))
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::atomic::{AtomicU64, Ordering};

    fn workdir(tag: &str) -> std::path::PathBuf {
        static NEXT: AtomicU64 = AtomicU64::new(0);
        let dir = std::env::temp_dir().join(format!(
            "vantare-checkpoint-test-{}-{}-{tag}",
            std::process::id(),
            NEXT.fetch_add(1, Ordering::Relaxed)
        ));
        fs::create_dir_all(&dir).expect("temporal del test");
        dir
    }

    #[test]
    fn legacy_orphan_tmp_does_not_block_save_and_is_preserved() {
        let dir = workdir("huerfano");
        let path = dir.join("cursor.json");
        // Resto de una muerte anterior con el esquema fijo por PID.
        let orphan = path.with_extension(format!("checkpoint-{}.tmp", std::process::id()));
        fs::write(&orphan, b"huerfano").expect("tmp huerfano");
        let cursor = Cursor { epoch: 1, index: 2 };
        save_cursor(&path, cursor).expect("el huerfano no debe impedir guardar");
        assert_eq!(load_cursor(&path).expect("leer"), Some(cursor));
        // Temporal ajeno: no se borra ni se reutiliza.
        assert_eq!(fs::read(&orphan).expect("huerfano intacto"), b"huerfano");
        fs::remove_dir_all(&dir).expect("limpiar");
    }

    #[test]
    fn consecutive_saves_overwrite_cursor() {
        let dir = workdir("doble");
        let path = dir.join("cursor.json");
        save_cursor(&path, Cursor { epoch: 1, index: 0 }).expect("primero");
        let cursor = Cursor { epoch: 1, index: 7 };
        save_cursor(&path, cursor).expect("segundo");
        assert_eq!(load_cursor(&path).expect("leer"), Some(cursor));
        fs::remove_dir_all(&dir).expect("limpiar");
    }
}
