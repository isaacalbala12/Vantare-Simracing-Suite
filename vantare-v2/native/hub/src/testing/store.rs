use super::diagnostic::{Diagnostic, Module, local_path};
use crate::files;
use serde::{Deserialize, Serialize};
use std::{
    fs,
    path::{Path, PathBuf},
};

const LIMIT: u64 = 16 * 1024;
pub const LABELS: [&str; 4] = [
    "Qué estabas haciendo",
    "Qué esperabas",
    "Qué ocurrió",
    "Contexto adicional",
];
const FIELD_LIMITS: [usize; 4] = [2048, 2048, 2048, 4096];

#[derive(Clone, Debug, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Draft {
    pub schema_version: u32,
    pub module: Module,
    /// Texto privado, editable y recuperable; NO forma parte del diagnóstico/exportación.
    pub fields: [String; 4],
}
impl Draft {
    pub fn new() -> Self {
        Self {
            schema_version: 1,
            ..Self::default()
        }
    }
    pub fn validate(&self) -> Result<(), String> {
        if self.schema_version != 1
            || self.fields.iter().zip(FIELD_LIMITS).any(|(field, limit)| {
                field.len() > limit
                    || field
                        .chars()
                        .any(|c| c.is_control() && !matches!(c, '\n' | '\t'))
            })
        {
            return Err("Borrador inválido o fuera de límites".into());
        }
        Ok(())
    }
}
pub struct Store {
    pub draft: Draft,
    path: PathBuf,
    saved: Option<Vec<u8>>,
}
impl Store {
    pub fn new(data: &Path) -> Self {
        Self {
            draft: Draft::new(),
            path: data.join("testing-center/report-draft.json"),
            saved: None,
        }
    }
    pub fn reload(&mut self) -> Result<(), String> {
        if !local_path(&self.path) {
            return Err("El borrador requiere una ruta local".into());
        }
        let bytes = match fs::symlink_metadata(&self.path) {
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => {
                self.draft = Draft::new();
                self.saved = None;
                return Ok(());
            }
            Ok(info) if info.is_file() && !info.file_type().is_symlink() => {
                files::read(&self.path, LIMIT)?
            }
            _ => return Err("No se pudo leer el borrador local".into()),
        };
        let draft: Draft = serde_json::from_slice(&bytes)
            .map_err(|_| "Borrador inválido; se conserva el archivo")?;
        draft.validate()?;
        self.draft = draft;
        self.saved = Some(bytes);
        Ok(())
    }
    pub fn dirty(&self) -> bool {
        self.saved
            .as_ref()
            .map_or(self.draft != Draft::new(), |bytes| {
                serde_json::from_slice::<Draft>(bytes).map_or(true, |draft| draft != self.draft)
            })
    }
    pub fn save(&mut self) -> Result<(), String> {
        self.draft.validate()?;
        if !local_path(&self.path) {
            return Err("El borrador requiere una ruta local".into());
        }
        let bytes = serde_json::to_vec_pretty(&self.draft)
            .map_err(|_| "No se pudo codificar el borrador")?;
        files::save_with_limit(&self.path, &bytes, self.saved.as_deref(), LIMIT)?;
        self.saved = Some(bytes);
        Ok(())
    }
}

/// No se puede anonimizar un nombre arbitrario en prosa con garantías. Por eso
/// la lista blanca exporta solo el módulo y la presencia de los campos privados.
pub fn export_bytes(draft: &Draft, diagnostic: &Diagnostic) -> Result<Vec<u8>, String> {
    #[derive(Serialize)]
    #[serde(rename_all = "camelCase")]
    struct Report<'a> {
        schema_version: u32,
        module: Module,
        private_fields_present: [bool; 4],
        private_text: &'static str,
        diagnostic: &'a Diagnostic,
    }
    draft.validate()?;
    serde_json::to_vec_pretty(&Report {
        schema_version: 1,
        module: draft.module,
        private_fields_present: std::array::from_fn(|i| !draft.fields[i].is_empty()),
        private_text: "omitted_for_privacy",
        diagnostic,
    })
    .map_err(|_| "No se pudo codificar el informe".into())
}
pub fn export(path: &Path, bytes: &[u8]) -> Result<(), String> {
    if !local_path(path)
        || path
            .extension()
            .is_none_or(|ext| !ext.eq_ignore_ascii_case("json"))
    {
        return Err("Elige un archivo JSON local".into());
    }
    // Crear exclusivamente: un destino ya existente nunca se sobrescribe.
    files::save_with_limit(path, bytes, None, 64 * 1024)
}
