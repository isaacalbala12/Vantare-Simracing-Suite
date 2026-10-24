//! Optional legacy turn marker; the named mutex remains the capture owner.
use std::{
    fs,
    path::Path,
    time::{Duration, SystemTime},
};

const LEASE: Duration = Duration::from_mins(15);

#[cfg(windows)]
pub(super) fn check_environment() -> Result<(), String> {
    let path = std::env::var_os("VANTARE_CAPTURE_TURN_FILE").map_or_else(
        || "C:/tmp/fase2/pantalla-ocupada".into(),
        std::path::PathBuf::from,
    );
    check(
        &path,
        std::env::var("VANTARE_CAPTURE_TURN").ok().as_deref(),
        SystemTime::now(),
    )
}

// Called under Global\VantareParityCapture. Marker writers must hold that
// mutex while creating/refreshing/removing the file, too. A dead writer's
// marker expires without requiring a manual deletion on this machine.
fn check(path: &Path, own: Option<&str>, now: SystemTime) -> Result<(), String> {
    let marker = match fs::read_to_string(path) {
        Ok(marker) => marker,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(()),
        Err(error) => {
            return Err(format!(
                "leer marcador de turno {}: {error}",
                path.display()
            ));
        }
    };
    let modified = fs::metadata(path)
        .and_then(|metadata| metadata.modified())
        .map_err(|error| format!("fecha del marcador de turno: {error}"))?;
    if now.duration_since(modified).unwrap_or_default() >= LEASE {
        fs::remove_file(path).map_err(|error| format!("limpiar marcador caducado: {error}"))?;
        crate::capture_output::expired_turn(path);
        return Ok(());
    }
    if own.is_some_and(|own| !own.is_empty() && own == marker.trim()) {
        Ok(())
    } else {
        Err(format!(
            "marcador de turno activo en {}; espera a su dueño o a su caducidad (15 minutos); no se abre ninguna ventana",
            path.display()
        ))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn active_foreign_turn_blocks_but_orphan_expires_and_is_removed() {
        let path = std::env::temp_dir().join(format!("capture-turn-orphan-{}", std::process::id()));
        fs::write(&path, "worker-a\n").expect("marcador");
        let now = fs::metadata(&path)
            .expect("metadata")
            .modified()
            .expect("mtime");
        assert!(check(&path, Some("worker-b"), now).is_err());
        assert!(path.exists());
        assert!(check(&path, Some("worker-a"), now).is_ok());
        assert!(check(&path, None, now + LEASE - Duration::from_secs(1)).is_err());
        assert!(check(&path, None, now + LEASE).is_ok());
        assert!(!path.exists(), "el marcador huérfano se limpia");
        assert!(check(&path, None, now + LEASE).is_ok());
    }

    #[test]
    fn custom_marker_path_is_respected_and_future_or_empty_markers_fail_closed() {
        let root = std::env::temp_dir().join(format!("capture-turn-custom-{}", std::process::id()));
        fs::create_dir_all(&root).expect("directorio");
        let path = root.join("mi-turno");
        fs::write(&path, "").expect("marcador vacío");
        let now = fs::metadata(&path)
            .expect("metadata")
            .modified()
            .expect("mtime");
        assert!(check(&path, Some(""), now).is_err());
        assert!(check(&path, None, now - Duration::from_secs(1)).is_err());
        assert!(path.exists());
        assert!(check(&path, None, now + LEASE).is_ok());
        fs::remove_dir(root).expect("limpiar directorio");
    }
}
