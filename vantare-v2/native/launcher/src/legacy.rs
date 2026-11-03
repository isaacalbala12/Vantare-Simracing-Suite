//! Datos históricos guardados; no busca ni importa archivos Wails.
//! Conserva el formato y la procedencia de los perfiles existentes.
use serde::{Deserialize, Serialize};
use std::{collections::BTreeMap, path::PathBuf};

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Import {
    pub source: PathBuf,
    pub launcher: BTreeMap<String, serde_json::Value>,
}

