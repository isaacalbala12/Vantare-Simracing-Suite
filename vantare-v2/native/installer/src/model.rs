use serde::{Deserialize, Serialize};
use std::path::PathBuf;

#[derive(Clone, Copy, Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum Mode {
    Install,
    Update,
    Repair,
    Remove,
    Auto,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Screen {
    Welcome,
    Installing,
    Done,
    Error,
    Installed,
    Uninstall,
    Uninstalled,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
pub struct Info {
    pub root: PathBuf,
    pub version: String,
    pub installed_version: Option<String>,
    pub data_path: PathBuf,
    pub desktop: bool,
    pub autostart: bool,
    pub size: u64,
    #[serde(default)]
    pub reduced_motion: bool,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Progress {
    pub step: String,
    pub percent: u8,
    pub done: u64,
    pub total: u64,
    pub can_cancel: bool,
}

pub fn version(value: &str) -> Result<[u16; 3], String> {
    let parts = value
        .split('.')
        .map(|part| {
            if part.is_empty() || (part.len() > 1 && part.starts_with('0')) {
                return Err("Versión inválida".to_owned());
            }
            part.parse::<u16>()
                .map_err(|_| "Versión inválida".to_owned())
        })
        .collect::<Result<Vec<_>, _>>()?;
    parts
        .try_into()
        .map_err(|_| "Versión debe tener tres componentes".into())
}

impl Info {
    pub fn allows(&self, mode: Mode) -> bool {
        match (
            version(&self.version),
            self.installed_version.as_deref().map(version),
        ) {
            (Ok(next), Some(Ok(current))) => match mode {
                Mode::Update => next > current,
                Mode::Repair => next == current,
                _ => false,
            },
            (Ok(_), None) => mode == Mode::Install,
            _ => false,
        }
    }
}

pub fn error_text(code: u8) -> (&'static str, &'static str) {
    match code {
        2 => (
            "Cierra Vantare para continuar",
            "Vantare sigue abierto y no se pueden cambiar sus archivos mientras se usa. Si estás en carrera, termina primero.",
        ),
        3 => (
            "Necesitas un instalador más reciente",
            "Ya tienes una versión más reciente de Vantare o de tus datos. Descarga el instalador adecuado. Tus datos se conservan.",
        ),
        4 => (
            "Comprueba el arranque anterior",
            "Abre Vantare y ciérralo antes de volver a instalar. Hay un arranque pendiente de comprobar. Tus datos se conservan.",
        ),
        _ => (
            "No se pudo completar la operación",
            "Consulta los detalles y vuelve a intentarlo. Tus datos se conservan.",
        ),
    }
}
