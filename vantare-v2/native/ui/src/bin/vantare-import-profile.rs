//! CLI offline: destino nuevo y separado; rollback de activación pertenece a packaging.
#[path = "../profile_import.rs"]
mod profile_import;

use profile_import::{MAX_PROFILE_BYTES, Monitor};
use std::fs::{self, File, OpenOptions};
use std::io::{Read, Write};
use std::path::{Path, PathBuf};
use std::process::ExitCode;

fn checked_path(path: &Path) -> Result<(), Box<dyn std::error::Error>> {
    for ancestor in path.ancestors() {
        if ancestor.file_name().is_some_and(|name| {
            name.to_string_lossy()
                .to_ascii_lowercase()
                .starts_with(".env")
        }) {
            return Err("rutas .env rechazadas".into());
        }
        match fs::symlink_metadata(ancestor) {
            Ok(meta) => {
                #[cfg(windows)]
                {
                    use std::os::windows::fs::MetadataExt;
                    if meta.file_attributes() & 0x400 != 0 {
                        return Err("reparse point rechazado".into());
                    }
                }
                if meta.is_symlink() {
                    return Err("enlace rechazado".into());
                }
            }
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => {}
            Err(e) => return Err(e.into()),
        }
    }
    Ok(())
}

fn import(
    source: &Path,
    destination: &Path,
    monitor: Monitor,
) -> Result<(), Box<dyn std::error::Error>> {
    // Resolver primero hace que '..' no pueda esconder un padre prohibido.
    let source = std::path::absolute(source)?;
    let destination = std::path::absolute(destination)?;
    checked_path(&source)?;
    checked_path(&destination)?;
    let mut bytes = Vec::new();
    File::open(&source)?
        .take(MAX_PROFILE_BYTES + 1)
        .read_to_end(&mut bytes)?;
    let (layout, report) = profile_import::convert(&bytes, monitor)?;
    // CreateDirectory falla si existe: nunca sobrescribe origen/layout anterior.
    fs::create_dir(&destination)?;
    for (name, bytes) in [
        ("layout.json", serde_json::to_vec_pretty(&layout)?),
        ("report.json", serde_json::to_vec_pretty(&report)?),
    ] {
        let mut file = OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(destination.join(name))?;
        file.write_all(&bytes)?;
        file.sync_all()?;
    }
    Ok(())
}

fn main() -> ExitCode {
    let args: Vec<_> = std::env::args().skip(1).collect();
    let usage =
        "uso: vantare-import-profile PERFIL-V4.json CARPETA-NUEVA MONITOR-X MONITOR-Y ANCHO ALTO";
    if args.len() != 6 {
        eprintln!("{usage}");
        return ExitCode::from(2);
    }
    let bounds: Result<Vec<f32>, _> = args[2..].iter().map(|arg| arg.parse()).collect();
    let Ok(bounds) = bounds else {
        eprintln!("{usage}");
        return ExitCode::from(2);
    };
    let monitor = Monitor {
        x: bounds[0],
        y: bounds[1],
        width: bounds[2],
        height: bounds[3],
    };
    match import(&PathBuf::from(&args[0]), &PathBuf::from(&args[1]), monitor) {
        Ok(()) => ExitCode::SUCCESS,
        Err(error) => {
            eprintln!("importación: {error}");
            ExitCode::from(1)
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn source_and_previous_output_survive_import_and_retry() {
        let dir = std::env::temp_dir().join(format!("vantare-import-{}", std::process::id()));
        fs::create_dir(&dir).expect("temporal");
        let source = dir.join("profile.json");
        let bytes = include_bytes!("../../../packaging/fixtures/studio-v4.json");
        fs::write(&source, bytes).expect("perfil");
        let output = dir.join("native");
        let monitor = Monitor {
            x: 0.0,
            y: 0.0,
            width: 1920.0,
            height: 1080.0,
        };
        import(&source, &output, monitor).expect("importar");
        let layout = fs::read(output.join("layout.json")).expect("layout");
        assert!(import(&source, &output, monitor).is_err());
        assert_eq!(fs::read(&source).expect("origen"), bytes);
        assert_eq!(
            fs::read(output.join("layout.json")).expect("previo"),
            layout
        );
        assert!(checked_path(&dir.join(".env.json")).is_err());
        fs::remove_dir_all(dir).expect("limpiar");
    }
}
