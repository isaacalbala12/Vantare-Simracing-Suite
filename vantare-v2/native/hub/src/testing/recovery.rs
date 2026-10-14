//! Recuperación local del texto visible. No contiene consentimiento ni permisos de envío.
use super::{empty_fields, model::MODULES};
use crate::{files, services::protocol::report_document::Fields};
use serde::{Deserialize, Serialize};
use std::{
    fs,
    path::{Path, PathBuf},
};

// Input limita cada campo a 16 KiB. JSON puede escapar cada byte hasta seis veces.
const LIMIT: u64 = 512 * 1024;

#[derive(Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
struct Document {
    version: u32,
    fields: Fields,
}

pub(crate) struct Recovery {
    pub(crate) fields: Fields,
    path: PathBuf,
    saved: Option<Vec<u8>>,
}

/// Un campo es valido si limpiarlo no lo cambia, con los MISMOS limites que el
/// envio. Antes se aceptaban 16 KiB por campo y el envio los rechazaba, asi que
/// un borrador recuperado dejaba el editor inservible hasta borrar el fichero
/// a mano.
fn validate(fields: &Fields) -> Result<(), String> {
    let out_of_bounds = [
        &fields.action_text,
        &fields.expected_text,
        &fields.observed_text,
        &fields.context_text,
    ]
    .into_iter()
    .zip(super::store::FIELD_LIMITS)
    .any(|(field, limit)| *field != super::store::clean_field(field, limit));
    if out_of_bounds || !MODULES.iter().any(|(key, _)| *key == fields.module) {
        return Err("Recuperación del reporte fuera de límites; se conserva el archivo".into());
    }
    Ok(())
}

/// Limpia los campos recuperados con la MISMA regla que el envio.
///
/// Antes se aceptaban 16 KiB por campo y no se filtraba nada: un borrador
/// recuperado se enviaba y el envio lo rechazaba para siempre, dejando el
/// editor inservible hasta borrar el fichero a mano. Y las marcas invisibles
/// llegaban al preview que el usuario aprueba y al informe que leen el triage
/// y los agentes con escritura en el repositorio.
fn clean(fields: &mut Fields) {
    for (field, limit) in [
        &mut fields.action_text,
        &mut fields.expected_text,
        &mut fields.observed_text,
        &mut fields.context_text,
    ]
    .into_iter()
    .zip(super::store::FIELD_LIMITS)
    {
        *field = super::store::clean_field(field, limit);
    }
}

impl Recovery {
    pub(crate) fn load(data: &Path) -> Result<Self, String> {
        let path = data.join("testing-center/editor-draft.json");
        if !super::diagnostic::local_path(&path) {
            return Err("La recuperación del reporte requiere una ruta local".into());
        }
        let saved = match fs::symlink_metadata(&path) {
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => None,
            Ok(info) if info.is_file() && !info.file_type().is_symlink() => {
                Some(files::read(&path, LIMIT)?)
            }
            _ => {
                return Err(
                    "No se pudo leer la recuperación del reporte; se conserva el archivo".into(),
                );
            }
        };
        let fields = if let Some(bytes) = &saved {
            let document: Document = serde_json::from_slice(bytes)
                .map_err(|_| "Recuperación del reporte inválida; se conserva el archivo")?;
            if document.version != 1 {
                return Err("Versión de recuperación desconocida; se conserva el archivo".into());
            }
            // Se limpia ANTES de validar: limpiar es justo lo que hace que el
            // contenido quepa en los limites del envio. Validar primero
            // rechazaba el borrador grande y dejaba al usuario sin su texto.
            let mut fields = document.fields;
            clean(&mut fields);
            validate(&fields)?;
            fields
        } else {
            empty_fields()
        };
        Ok(Self {
            fields,
            path,
            saved,
        })
    }

