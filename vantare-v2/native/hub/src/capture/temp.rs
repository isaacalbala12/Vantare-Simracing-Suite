//! Only the current process' CLI-generated capture data is disposable.
use std::{
    fs,
    path::{Path, PathBuf},
};

pub(super) struct Roots(Vec<PathBuf>);

impl Roots {
    pub(super) fn new(data_dirs: impl Iterator<Item = PathBuf>) -> Self {
        let base = std::env::temp_dir().join("vantare-hub-parity");
        let prefix = format!("{}-", std::process::id());
        let roots = data_dirs
            .filter_map(|data| {
                let root = data.parent()?;
                (data.file_name()? == "data"
                    && root.parent() == Some(base.as_path())
                    && root.file_name()?.to_str()?.starts_with(&prefix))
                .then(|| root.to_path_buf())
            })
            .collect();
        Self(roots)
    }

    pub(super) fn cleanup(&mut self) -> Result<(), String> {
        let mut errors = Vec::new();
        for root in self.0.drain(..) {
            if let Err(error) = remove_owned(&root) {
                errors.push(format!("limpiar datos QA {}: {error}", root.display()));
            }
        }
        if errors.is_empty() {
            Ok(())
        } else {
            Err(errors.join("; "))
        }
    }
}

fn remove_owned(root: &Path) -> Result<(), String> {
    let actual = match root.canonicalize() {
        Ok(path) => path,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(()),
        Err(error) => return Err(error.to_string()),
    };
    let base = std::env::temp_dir()
        .join("vantare-hub-parity")
        .canonicalize()
        .map_err(|error| error.to_string())?;
    let expected = base.join(root.file_name().ok_or("raíz QA sin nombre")?);
    if actual != expected {
        return Err("la raíz QA resuelta queda fuera de su destino propio".into());
    }
    fs::remove_dir_all(actual).map_err(|error| error.to_string())
}

impl Drop for Roots {
    fn drop(&mut self) {
        if let Err(error) = self.cleanup() {
            eprintln!("{error}");
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn capture_data_cleanup_runs_on_error_and_preserves_unrelated_data() {
        let base = std::env::temp_dir();
        let root = base
            .join("vantare-hub-parity")
            .join(format!("{}-cleanup-test", std::process::id()));
        let data = root.join("data");
        fs::create_dir_all(&data).expect("datos de escena");
        fs::write(data.join("state.json"), b"QA").expect("estado");
        let foreign = base.join(format!("capture-foreign-{}", std::process::id()));
        fs::create_dir_all(&foreign).expect("datos ajenos");
        fs::write(foreign.join("keep"), b"keep").expect("conservar");
        let result = (|| -> Result<(), ()> {
            let _roots = Roots::new([data, foreign.clone()].into_iter());
            Err(())
        })();
        assert!(result.is_err());
        assert!(!root.exists(), "incluso un error retira la escena");
        assert_eq!(
            fs::read(foreign.join("keep")).expect("ajeno intacto"),
            b"keep"
        );
        fs::remove_file(foreign.join("keep")).expect("limpiar archivo de prueba");
        fs::remove_dir(foreign).expect("limpiar directorio de prueba");
    }
}
