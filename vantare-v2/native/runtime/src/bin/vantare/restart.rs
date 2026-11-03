//! The installed session consumes a restart request only after its children exit.
use std::{fs, io, path::Path};

pub(super) fn take(root: &Path) -> io::Result<bool> {
    match fs::remove_file(root.join("restart-request")) {
        Ok(()) => Ok(true),
        Err(error) if error.kind() == io::ErrorKind::NotFound => Ok(false),
        Err(error) => Err(error),
    }
}
