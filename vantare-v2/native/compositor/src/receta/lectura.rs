//! La ruta sigue a serde: no hay una segunda tabla de campos del formato.
use super::{Causa, Diagnostico};
use serde::de::{self, DeserializeSeed, IntoDeserializer, MapAccess, SeqAccess, Visitor};
use serde_json::Value;
use std::{cell::RefCell, rc::Rc};

pub(crate) fn documento<T: serde::de::DeserializeOwned>(
    f: &str,
    s: &str,
) -> Result<T, Vec<Diagnostico>> {
    if s.len() > 256 * 1024 {
        return Err(vec![error(
            f,
            "",
            Causa::Limite,
            "Fichero mayor de 256 KiB",
            "Reduce el fichero a 256 KiB.",
        )]);
    }
    let v: Value = serde_json::from_str(s).map_err(|e| {
        vec![error(
            f,
            "",
            Causa::Json,
            &e.to_string(),
            "Corrige la sintaxis JSON.",
        )]
    })?;
    convertir(v, f, "")
}
pub(crate) fn convertir<T: serde::de::DeserializeOwned>(
    mut v: Value,
    f: &str,
    p: &str,
) -> Result<T, Vec<Diagnostico>> {
    let mut errores = Vec::new();
    for _ in 0..512 {
        let ruta = Rc::new(RefCell::new(None));
        match T::deserialize(Lector {
            valor: v.clone(),
            puntero: p.into(),
            error: ruta.clone(),
        }) {
            Ok(t) => {
                return if errores.is_empty() {
                    Ok(t)
                } else {
                    Err(errores)
                };
            }
            Err(e) => {
                let mut puntero = ruta.borrow().clone().unwrap_or_else(|| p.into());
                let mensaje = e.to_string();
                if let Some(campo) = mensaje
                    .strip_prefix("missing field `")
                    .and_then(|x| x.split('`').next())
                {
                    puntero = format!("{puntero}/{}", escapar(campo));
                }
                let causa = if mensaje.starts_with("unknown field") {
                    Causa::CampoDesconocido
                } else {
                    Causa::Tipo
                };
                if !errores.iter().any(|d: &Diagnostico| d.puntero == puntero) {
                    errores.push(error(f,&puntero,causa,&mensaje,"Corrige este campo según su tipo en RECETA.md; elimina los campos desconocidos."));
                }
                let relativo = puntero.strip_prefix(p).map_or(puntero.as_str(), |s| s);
                let borrado = relativo
                    .rsplit_once('/')
                    .and_then(|(padre, k)| {
                        v.pointer_mut(padre)
                            .and_then(Value::as_object_mut)
                            .map(|o| o.remove(&k.replace("~1", "/").replace("~0", "~")).is_some())
                    })
                    .is_some_and(|x| x);
                if !borrado {
                    return Err(errores);
                }
            }
        }
    }
    errores.push(error(
        f,
        p,
        Causa::Limite,
        "Demasiados errores de forma",
        "Reduce el documento y corrige los errores indicados.",
    ));
    Err(errores)
}
pub(crate) fn error(f: &str, p: &str, causa: Causa, detalle: &str, solucion: &str) -> Diagnostico {
    Diagnostico {
        fichero: f.into(),
        puntero: p.into(),
        causa,
        detalle: detalle.into(),
        solucion: solucion.into(),
    }
}
fn escapar(s: &str) -> String {
    s.replace('~', "~0").replace('/', "~1")
}
type Error = serde_json::Error;
type Registro = Rc<RefCell<Option<String>>>;
struct Lector {
    valor: Value,
    puntero: String,
    error: Registro,
}
impl Lector {
    fn registrar<T>(&self, r: &Result<T, Error>) {
        if r.is_err() && self.error.borrow().is_none() {
            *self.error.borrow_mut() = Some(self.puntero.clone());
        }
    }
}
impl<'de> de::Deserializer<'de> for Lector {
    type Error = Error;
    fn deserialize_any<V: Visitor<'de>>(self, visitor: V) -> Result<V::Value, Error> {
        let registro = Self {
            valor: Value::Null,
            puntero: self.puntero.clone(),
            error: self.error.clone(),
        };
        let resultado = match self.valor {
            Value::Null => visitor.visit_unit(),
            Value::Bool(v) => visitor.visit_bool(v),
            Value::String(v) => visitor.visit_string(v),
            Value::Number(n) => {
                if let Some(v) = n.as_u64() {
                    visitor.visit_u64(v)
                } else if let Some(v) = n.as_i64() {
                    visitor.visit_i64(v)
                } else if let Some(v) = n.as_f64() {
                    visitor.visit_f64(v)
                } else {
                    Err(de::Error::custom("número JSON inválido"))
                }
            }
            Value::Array(a) => visitor.visit_seq(Secuencia {
                iterador: a.into_iter(),
                indice: 0,
                puntero: self.puntero,
                error: self.error,
            }),
            Value::Object(o) => visitor.visit_map(Mapa {
                iterador: o.into_iter(),
                pendiente: None,
                puntero: self.puntero,
                error: self.error,
            }),
        };
        registro.registrar(&resultado);
        resultado
    }
    fn deserialize_option<V: Visitor<'de>>(self, visitor: V) -> Result<V::Value, Error> {
        if self.valor.is_null() {
            visitor.visit_none()
        } else {
            visitor.visit_some(self)
        }
    }
    fn deserialize_newtype_struct<V: Visitor<'de>>(
        self,
        _: &'static str,
        visitor: V,
    ) -> Result<V::Value, Error> {
        visitor.visit_newtype_struct(self)
    }
    fn deserialize_enum<V: Visitor<'de>>(
        self,
        _: &'static str,
        _: &'static [&'static str],
        visitor: V,
    ) -> Result<V::Value, Error> {
        let registro = Self {
            valor: Value::Null,
            puntero: self.puntero.clone(),
            error: self.error.clone(),
        };
        let r = match self.valor {
            Value::String(s) => visitor.visit_enum(s.into_deserializer()),
            _ => Err(de::Error::custom("se esperaba un enumerado")),
        };
        registro.registrar(&r);
        r
    }
    serde::forward_to_deserialize_any! {bool i8 i16 i32 i64 u8 u16 u32 u64 f32 f64 char str string bytes byte_buf unit unit_struct seq tuple tuple_struct map struct identifier ignored_any}
}
struct Mapa {
    iterador: serde_json::map::IntoIter,
    pendiente: Option<(String, Value)>,
    puntero: String,
    error: Registro,
}
impl<'de> MapAccess<'de> for Mapa {
    type Error = Error;
    fn next_key_seed<K: DeserializeSeed<'de>>(
        &mut self,
        seed: K,
    ) -> Result<Option<K::Value>, Error> {
        let Some((k, v)) = self.iterador.next() else {
            return Ok(None);
        };
        let p = format!("{}/{}", self.puntero, escapar(&k));
        self.pendiente = Some((k.clone(), v));
        let r = seed.deserialize(k.into_deserializer()).map(Some);
        if r.is_err() && self.error.borrow().is_none() {
            *self.error.borrow_mut() = Some(p);
        }
        r
    }
    fn next_value_seed<V: DeserializeSeed<'de>>(&mut self, seed: V) -> Result<V::Value, Error> {
        match self.pendiente.take() {
            Some((k, valor)) => seed.deserialize(Lector {
                valor,
                puntero: format!("{}/{}", self.puntero, escapar(&k)),
                error: self.error.clone(),
            }),
            None => Err(de::Error::custom("valor sin clave")),
        }
    }
}
struct Secuencia {
    iterador: std::vec::IntoIter<Value>,
    indice: usize,
    puntero: String,
    error: Registro,
}
impl<'de> SeqAccess<'de> for Secuencia {
    type Error = Error;
    fn next_element_seed<T: DeserializeSeed<'de>>(
        &mut self,
        seed: T,
    ) -> Result<Option<T::Value>, Error> {
        match self.iterador.next() {
            None => Ok(None),
            Some(valor) => {
                let p = format!("{}/{}", self.puntero, self.indice);
                self.indice += 1;
                seed.deserialize(Lector {
                    valor,
                    puntero: p,
                    error: self.error.clone(),
                })
                .map(Some)
            }
        }
    }
}
