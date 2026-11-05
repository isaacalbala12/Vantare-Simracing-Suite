use super::diagnostic::{Diagnostic, Module, local_path};
/// Limites por campo del informe. Los comparten el borrador y la recuperacion:
/// si la recuperacion aceptase mas que el envio, un texto recuperado se
/// rechazaria para siempre al preparar el informe y el editor quedaria
/// inservible hasta borrar el fichero a mano.
use super::model::FIELD_LIMITS;
use crate::{files, services::protocol::report_document::Fields};
use serde::{Deserialize, Serialize};
use std::path::Path;

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
    pub fn validate(&self) -> Result<(), files::Error> {
        if self.schema_version != 1
            || self
                .fields
                .iter()
                .zip(FIELD_LIMITS)
                .any(|(field, limit)| *field != clean_field(field, limit))
        {
            return Err(files::Error::InvalidInput(
                "Borrador inválido o fuera de límites".into(),
            ));
        }
        Ok(())
    }
}
/// No se puede anonimizar un nombre arbitrario en prosa con garantías. Por eso
/// la lista blanca exporta solo el módulo y la presencia de los campos privados.
pub fn export_bytes(fields: &Fields, diagnostic: &Diagnostic) -> Result<Vec<u8>, files::Error> {
    #[derive(Serialize)]
    #[serde(rename_all = "camelCase")]
    struct Report<'a> {
        schema_version: u32,
        module: &'a str,
        private_fields_present: [bool; 4],
        private_text: &'static str,
        diagnostic: &'a Diagnostic,
    }
    if !super::model::MODULES
        .iter()
        .any(|(id, _)| *id == fields.module)
        || [
            &fields.action_text,
            &fields.expected_text,
            &fields.observed_text,
            &fields.context_text,
        ]
        .into_iter()
        .zip(FIELD_LIMITS)
        .any(|(text, limit)| *text != clean_field(text, limit))
    {
        return Err("Borrador inválido o fuera de límites".into());
    }
    serde_json::to_vec_pretty(&Report {
        schema_version: 1,
        module: &fields.module,
        private_fields_present: [
            !fields.action_text.is_empty(),
            !fields.expected_text.is_empty(),
            !fields.observed_text.is_empty(),
            !fields.context_text.is_empty(),
        ],
        private_text: "omitted_for_privacy",
        diagnostic,
    })
    .map_err(|_| "No se pudo codificar el informe".into())
}
pub fn export(path: &Path, bytes: &[u8]) -> Result<(), files::Error> {
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
