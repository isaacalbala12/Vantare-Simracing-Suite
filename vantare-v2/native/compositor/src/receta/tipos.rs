//! Tipos del formato v1. Los espacios propios del sistema son mapas de tokens.
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::BTreeMap;

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
pub struct Receta {
    pub receta: u32,
    pub tipo: String,
    pub nombre: String,
    pub modelo: String,
    #[serde(default)]
    pub visible: Option<String>,
    #[serde(default)]
    pub entrada: Option<Aparicion>,
    #[serde(default)]
    pub salida: Option<Aparicion>,
    pub raiz: Nodo,
}
#[derive(Clone, Debug, Default, Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
pub struct Aparicion {
    #[serde(default)]
    pub desde: BTreeMap<String, f32>,
    #[serde(default)]
    pub hacia: BTreeMap<String, f32>,
    #[serde(default)]
    pub transicion: Option<Value>,
}
#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
pub struct Nodo {
    pub tipo: String,
    #[serde(default)]
    pub id: Option<String>,
    #[serde(default)]
    pub estilo: Estilo,
    #[serde(default)]
    pub estados: Vec<Estado>,
    #[serde(default)]
    pub transiciones: BTreeMap<String, Value>,
    #[serde(default)]
    pub capa: bool,
    #[serde(default)]
    pub visible: Option<String>,
    #[serde(default)]
    pub hijos: Vec<Nodo>,
    #[serde(default)]
    pub texto: Option<String>,
    #[serde(default)]
    pub de: Option<String>,
    #[serde(default)]
    pub como: Option<String>,
    #[serde(default)]
    pub clave: Option<String>,
    #[serde(default)]
    pub plantilla: Option<Box<Nodo>>,
    #[serde(default)]
    pub entrada: Option<Aparicion>,
    #[serde(default)]
    pub salida: Option<Aparicion>,
    #[serde(default)]
    pub movimiento: Option<Value>,
    #[serde(default)]
    pub bucle: Option<Bucle>,
}
#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
pub struct Estado {
    pub cuando: String,
    #[serde(default)]
    pub estilo: Estilo,
    #[serde(default)]
    pub bucle: Option<Bucle>,
}
#[derive(Clone, Debug, PartialEq, Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
pub struct Bucle {
    pub propiedad: String,
    pub valores: Vec<f32>,
    pub duracion: f64,
    #[serde(default)]
    pub cuando: Option<String>,
}
/// Valores no resueltos: se validan contra sistema y contrato antes de crear la escena.
#[derive(Clone, Debug, Default, Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
pub struct Estilo {
    #[serde(default)]
    pub ancho: Option<Value>,
    #[serde(default)]
    pub alto: Option<Value>,
    #[serde(default)]
    pub min_ancho: Option<Value>,
    #[serde(default)]
    pub max_ancho: Option<Value>,
    #[serde(default)]
    pub direccion: Option<String>,
    #[serde(default)]
    pub alinear: Option<String>,
    #[serde(default)]
    pub justificar: Option<String>,
    #[serde(default)]
    pub hueco: Option<Value>,
    #[serde(default)]
    pub relleno: Option<Value>,
    #[serde(default)]
    pub crecer: Option<f32>,
    #[serde(default)]
    pub encoger: Option<f32>,
    #[serde(default)]
    pub posicion: Option<String>,
    #[serde(default)]
    pub arriba: Option<Value>,
    #[serde(default)]
    pub izquierda: Option<Value>,
    #[serde(default)]
    pub derecha: Option<Value>,
    #[serde(default)]
    pub abajo: Option<Value>,
    #[serde(default)]
    pub fondo: Option<Value>,
    #[serde(default)]
    pub borde: Option<Value>,
    #[serde(default)]
    pub radio: Option<Value>,
    #[serde(default)]
    pub sombra: Option<Value>,
    #[serde(default)]
    pub opacidad: Option<Value>,
    #[serde(default)]
    pub tipo: Option<Value>,
    #[serde(default)]
    pub color: Option<Value>,
    #[serde(default)]
    pub alinear_texto: Option<String>,
    #[serde(default)]
    pub x: Option<Value>,
    #[serde(default)]
    pub y: Option<Value>,
    #[serde(default)]
    pub escala: Option<Value>,
    #[serde(default)]
    pub giro: Option<Value>,
}
impl Estilo {
    pub(crate) fn valores(&self) -> BTreeMap<String, Value> {
        match serde_json::to_value(self) {
            Ok(Value::Object(m)) => m.into_iter().filter(|(_, v)| !v.is_null()).collect(),
            _ => BTreeMap::new(),
        }
    }
}
#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
pub struct Contrato {
    pub modelo: String,
    pub campos: BTreeMap<String, Campo>,
}
#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(untagged)]
pub enum Campo {
    Simple(String),
    Enumerado(Enumerado),
    Lista(Lista),
}
#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
pub struct Enumerado {
    pub r#enum: Vec<String>,
}
#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
pub struct Lista {
    pub lista: BTreeMap<String, Campo>,
}
/// Los namespaces propios son deliberadamente abiertos; sus hojas se validan como medidas.
#[derive(Clone, Debug, Deserialize, Serialize)]
pub struct Sistema {
    pub sistema: u32,
    pub nombre: String,
    pub fuentes: Vec<String>,
    #[serde(default)]
    pub color: BTreeMap<String, Value>,
    #[serde(default)]
    pub tipo: BTreeMap<String, Value>,
    #[serde(default)]
    pub medida: BTreeMap<String, Value>,
    #[serde(default)]
    pub mov: BTreeMap<String, Value>,
    #[serde(default)]
    pub efecto: BTreeMap<String, Value>,
    #[serde(flatten)]
    pub propios: BTreeMap<String, Value>,
}
impl Sistema {
    pub fn token(&self, ruta: &str) -> Option<Value> {
        let mut ruta = ruta.strip_prefix('$')?.split('.');
        let espacio = ruta.next()?;
        let mapa = match espacio {
            "color" => &self.color,
            "tipo" => &self.tipo,
            "medida" => &self.medida,
            "mov" => &self.mov,
            "efecto" => &self.efecto,
            otro => return recorrer(self.propios.get(otro)?, ruta),
        };
        recorrer(mapa.get(ruta.next()?)?, ruta)
    }
    pub fn resolver(&self, valor: &Value) -> Option<Value> {
        let mut actual = valor.clone();
        let mut vistos = std::collections::BTreeSet::new();
        while let Some(token) = actual.as_str().filter(|s| s.starts_with('$')) {
            if !vistos.insert(token.to_owned()) {
                return None;
            }
            actual = self.token(token)?;
        }
        Some(actual)
    }
}
fn recorrer<'a>(valor: &Value, ruta: impl Iterator<Item = &'a str>) -> Option<Value> {
    let mut actual = valor;
    for parte in ruta {
        actual = actual.get(parte)?;
    }
    Some(actual.clone())
}
