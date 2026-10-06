//! Archivos locales acotados. Escritura atómica y conflicto por bytes observados.
use std::fs::{self, File, OpenOptions};
use std::io::{Read, Write};
use std::path::{Path, PathBuf};

pub const MAX_DOCUMENT: u64 = 5 * 1024 * 1024;

fn check_path(path: &Path) -> Result<(), String> {
    if path.components().any(|part| {
        part.as_os_str()
            .to_string_lossy()
            .to_ascii_lowercase()
            .starts_with(".env")
    }) {
        return Err("no se admiten archivos de entorno".into());
    }
    Ok(())
}

pub fn read(path: &Path, limit: u64) -> Result<Vec<u8>, String> {
    check_path(path)?;
    let mut data = Vec::new();
    File::open(path)
        .map_err(|e| format!("leer {}: {e}", path.display()))?
        .take(limit.saturating_add(1))
        .read_to_end(&mut data)
        .map_err(|e| format!("leer {}: {e}", path.display()))?;
    if u64::try_from(data.len()).map_err(|e| e.to_string())? > limit {
        return Err(format!("{} supera {limit} bytes", path.display()));
    }
    Ok(data)
}

/// Ruta absoluta de Windows PowerShell.
///
/// Resolverlo por nombre deja que un `powershell.exe` plantado en el directorio
/// de trabajo o en el PATH se ejecute con los privilegios del Hub. Lo comparten
/// el lector de accesos directos y el arnes de captura para que no divergan:
/// el segundo lo invocaba por nombre.
#[cfg(windows)]
pub(crate) fn windows_powershell() -> Result<std::path::PathBuf, String> {
    Ok(
        std::path::PathBuf::from(std::env::var_os("SystemRoot").ok_or("SystemRoot ausente")?)
            .join("System32/WindowsPowerShell/v1.0/powershell.exe"),
    )
}

/// Contador por proceso: hace unico el nombre del temporal de cada guardado.
static NEXT_TEMP: std::sync::atomic::AtomicU64 = std::sync::atomic::AtomicU64::new(0);

fn sibling(path: &Path, suffix: &str) -> PathBuf {
    let mut name = path.as_os_str().to_os_string();
    name.push(suffix);
    PathBuf::from(name)
}

/// `expected == None` solo permite crear. Un conflicto conserva ambos documentos.
/// El lock coordina escritores Hub; una herramienta externa debe respetarlo.
pub fn save(path: &Path, data: &[u8], expected: Option<&[u8]>) -> Result<(), String> {
    save_with_limit(path, data, expected, MAX_DOCUMENT)
}

/// Strategy retains migration archives up to the product's 12 MiB document cap.
pub fn save_with_limit(
    path: &Path,
    data: &[u8],
    expected: Option<&[u8]>,
    limit: u64,
) -> Result<(), String> {
    check_path(path)?;
    if u64::try_from(data.len()).map_err(|e| e.to_string())? > limit {
        return Err("documento demasiado grande".into());
    }
    if let Some(parent) = path.parent().filter(|p| !p.as_os_str().is_empty()) {
        fs::create_dir_all(parent).map_err(|e| format!("crear {}: {e}", parent.display()))?;
    }
    let lock = sibling(path, ".lock");
    // Cerrojo del SO: se libera solo al morir el proceso. El fichero de lock
    // anterior se creaba con `create_new` y habia que borrarlo a mano, asi que
    // una muerte durante el guardado dejaba TODO guardado posterior fallando
    // para siempre, con el mensaje pidiendo intervencion manual.
    let guard = OpenOptions::new()
        .write(true)
        .create(true)
        .truncate(false)
        .open(&lock)
        .map_err(|e| format!("bloquear {}: {e}", path.display()))?;
    guard.try_lock().map_err(|e| {
        format!(
            "bloquear {}: {e}; ya hay un guardado en curso",
            path.display()
        )
    })?;
    // Nombre unico por proceso y guardado. Con un `.tmp` fijo, un residuo de una
    // muerte anterior hacia fallar `create_new` para siempre, y la limpieza de
    // abajo tampoco lo borraba porque `created` nunca llegaba a ser true.
    let temp = sibling(
        path,
        &format!(
            ".{}.{}.tmp",
            std::process::id(),
            NEXT_TEMP.fetch_add(1, std::sync::atomic::Ordering::Relaxed)
        ),
    );
    let mut created = false;
    let result = (|| {
        let current = match fs::metadata(path) {
            Ok(_) => Some(read(path, limit)?),
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => None,
            Err(e) => return Err(format!("inspeccionar {}: {e}", path.display())),
        };
        if current.as_deref() != expected {
            return Err("conflicto: el documento cambió en disco; cargar antes de guardar".into());
        }
        // No sobrescribir un temporal ajeno, aunque coincida tras reutilizar un PID.
        let mut file = OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(&temp)
            .map_err(|e| format!("crear temporal {}: {e}", temp.display()))?;
        created = true;
        file.write_all(data)
            .and_then(|()| file.sync_all())
            .map_err(|e| format!("guardar temporal {}: {e}", temp.display()))?;
        drop(file);
        fs::rename(&temp, path).map_err(|e| format!("reemplazar {}: {e}", path.display()))?;
        created = false;
        Ok(())
    })();
    if created && let Err(error) = fs::remove_file(&temp) {
        eprintln!("limpiar {}: {error}", temp.display());
    }
    drop(guard);
    result
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn saves_atomically_rejects_conflict_and_survives_a_residual_lock() {
        let dir = std::env::temp_dir().join(format!("vantare-hub-files-{}", std::process::id()));
        fs::create_dir_all(&dir).expect("crear directorio de prueba");
        let path = dir.join("workspace.json");
        save(&path, b"original", None).expect("crear");
        assert!(save(&path, b"replace", None).is_err());
        assert!(save(&path, b"replace", Some(b"wrong")).is_err());
        assert_eq!(read(&path, 100).expect("leer"), b"original");
        save(&path, b"next", Some(b"original")).expect("reemplazar");
        // Un fichero de lock RESIDUAL no debe bloquear: con `create_new` todo
        // guardado posterior fallaba para siempre hasta borrarlo a mano. Lo que
        // excluye es el cerrojo del SO, no la existencia del fichero.
        fs::write(sibling(&path, ".lock"), b"").expect("lock residual");
        save(&path, b"after", Some(b"next")).expect("un lock residual no debe bloquear");
        assert_eq!(read(&path, 100).expect("leer"), b"after");
        let live_lock = OpenOptions::new()
            .write(true)
            .open(sibling(&path, ".lock"))
            .expect("abrir lock");
        live_lock.try_lock().expect("bloquear realmente");
        assert!(save(&path, b"blocked", Some(b"after")).is_err());
        assert_eq!(read(&path, 100).expect("conservar documento"), b"after");
        drop(live_lock);
        save(&path, b"released", Some(b"after")).expect("liberar lock del SO");
        fs::remove_file(path).expect("limpiar archivo de prueba");
        let _ = fs::remove_dir_all(dir);
    }

    #[test]
    fn environment_files_are_rejected_without_opening_them() {
        assert!(
            read(Path::new(".env.local"), 100)
                .expect_err("rechaza")
                .contains("entorno")
        );
    }
}
