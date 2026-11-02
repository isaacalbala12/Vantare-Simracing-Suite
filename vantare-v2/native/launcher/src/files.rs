//! Fachada compatible del escritor común de IPC.
#[cfg(test)]
use std::fs::OpenOptions;
use std::path::Path;
#[cfg(test)]
use std::{fs, path::PathBuf};
pub use vantare_ipc::files::MAX_DOCUMENT;

pub fn read(path: &Path, limit: u64) -> Result<Vec<u8>, String> {
    vantare_ipc::files::read(path, limit).map_err(|error| error.to_string())
}

pub fn save(path: &Path, data: &[u8], expected: Option<&[u8]>) -> Result<(), String> {
    save_with_limit(path, data, expected, MAX_DOCUMENT)
}

pub fn save_with_limit(
    path: &Path,
    data: &[u8],
    expected: Option<&[u8]>,
    limit: u64,
) -> Result<(), String> {
    vantare_ipc::files::save(
        path,
        data,
        vantare_ipc::files::Mode::Observed(expected),
        &vantare_ipc::files::Options {
            limit,
            ..Default::default()
        },
    )
    .map_err(|error| error.to_string())
}

/// Ruta absoluta de Windows PowerShell.
///
/// Resolverlo por nombre deja que un `powershell.exe` plantado en el directorio
/// de trabajo o en el PATH se ejecute con los privilegios del Hub. Lo comparten
/// el lector de accesos directos y el arnes de captura para que no divergan:
/// el segundo lo invocaba por nombre.
#[cfg(windows)]
pub fn windows_powershell() -> Result<std::path::PathBuf, String> {
    Ok(
        std::path::PathBuf::from(std::env::var_os("SystemRoot").ok_or("SystemRoot ausente")?)
            .join("System32/WindowsPowerShell/v1.0/powershell.exe"),
    )
}

#[cfg(test)]
fn sibling(path: &Path, suffix: &str) -> PathBuf {
    let mut name = path.as_os_str().to_os_string();
    name.push(suffix);
    name.into()
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
