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
    let temp = path.with_extension(format!("checkpoint-{}.tmp", std::process::id()));
    let mut file = OpenOptions::new()
        .create_new(true)
        .write(true)
        .open(&temp)?;
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
    result
}
