//! Programa cerrado: solo el cargador puede construirlo; no contiene JSON ejecutable.
use super::{Contrato, Diagnostico, Receta, Sistema};
use crate::escena::{
    ErrorModelo,
    capas::{Alineacion, Color, Fuente, Pintura, Propiedad},
};
use serde::Deserialize;
use serde_json::Value;
use std::{rc::Rc, sync::Arc};

/// La carga es la única entrada: no se puede deserializar un programa sin validar.
/// ```compile_fail
/// let _: vantare_compositor::receta::Programa = serde_json::from_str("{}").unwrap();
/// ```
#[derive(Clone, Debug)]
pub struct Programa {
    pub(crate) datos: Rc<DatosPrograma>,
}
#[derive(Clone, Debug)]
pub(crate) struct DatosPrograma {
    pub raiz: NodoPrograma,
    pub visible: Option<Condicion>,
    pub cambio_sistema: Transicion,
    pub contrato: ContratoPrograma,
    pub fuente: Arc<Receta>,
    pub sistema: Sistema,
    pub contrato_fuente: Contrato,
    pub fuentes: Vec<String>,
    pub archivos: [String; 3],
}
impl Programa {
    pub fn con_sistema(&self, sistema: Sistema) -> Result<Self, Vec<Diagnostico>> {
        let mut archivos = self.datos.archivos.clone();
        archivos[1] = match &sistema.origen {
            Some(f) => f.clone(),
            None => "<sistema en memoria>".into(),
        };
        super::validacion::recompilar(
            self.datos.fuente.as_ref().clone(),
            sistema,
            self.datos.contrato_fuente.clone(),
            &self.datos.fuentes,
            &archivos,
        )
    }
    pub(crate) fn con_receta(&self, otra: Self) -> Result<Self, Vec<Diagnostico>> {
        let datos = otra.datos;
        super::validacion::recompilar(
            datos.fuente.as_ref().clone(),
            self.datos.sistema.clone(),
            datos.contrato_fuente.clone(),
            &self.datos.fuentes,
            &[
                datos.archivos[0].clone(),
                self.datos.archivos[1].clone(),
                datos.archivos[2].clone(),
            ],
        )
    }
}
#[derive(Clone, Copy, Debug, PartialEq)]
pub enum Transicion {
    Bezier {
        duracion: f32,
        retardo: f32,
        puntos: [f32; 4],
    },
    Muelle {
        rigidez: f32,
        amortiguacion: f32,
    },
}
impl Transicion {
    pub const PREDETERMINADA: Self = Self::Bezier {
        duracion: 0.18,
        retardo: 0.0,
        puntos: [0.0, 0.0, 0.58, 1.0],
    };
}
#[derive(Clone, Debug, PartialEq)]
pub(crate) struct Ruta {
    pub ambito: Option<usize>,
    pub segmentos: Arc<[String]>,
    pub enumerado: Arc<[String]>,
}
pub(crate) struct Contexto<'a> {
    pub raiz: &'a Value,
    pub ambitos: Vec<&'a Value>,
}
impl Ruta {
    pub fn leer<'a>(&self, c: &Contexto<'a>, p: &str) -> Result<&'a Value, ErrorModelo> {
        let mut valor = match self.ambito {
            None => c.raiz,
            Some(i) => *c.ambitos.get(i).ok_or_else(|| ErrorModelo::enlace(p))?,
        };
        for segmento in self.segmentos.iter() {
            valor = valor.get(segmento).ok_or_else(|| ErrorModelo::enlace(p))?;
        }
        Ok(valor)
    }
    pub fn indice(&self, c: &Contexto<'_>, p: &str) -> Result<usize, ErrorModelo> {
        let s = self
            .leer(c, p)?
            .as_str()
            .ok_or_else(|| ErrorModelo::enlace(p))?;
        self.enumerado
            .iter()
            .position(|v| v == s)
            .ok_or_else(|| ErrorModelo::enlace(p))
    }
}
#[derive(Clone, Debug, PartialEq)]
pub(crate) enum Condicion {
    Verdadero(Ruta),
    Falso(Ruta),
    Igual(Ruta, usize),
}
impl Condicion {
    pub fn evaluar(&self, c: &Contexto<'_>, p: &str) -> Result<bool, ErrorModelo> {
        match self {
            Self::Verdadero(r) => r
                .leer(c, p)?
                .as_bool()
                .ok_or_else(|| ErrorModelo::enlace(p)),
            Self::Falso(r) => r
                .leer(c, p)?
                .as_bool()
                .map(|v| !v)
                .ok_or_else(|| ErrorModelo::enlace(p)),
            Self::Igual(r, i) => Ok(r.indice(c, p)? == *i),
        }
    }
}
#[derive(Clone, Debug)]
pub(crate) enum Eleccion<T> {
    Fija(T),
    Enumerada { ruta: Ruta, valores: Arc<[T]> },
}
impl<T: Clone> Eleccion<T> {
    pub fn evaluar(&self, c: &Contexto<'_>, p: &str) -> Result<T, ErrorModelo> {
        match self {
            Self::Fija(v) => Ok(v.clone()),
            Self::Enumerada { ruta, valores } => valores
                .get(ruta.indice(c, p)?)
                .cloned()
                .ok_or_else(|| ErrorModelo::enlace(p)),
        }
    }
}
#[derive(Clone, Debug)]
pub(crate) enum Numero {
    Fijo(f32),
    Modelo(Ruta),
}
impl Numero {
    pub fn evaluar(&self, c: &Contexto<'_>, p: &str) -> Result<f32, ErrorModelo> {
        match self {
            Self::Fijo(v) => Ok(*v),
            Self::Modelo(r) => numero_modelo(r.leer(c, p)?, p),
        }
    }
}
pub(crate) fn numero_modelo(v: &Value, p: &str) -> Result<f32, ErrorModelo> {
    v.as_f64()
        .filter(|n| n.is_finite() && n.abs() <= 1_000_000.0)
        .ok_or_else(|| ErrorModelo::enlace(p))?;
    let convertido = f32::deserialize(v).map_err(|_| ErrorModelo::enlace(p))?;
    if convertido.is_finite() {
        Ok(convertido)
    } else {
        Err(ErrorModelo::enlace(p))
    }
}
#[derive(Clone, Debug)]
pub(crate) enum Fragmento {
    Literal(String),
    Campo(Ruta),
}
#[derive(Clone, Debug)]
pub(crate) struct Texto {
    pub fragmentos: Vec<Fragmento>,
    pub fuente: Eleccion<Fuente>,
    pub color: Eleccion<Color>,
}
impl Texto {
    pub fn evaluar(&self, c: &Contexto<'_>, p: &str) -> Result<String, ErrorModelo> {
        let mut salida = String::new();
        for f in &self.fragmentos {
            match f {
                Fragmento::Literal(t) => salida.push_str(t),
                Fragmento::Campo(r) => match r.leer(c, p)? {
                    Value::String(s) => salida.push_str(s),
                    Value::Number(n) => salida.push_str(&n.to_string()),
                    Value::Bool(v) => salida.push_str(if *v { "true" } else { "false" }),
                    _ => return Err(ErrorModelo::enlace(p)),
                },
            }
            if salida.chars().count() > 256 {
                return Err(ErrorModelo::limite(p));
            }
        }
        Ok(salida)
    }
}
#[derive(Clone, Copy, Debug)]
pub(crate) struct Sombra {
    pub color: Color,
    pub desenfoque: f32,
    pub desplazamiento: (f32, f32),
}
#[derive(Clone, Debug)]
pub(crate) struct EstiloBase {
    pub layout: taffy::Style,
    pub fondo: Option<Eleccion<Pintura>>,
    pub borde: Option<(f32, Eleccion<Color>)>,
    pub radios: [f32; 4],
    pub sombra: Option<Sombra>,
    pub valores: [Numero; 5],
    pub fuente: Option<Eleccion<Fuente>>,
    pub color: Option<Eleccion<Color>>,
    pub alineacion: Alineacion,
}
impl Default for EstiloBase {
    fn default() -> Self {
        Self {
            layout: taffy::Style {
                flex_direction: taffy::FlexDirection::Column,
                align_items: taffy::AlignItems::STRETCH,
                ..taffy::Style::default()
            },
            fondo: None,
            borde: None,
            radios: [0.0; 4],
            sombra: None,
            valores: [
                Numero::Fijo(1.0),
                Numero::Fijo(0.0),
                Numero::Fijo(0.0),
                Numero::Fijo(1.0),
                Numero::Fijo(0.0),
            ],
            fuente: None,
            color: None,
            alineacion: Alineacion::Inicio,
        }
    }
}
#[derive(Clone, Debug)]
pub(crate) enum Cambio {
    Ancho(taffy::Dimension),
    Alto(taffy::Dimension),
    MinAncho(taffy::LengthPercentageAuto),
    MaxAncho(taffy::LengthPercentageAuto),
    Direccion(taffy::FlexDirection),
    Alinear(taffy::AlignItems),
    Justificar(taffy::JustifyContent),
    Hueco(f32),
    Relleno([f32; 4]),
    Crecer(f32),
    Encoger(f32),
    Posicion(taffy::Position),
    Inset(usize, taffy::LengthPercentageAuto),
    Fondo(Eleccion<Pintura>),
    Borde(f32, Eleccion<Color>),
    Radios([f32; 4]),
    Sombra(Sombra),
    Compuesta(usize, Numero),
    Fuente(Eleccion<Fuente>),
    Color(Eleccion<Color>),
    AlinearTexto(Alineacion),
}
impl Cambio {
    pub fn aplicar(&self, e: &mut EstiloBase) {
        use Cambio as C;
        match self {
            C::Ancho(v) => e.layout.size.width = *v,
            C::Alto(v) => e.layout.size.height = *v,
            C::MinAncho(v) => e.layout.min_size.width = *v,
            C::MaxAncho(v) => e.layout.max_size.width = *v,
            C::Direccion(v) => e.layout.flex_direction = *v,
            C::Alinear(v) => e.layout.align_items = *v,
            C::Justificar(v) => e.layout.justify_content = *v,
            C::Hueco(v) => {
                e.layout.gap = taffy::Size {
                    width: taffy::LengthPercentage::length(*v),
                    height: taffy::LengthPercentage::length(*v),
                }
            }
            C::Relleno(v) => {
                e.layout.padding = taffy::Rect {
                    top: taffy::LengthPercentage::length(v[0]),
                    right: taffy::LengthPercentage::length(v[1]),
                    bottom: taffy::LengthPercentage::length(v[2]),
                    left: taffy::LengthPercentage::length(v[3]),
                }
            }
            C::Crecer(v) => e.layout.flex_grow = *v,
            C::Encoger(v) => e.layout.flex_shrink = *v,
            C::Posicion(v) => e.layout.position = *v,
            C::Inset(i, v) => match i {
                0 => e.layout.inset.top = *v,
                1 => e.layout.inset.right = *v,
                2 => e.layout.inset.bottom = *v,
                _ => e.layout.inset.left = *v,
            },
            C::Fondo(v) => e.fondo = Some(v.clone()),
            C::Borde(a, v) => e.borde = Some((*a, v.clone())),
            C::Radios(v) => e.radios = *v,
            C::Sombra(v) => e.sombra = Some(*v),
            C::Compuesta(i, v) => e.valores[*i] = v.clone(),
            C::Fuente(v) => e.fuente = Some(v.clone()),
            C::Color(v) => e.color = Some(v.clone()),
            C::AlinearTexto(v) => e.alineacion = *v,
        }
    }
}
#[derive(Clone, Debug)]
pub(crate) struct Estado {
    pub condicion: Condicion,
    pub cambios: Vec<Cambio>,
    pub bucle: Option<Arc<Bucle>>,
}
#[derive(Clone, Debug, PartialEq)]
pub(crate) struct Bucle {
    pub propiedad: usize,
    pub valores: Arc<[f32]>,
    pub duracion: f64,
    pub cuando: Option<Condicion>,
}
#[derive(Clone, Debug)]
pub(crate) struct Aparicion {
    pub valores: [Option<f32>; 5],
    pub transicion: Transicion,
}
#[derive(Clone, Debug, Default)]
pub(crate) struct Pintadas {
    pub fondo: Option<Transicion>,
    pub color: Option<Transicion>,
    pub borde: Option<Transicion>,
}
#[derive(Clone, Debug, Default)]
pub(crate) struct Transiciones {
    pub compuestas: [Option<Transicion>; 5],
    pub pintadas: Arc<Pintadas>,
}
#[derive(Clone, Debug)]
pub(crate) enum Contenido {
    Caja(Vec<NodoPrograma>),
    Texto(Texto),
    Lista {
        de: Ruta,
        clave: String,
        plantilla: Box<NodoPrograma>,
    },
}
#[derive(Clone, Debug)]
pub(crate) struct NodoPrograma {
    pub id: u16,
    pub puntero: Arc<str>,
    pub base: EstiloBase,
    pub estados: Vec<Estado>,
    pub contenido: Contenido,
    pub visible: Option<Condicion>,
    pub capa: bool,
    pub transiciones: Arc<Transiciones>,
    pub bucle: Option<Arc<Bucle>>,
    pub entrada: Option<Arc<Aparicion>>,
    pub salida: Option<Arc<Aparicion>>,
    pub movimiento: Option<Transicion>,
}
#[derive(Clone, Debug)]
pub(crate) enum TipoModelo {
    Bool,
    Texto,
    Numero,
    Enum(Arc<[String]>),
    Lista(Vec<(String, TipoModelo)>),
}
#[derive(Clone, Debug)]
pub(crate) struct ContratoPrograma {
    pub campos: Vec<(String, TipoModelo)>,
}
impl ContratoPrograma {
    pub fn validar(&self, m: &Value) -> Result<(), ErrorModelo> {
        validar_presupuesto(m, 0, &mut 0, &mut 0)?;
        validar_campos(m, &self.campos, "")
    }
}
fn validar_presupuesto(
    m: &Value,
    prof: usize,
    cuenta: &mut usize,
    bytes: &mut usize,
) -> Result<(), ErrorModelo> {
    *cuenta += 1;
    if prof > 32 || *cuenta > 65536 || *bytes > 1024 * 1024 {
        return Err(ErrorModelo::limite("/modelo"));
    }
    match m {
        Value::Object(o) => {
            for (k, v) in o {
                *bytes += k.len();
                validar_presupuesto(v, prof + 1, cuenta, bytes)?;
            }
        }
        Value::Array(a) => {
            for v in a {
                validar_presupuesto(v, prof + 1, cuenta, bytes)?;
            }
        }
        Value::String(s) => {
            *bytes += s.len();
            if *bytes > 1024 * 1024 {
                return Err(ErrorModelo::limite("/modelo"));
            }
        }
        _ => {}
    }
    Ok(())
}
fn validar_campos(m: &Value, campos: &[(String, TipoModelo)], p: &str) -> Result<(), ErrorModelo> {
    for (k, tipo) in campos {
        let p = format!("{p}/{}", k.replace('~', "~0").replace('/', "~1"));
        let dato = m.get(k).ok_or_else(|| ErrorModelo::enlace(&p))?;
        let correcto = match tipo {
            TipoModelo::Bool => dato.is_boolean(),
            TipoModelo::Texto => dato.is_string(),
            TipoModelo::Numero => numero_modelo(dato, &p).is_ok(),
            TipoModelo::Enum(e) => dato.as_str().is_some_and(|s| e.iter().any(|x| x == s)),
            TipoModelo::Lista(c) => {
                let a = dato.as_array().ok_or_else(|| ErrorModelo::enlace(&p))?;
                if a.len() > 64 {
                    return Err(ErrorModelo::limite(&p));
                }
                for (i, f) in a.iter().enumerate() {
                    validar_campos(f, c, &format!("{p}/{i}"))?;
                }
                true
            }
        };
        if !correcto {
            return Err(ErrorModelo::enlace(&p));
        }
    }
    Ok(())
}
pub(crate) const PROPIEDADES: [Propiedad; 5] = [
    Propiedad::Opacidad,
    Propiedad::X,
    Propiedad::Y,
    Propiedad::Escala,
    Propiedad::Giro,
];
pub(crate) const REPOSO: [f32; 5] = [1.0, 0.0, 0.0, 1.0, 0.0];
pub(crate) fn indice_propiedad(p: Propiedad) -> usize {
    match p {
        Propiedad::Opacidad => 0,
        Propiedad::X => 1,
        Propiedad::Y => 2,
        Propiedad::Escala => 3,
        Propiedad::Giro => 4,
    }
}
pub(crate) fn propiedad(s: &str) -> Option<usize> {
    match s {
        "opacidad" => Some(0),
        "x" => Some(1),
        "y" => Some(2),
        "escala" => Some(3),
        "giro" => Some(4),
        _ => None,
    }
}
