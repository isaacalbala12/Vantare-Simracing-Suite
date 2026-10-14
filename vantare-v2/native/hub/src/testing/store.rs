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
/// Limites por campo del informe. Los comparten el borrador y la recuperacion:
/// si la recuperacion aceptase mas que el envio, un texto recuperado se
/// rechazaria para siempre al preparar el informe y el editor quedaria
/// inservible hasta borrar el fichero a mano.
pub(super) const FIELD_LIMITS: [usize; 4] = [2048, 2048, 2048, 4096];

/// Limpia un campo visible del informe: quita las marcas invisibles y los
/// controles, y recorta al limite del envio.
///
/// Conserva `\n` y `\t` porque el usuario los escribe a proposito; por eso no
/// reutiliza `sanitize_display`, que los convierte en espacio a proposito para
/// los nombres de una sola linea.
pub(super) fn clean_field(text: &str, limit: usize) -> String {
    let mut out = String::with_capacity(text.len().min(limit));
    for ch in text.chars() {
        match ch {
            '\n' | '\t' => out.push(ch),
            _ if vantare_domain::text::is_invisible(ch) => {}
            c if c.is_control() => out.push(' '),
            _ => out.push(ch),
        }
    }
    if out.len() <= limit {
        return out;
    }
    let mut end = limit;
    while end > 0 && !out.is_char_boundary(end) {
        end -= 1;
    }
    out.truncate(end);
    out
}

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
            || self
                .fields
                .iter()
                .zip(FIELD_LIMITS)
                .any(|(field, limit)| *field != clean_field(field, limit))
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn cleaning_a_report_field_keeps_formatting_and_drops_invisibles() {
        // Los saltos de linea y tabuladores que el usuario escribe se conservan.
        assert_eq!(clean_field("uno\ndos\ttres", 4096), "uno\ndos\ttres");
        // Las marcas invisibles se quitan: son las que permiten que lo que se
        // lee no sea lo que hay.
        assert_eq!(clean_field("Nombre\u{202e}real", 4096), "Nombrereal");
        assert_eq!(clean_field("a\u{200b}b\u{feff}c", 4096), "abc");
        // Un control se sustituye por espacio, no se elimina.
        assert_eq!(clean_field("a\u{1b}b", 4096), "a b");
        // Se recorta al limite del envio sin partir un caracter UTF-8.
        let largo = "\u{f1}".repeat(3000);
        let limpio = clean_field(&largo, 2048);
        assert!(limpio.len() <= 2048, "debe caber en el limite del envio");
        assert!(limpio.chars().all(|c| c == '\u{f1}'));
        // Limpiar es idempotente: lo limpio ya es valido para el envio.
        assert_eq!(clean_field(&limpio, 2048), limpio);
    }
}