    pub(crate) fn save(&mut self, fields: Fields) -> Result<(), String> {
        // Al guardar se VALIDA, no se limpia: truncar en silencio lo que el
        // usuario acaba de escribir seria perder su texto sin avisar.
        if fields == self.fields {
            return Ok(());
        }
        validate(&fields)?;
        let bytes = serde_json::to_vec(&Document {
            version: 1,
            fields: fields.clone(),
        })
        .map_err(|_| "No se pudo codificar la recuperación del reporte")?;
        files::save_with_limit(&self.path, &bytes, self.saved.as_deref(), LIMIT)?;
        self.fields = fields;
        self.saved = Some(bytes);
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    fn directory(name: &str) -> PathBuf {
        let path =
            std::env::temp_dir().join(format!("hub-report-recovery-{}-{name}", std::process::id()));
        fs::create_dir_all(&path).expect("directorio propio");
        path
    }
    #[test]
    fn incomplete_private_text_survives_an_offline_close_and_reopen_without_consent() {
        let path = directory("reopen");
        let fields = Fields {
            action_text: "ñ\n文 🚗".into(),
            expected_text: "a".into(),
            observed_text: String::new(),
            context_text: "x".repeat(super::super::store::FIELD_LIMITS[3]),
            module: "strategy".into(),
        };
        let mut recovery = Recovery::load(&path).expect("sin archivo");
        recovery
            .save(fields.clone())
            .expect("guardar incompleto, no enviar");
        drop(recovery);
        let mut reopened = Recovery::load(&path).expect("recuperar");
        assert_eq!(reopened.fields, fields);
        let json: serde_json::Value =
            serde_json::from_slice(&files::read(&reopened.path, LIMIT).expect("archivo"))
                .expect("json");
        assert_eq!(json.as_object().expect("objeto").len(), 2);
        assert!(json.get("consent").is_none());
        reopened
            .save(empty_fields())
            .expect("limpiar tras descarte confirmado");
        assert_eq!(
            Recovery::load(&path).expect("recargar").fields,
            empty_fields()
        );
        fs::remove_dir_all(path).expect("limpiar propio");
    }
    #[test]
    fn conflict_preserves_external_file_and_unsaved_fields() {
        let path = directory("conflict");
        let mut recovery = Recovery::load(&path).expect("nuevo");
        let original = Fields {
            action_text: "original".into(),
            ..empty_fields()
        };
        recovery.save(original.clone()).expect("guardar");
        fs::write(&recovery.path, b"external").expect("edición externa");
        assert!(
            recovery
                .save(Fields {
                    action_text: "nuevo".into(),
                    ..empty_fields()
                })
                .is_err()
        );
        assert_eq!(recovery.fields, original);
        assert_eq!(fs::read(&recovery.path).expect("leer"), b"external");
        fs::remove_dir_all(path).expect("limpiar propio");
    }
    #[test]
    fn malformed_future_and_oversized_documents_are_never_replaced() {
        let path = directory("invalid");
        fs::create_dir_all(path.join("testing-center")).expect("subdirectorio");
        let file = path.join("testing-center/editor-draft.json");
        for bytes in [
            b"invalid".to_vec(),
            serde_json::to_vec(&Document {
                version: 2,
                fields: empty_fields(),
            })
            .expect("json"),
            vec![b' '; usize::try_from(LIMIT).expect("límite fijo") + 1],
        ] {
            fs::write(&file, &bytes).expect("caso inválido");
            assert!(Recovery::load(&path).is_err());
            assert_eq!(fs::read(&file).expect("leer intacto"), bytes);
        }
        fs::remove_file(&file).expect("retirar fixture propia");
        let mut recovery = Recovery::load(&path).expect("nuevo");
        assert!(
            recovery
                .save(Fields {
                    action_text: "x".repeat(super::super::store::FIELD_LIMITS[0] + 1),
                    ..empty_fields()
                })
                .is_err()
        );
        assert!(!file.exists());
        assert_eq!(recovery.fields, empty_fields());
        fs::remove_dir_all(path).expect("limpiar propio");
    }

    /// Un borrador de 16 KiB por campo dejaba el editor inservible: se
    /// recuperaba, el envio lo rechazaba con `TooLarge` para siempre, y la unica
    /// salida era borrar el fichero a mano. Ahora se limpia al cargar.
    #[test]
    fn an_oversized_or_invisible_draft_is_cleaned_instead_of_wedging_the_editor() {
        let path = directory("clean");
        let file = path.join("testing-center/editor-draft.json");
        fs::create_dir_all(file.parent().expect("padre")).expect("directorio");
        let fields = Fields {
            // 16 KiB, como aceptaba el lector anterior, con una marca invisible
            // y un salto de linea que SI es legitimo.
            action_text: format!("a\u{202e}b\n{}", "x".repeat(16 * 1024)),
            module: "strategy".into(),
            ..empty_fields()
        };
        fs::write(
            &file,
            serde_json::to_vec(&Document { version: 1, fields }).expect("json"),
        )
        .expect("escribir");
        let recovery = Recovery::load(&path).expect("debe recuperar, no quedarse muerto");
        assert!(
            recovery.fields.action_text.len() <= super::super::store::FIELD_LIMITS[0],
            "debe caber en el limite del envio"
        );
        assert!(
            !recovery.fields.action_text.contains('\u{202e}'),
            "la marca invisible se quita"
        );
        assert!(
            recovery.fields.action_text.contains('\n'),
            "el salto de linea se conserva"
        );
        fs::remove_dir_all(path).expect("limpiar propio");
    }
}
