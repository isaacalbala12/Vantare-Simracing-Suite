//! Compilación y resolución acotada, exclusivamente durante la carga o recarga.
use super::{
    Causa, Diagnostico, lectura,
    programa::{
        Aparicion, Bucle, Cambio, Condicion, Contenido, ContratoPrograma, DatosPrograma, Eleccion,
        Estado, EstiloBase, Fragmento, NodoPrograma, Numero, Pintadas, Programa, Ruta, Sombra,
        Texto, TipoModelo, Transicion, Transiciones, propiedad,
    },
    tipos::{self, Campo, Contrato, Nodo, Receta, Sistema},
};
use crate::escena::capas::{Alineacion, Color, Fuente, Parada, Pintura};
use serde::{Deserialize, de::DeserializeOwned};
use serde_json::Value;
use std::{
    collections::{BTreeMap, BTreeSet},
    rc::Rc,
    sync::Arc,
};
use taffy::{Dimension, LengthPercentageAuto};
type Resultado<T> = Result<T, Diagnostico>;
type Ambitos = Vec<(String, BTreeMap<String, Campo>)>;
/// Compila una transición literal aislada, para herramientas y pruebas; no se usa en carrera.
pub fn leer_transicion(v: &Value) -> Result<Transicion, Vec<Diagnostico>> {
    let s = Sistema {
        origen: None,
        sistema: 1,
        nombre: "transicion".into(),
        fuentes: Vec::new(),
        color: BTreeMap::new(),
        tipo: BTreeMap::new(),
        medida: BTreeMap::new(),
        mov: BTreeMap::new(),
        efecto: BTreeMap::new(),
        propios: BTreeMap::new(),
    };
    let c = Contrato {
        modelo: "transicion/1".into(),
        campos: BTreeMap::new(),
    };
    let mut compilador = Compilador {
        sistema: &s,
        contrato: &c,
        fichero: "transicion.json",
        errores: Vec::new(),
        bytes: 256 * 1024,
        siguiente: 0,
    };
    compilador.transicion(v, "/transicion").map_err(|e| vec![e])
}

pub(crate) fn crear(
    receta: Receta,
    sistema: Sistema,
    contrato: Contrato,
    fuentes: &[String],
    archivos: [String; 3],
) -> Result<Programa, Vec<Diagnostico>> {
    let mut compilador = Compilador {
        sistema: &sistema,
        contrato: &contrato,
        fichero: &archivos[0],
        errores: Vec::new(),
        bytes: 256 * 1024,
        siguiente: 0,
    };
    let resultado = compilador.programa(&receta);
    let datos = match resultado {
        Ok(v) => v,
        Err(e) => {
            compilador.errores.push(e);
            return Err(compilador.errores);
        }
    };
    if !compilador.errores.is_empty() {
        return Err(compilador.errores);
    }
    let (raiz, visible, cambio_sistema) = datos;
    Ok(Programa {
        datos: Rc::new(DatosPrograma {
            raiz,
            visible,
            cambio_sistema,
            contrato: ContratoPrograma {
                campos: campos_compilados(&contrato.campos),
            },
            fuente: Arc::new(receta),
            sistema,
            contrato_fuente: contrato,
            fuentes: fuentes.to_vec(),
            archivos,
        }),
    })
}
struct Compilador<'a> {
    sistema: &'a Sistema,
    contrato: &'a Contrato,
    fichero: &'a str,
    errores: Vec<Diagnostico>,
    bytes: usize,
    siguiente: u16,
}
type CabeceraPrograma = (NodoPrograma, Option<Condicion>, Transicion);
impl Compilador<'_> {
    fn fallo(&self, p: &str, causa: Causa, d: &str, s: &str) -> Diagnostico {
        lectura::error(self.fichero, p, causa, d, s)
    }
    fn dto<T: DeserializeOwned>(&mut self, v: Value, p: &str) -> Resultado<T> {
        match lectura::convertir(v, self.fichero, p) {
            Ok(v) => Ok(v),
            Err(mut e) => {
                let primero = e.remove(0);
                self.errores.extend(e);
                Err(primero)
            }
        }
    }
    fn resolver(&mut self, v: &Value, p: &str) -> Resultado<Value> {
        self.expandir(v, p, &mut BTreeSet::new(), 0)
    }
    fn expandir(
        &mut self,
        v: &Value,
        p: &str,
        activos: &mut BTreeSet<String>,
        nivel: usize,
    ) -> Resultado<Value> {
        let coste = match v {
            Value::String(s) => s.len() + 8,
            Value::Object(m) => m.keys().map(String::len).sum::<usize>() + 8,
            _ => 8,
        };
        self.bytes = self.bytes.checked_sub(coste).ok_or_else(|| {
            self.fallo(
                p,
                Causa::Limite,
                "Sistema expandido mayor de 256 KiB",
                "Reduce los tokens o evita referencias que multipliquen objetos.",
            )
        })?;
        if nivel > 64 {
            return Err(self.fallo(
                p,
                Causa::Ciclo,
                "Cadena de tokens demasiado profunda",
                "Reduce las referencias a 64 niveles.",
            ));
        }
        match v {
            Value::String(s) if s.starts_with('$') => {
                if !activos.insert(s.clone()) {
                    return Err(self.fallo(
                        p,
                        Causa::Ciclo,
                        "Ciclo entre tokens",
                        "Sustituye una referencia circular por un valor final.",
                    ));
                }
                let valor = self.sistema.token(s).ok_or_else(|| {
                    self.fallo(
                        p,
                        Causa::Token,
                        &format!("Token inexistente: {s}"),
                        "Define este token en el sistema antes de cargar la receta.",
                    )
                })?;
                let resuelto = self.expandir(&valor, p, activos, nivel + 1);
                activos.remove(s);
                resuelto
            }
            Value::Object(o) => o
                .iter()
                .map(|(k, v)| {
                    self.expandir(v, &format!("{p}/{k}"), activos, nivel + 1)
                        .map(|v| (k.clone(), v))
                })
                .collect(),
            Value::Array(a) => a
                .iter()
                .enumerate()
                .map(|(i, v)| self.expandir(v, &format!("{p}/{i}"), activos, nivel + 1))
                .collect(),
            _ => Ok(v.clone()),
        }
    }
    fn numero(&self, v: &Value, p: &str) -> Resultado<f32> {
        let n = v
            .as_f64()
            .filter(|v| v.is_finite() && v.abs() <= 1_000_000.0)
            .ok_or_else(|| {
                self.fallo(
                    p,
                    Causa::Medida,
                    "Número fuera de ±1000000",
                    "Usa un número finito dentro de ±1000000.",
                )
            })?;
        let numero = f32::deserialize(v).map_err(|e| {
            self.fallo(
                p,
                Causa::Tipo,
                &e.to_string(),
                "Usa un número representable en f32.",
            )
        })?;
        if !numero.is_finite() || !n.is_finite() {
            return Err(self.fallo(
                p,
                Causa::Medida,
                "Número no representable",
                "Reduce el número a ±1000000.",
            ));
        }
        Ok(numero)
    }
    fn medida(&mut self, v: &Value, p: &str) -> Resultado<f32> {
        let v = self.resolver(v, p)?;
        self.numero(&v, p)
    }
    fn longitud(&mut self, v: &Value, p: &str) -> Resultado<LengthPercentageAuto> {
        match v.as_str() {
            Some("auto") => Ok(LengthPercentageAuto::auto()),
            Some("100%") => Ok(LengthPercentageAuto::percent(1.0)),
            _ => Ok(LengthPercentageAuto::length(self.medida(v, p)?)),
        }
    }
    fn dimension(&mut self, v: &Value, p: &str) -> Resultado<Dimension> {
        match v.as_str() {
            Some("auto") => Ok(Dimension::auto()),
            Some("100%") => Ok(Dimension::percent(1.0)),
            _ => {
                let n = self.medida(v, p)?;
                if n < 0.0 {
                    return Err(self.fallo(
                        p,
                        Causa::Medida,
                        "Tamaño negativo",
                        "Usa un tamaño mayor o igual a cero.",
                    ));
                }
                Ok(Dimension::length(n))
            }
        }
    }
    fn lados(&mut self, valor: &Value, puntero: &str, relleno: bool) -> Resultado<[f32; 4]> {
        if let Some(arriba) = valor.as_array() {
            let permitidos = if relleno { &[1, 2, 4][..] } else { &[1, 4][..] };
            if !permitidos.contains(&arriba.len()) {
                return Err(self.fallo(
                    puntero,
                    Causa::Medida,
                    "Cantidad de lados incorrecta",
                    "Usa uno o cuatro valores; relleno admite también dos.",
                ));
            }
            let mut numeros = Vec::new();
            for (i, valor) in arriba.iter().enumerate() {
                numeros.push(self.medida(valor, &format!("{puntero}/{i}"))?);
            }
            Ok(match numeros.as_slice() {
                [arriba] => [*arriba; 4],
                [arriba, derecha] => [*arriba, *derecha, *arriba, *derecha],
                [arriba, derecha, abajo, izquierda] => [*arriba, *derecha, *abajo, *izquierda],
                _ => {
                    return Err(self.fallo(
                        puntero,
                        Causa::Medida,
                        "Lados inválidos",
                        "Usa uno, dos o cuatro valores.",
                    ));
                }
            })
        } else {
            Ok([self.medida(valor, puntero)?; 4])
        }
    }
    fn ruta(&self, ruta: &str, ambitos: &Ambitos, p: &str) -> Resultado<(Ruta, Campo)> {
        let partes = ruta.split('.').collect::<Vec<_>>();
        let primero = partes.first().ok_or_else(|| {
            self.fallo(p, Causa::Enlace, "Ruta vacía", "Usa una ruta del contrato.")
        })?;
        let (indice, segmentos, campos) =
            if let Some(i) = ambitos.iter().position(|(a, _)| a == primero) {
                (Some(i), &partes[1..], &ambitos[i].1)
            } else {
                (None, &partes[..], &self.contrato.campos)
            };
        if segmentos.len() != 1 {
            return Err(self.fallo(
                p,
                Causa::Enlace,
                "Ruta inválida",
                "Lee un campo global o alias.campo de un elemento de lista.",
            ));
        }
        let campo = campos
            .get(segmentos[0])
            .ok_or_else(|| {
                self.fallo(
                    p,
                    Causa::Enlace,
                    "Campo inexistente",
                    "Declara el campo en el contrato y usa su ruta exacta.",
                )
            })?
            .clone();
        let enumerado = match &campo {
            Campo::Enumerado(e) => Arc::from(e.r#enum.clone()),
            _ => Arc::from([]),
        };
        Ok((
            Ruta {
                ambito: indice,
                segmentos: segmentos.iter().map(|s| (*s).into()).collect(),
                enumerado,
            },
            campo,
        ))
    }
    fn condicion(&self, condicion: &str, ambitos: &Ambitos, puntero: &str) -> Resultado<Condicion> {
        if let Some((ruta, valor)) = condicion.split_once('=') {
            let (enlace, tipo) = self.ruta(ruta, ambitos, puntero)?;
            if let Campo::Enumerado(enumerado) = tipo {
                let indice = enumerado
                    .r#enum
                    .iter()
                    .position(|v| v == valor)
                    .ok_or_else(|| {
                        self.fallo(
                            puntero,
                            Causa::Condicion,
                            "Valor fuera del enum",
                            "Usa un valor declarado en el enum.",
                        )
                    })?;
                Ok(Condicion::Igual(enlace, indice))
            } else {
                Err(self.fallo(
                    puntero,
                    Causa::Condicion,
                    "La igualdad necesita enum",
                    "Declara el campo como enum.",
                ))
            }
        } else {
            let (negada, ruta) = condicion
                .strip_prefix('!')
                .map_or((false, condicion), |enlace| (true, enlace));
            let (enlace, tipo) = self.ruta(ruta, ambitos, puntero)?;
            if !matches!(tipo,Campo::Simple(s) if s=="bool") {
                return Err(self.fallo(
                    puntero,
                    Causa::Condicion,
                    "La condición necesita bool",
                    "Usa un campo bool del contrato.",
                ));
            }
            Ok(if negada {
                Condicion::Falso(enlace)
            } else {
                Condicion::Verdadero(enlace)
            })
        }
    }
    fn eleccion<T: Clone>(
        &mut self,
        v: &Value,
        a: &Ambitos,
        p: &str,
        parsear: fn(&mut Self, &Value, &str) -> Resultado<T>,
    ) -> Resultado<Eleccion<T>> {
        if let Some((prefijo, resto)) = v.as_str().and_then(|s| s.split_once('{')) {
            let (ruta, sufijo) = resto.split_once('}').ok_or_else(|| {
                self.fallo(
                    p,
                    Causa::Enlace,
                    "Enlace incompleto",
                    "Cierra el enlace con }.",
                )
            })?;
            let (ruta, tipo) = self.ruta(ruta, a, p)?;
            let Campo::Enumerado(e) = tipo else {
                return Err(self.fallo(
                    p,
                    Causa::Enlace,
                    "Token dinámico sin enum",
                    "Usa un campo enum y un token por valor.",
                ));
            };
            let mut valores = Vec::new();
            for nombre in e.r#enum {
                let valor =
                    self.resolver(&Value::String(format!("{prefijo}{nombre}{sufijo}")), p)?;
                valores.push(parsear(self, &valor, p)?);
            }
            Ok(Eleccion::Enumerada {
                ruta,
                valores: valores.into(),
            })
        } else {
            let valor = self.resolver(v, p)?;
            Ok(Eleccion::Fija(parsear(self, &valor, p)?))
        }
    }
    fn color(&mut self, v: &Value, p: &str) -> Resultado<Color> {
        let s = v
            .as_str()
            .and_then(|s| s.strip_prefix('#'))
            .filter(|s| s.is_ascii() && matches!(s.len(), 6 | 8))
            .ok_or_else(|| {
                self.fallo(
                    p,
                    Causa::Token,
                    "Color de sistema inválido",
                    "Usa un token cuyo valor sea #rrggbb o #rrggbbaa.",
                )
            })?;
        let canal = |i| {
            u8::from_str_radix(&s[i..i + 2], 16)
                .map(|n| f32::from(n) / 255.0)
                .map_err(|_| {
                    self.fallo(
                        p,
                        Causa::Token,
                        "Color hexadecimal inválido",
                        "Corrige los dígitos hexadecimales del token.",
                    )
                })
        };
        Ok(Color {
            r: canal(0)?,
            g: canal(2)?,
            b: canal(4)?,
            a: if s.len() == 8 { canal(6)? } else { 1.0 },
        })
    }
    fn pintura(&mut self, v: &Value, p: &str) -> Resultado<Pintura> {
        if v.is_string() {
            return self.color(v, p).map(Pintura::Solido);
        }
        let exterior: DegradadoDato = self.dto(v.clone(), p)?;
        let g = exterior.lineal;
        if g.paradas.len() < 2 || g.paradas.len() > 64 {
            return Err(self.fallo(
                p,
                Causa::Limite,
                "Cantidad de paradas incorrecta",
                "Usa entre 2 y 64 paradas.",
            ));
        }
        let angulo = self
            .numero(&Value::from(g.angulo), &format!("{p}/lineal/angulo"))?
            .to_radians();
        let (seno, coseno) = angulo.sin_cos();
        let mut paradas = Vec::new();
        let mut anterior = 0.0;
        for (i, (token, posicion)) in g.paradas.into_iter().enumerate() {
            let p = format!("{p}/lineal/paradas/{i}");
            if !(anterior..=1.0).contains(&posicion) {
                return Err(self.fallo(
                    &format!("{p}/1"),
                    Causa::Tipo,
                    "Parada fuera de rango u orden",
                    "Ordena las posiciones entre cero y uno.",
                ));
            }
            anterior = posicion;
            let valor = self.resolver(&Value::String(token), &format!("{p}/0"))?;
            paradas.push(Parada {
                posicion,
                color: self.color(&valor, &format!("{p}/0"))?,
            });
        }
        Ok(Pintura::Lineal {
            desde: (0.5 - seno * 0.5, 0.5 + coseno * 0.5),
            hasta: (0.5 + seno * 0.5, 0.5 - coseno * 0.5),
            paradas,
        })
    }
    fn fuente(&mut self, v: &Value, p: &str) -> Resultado<Fuente> {
        let d: FuenteDato = self.dto(v.clone(), p)?;
        if !self.sistema.fuentes.contains(&d.familia) {
            return Err(self.fallo(
                &format!("{p}/familia"),
                Causa::Fuente,
                "Fuente fuera del paquete",
                "Usa una familia registrada en fuentes.",
            ));
        }
        if !(100..=900).contains(&d.peso) || d.tamano <= 0.0 || d.interlinea <= 0.0 {
            return Err(self.fallo(
                p,
                Causa::Fuente,
                "Tipografía fuera de rango",
                "Usa peso 100..900, tamaño e interlinea positivos.",
            ));
        }
        for (k, n) in [
            ("tamano", d.tamano),
            ("interlinea", d.interlinea),
            ("interletra", d.interletra),
        ] {
            self.numero(&Value::from(n), &format!("{p}/{k}"))?;
        }
        Ok(Fuente {
            familia: d.familia,
            peso: d.peso,
            tamano: d.tamano,
            interlinea: d.interlinea,
            interletra: d.interletra,
            tabulares: d.tabulares,
            mayusculas: d.mayusculas,
        })
    }
    fn sombra(&mut self, v: &Value, p: &str) -> Resultado<Sombra> {
        let resuelto = self.resolver(v, p)?;
        let exterior: EfectoDato = self.dto(resuelto, p)?;
        let d = exterior.sombra;
        let p = format!("{p}/sombra");
        let valor = self.resolver(&Value::String(d.color), &format!("{p}/color"))?;
        let color = self.color(&valor, &format!("{p}/color"))?;
        let desenfoque = self.numero(&Value::from(d.desenfoque), &format!("{p}/desenfoque"))?;
        if desenfoque < 0.0 {
            return Err(self.fallo(
                &p,
                Causa::Medida,
                "Desenfoque negativo",
                "Usa un desenfoque entre 0 y 1000000.",
            ));
        }
        Ok(Sombra {
            color,
            desenfoque,
            desplazamiento: (
                self.numero(&Value::from(d.x), &format!("{p}/x"))?,
                self.numero(&Value::from(d.y), &format!("{p}/y"))?,
            ),
        })
    }
    fn transicion(&mut self, v: &Value, p: &str) -> Resultado<Transicion> {
        let valor = self.resolver(v, p)?;
        if valor.get("muelle").is_some() {
            let exterior: MuelleExterior = self.dto(valor, p)?;
            let d = exterior.muelle;
            if !d.rigidez.is_finite()
                || !d.amortiguacion.is_finite()
                || !(0.0..=10000.0).contains(&d.rigidez)
                || !(0.0..=10000.0).contains(&d.amortiguacion)
                || d.rigidez <= 0.0
                || d.amortiguacion <= 0.0
                || !super::validacion::muelle_asentado(
                    f64::from(d.rigidez),
                    f64::from(d.amortiguacion),
                )
            {
                return Err(self.fallo(
                    p,
                    Causa::Transicion,
                    "Muelle fuera de rango",
                    "Usa rigidez y amortiguación positivas, como máximo 10000, y un muelle que se asiente antes de 10 s.",
                ));
            }
            Ok(Transicion::Muelle {
                rigidez: d.rigidez,
                amortiguacion: d.amortiguacion,
            })
        } else {
            let d: BezierDato = self.dto(valor, p)?;
            if !d.duracion.is_finite()
                || !d.retardo.is_finite()
                || d.duracion < 0.0
                || (d.duracion > 0.0 && d.duracion < 1.0)
                || d.retardo < 0.0
                || d.duracion + d.retardo > 10000.0
            {
                return Err(self.fallo(p,Causa::Transicion,"Duración no representable o fuera de rango","Usa duración 0 o 1..10000 ms y retardo no negativo; la suma no supera 10000 ms."));
            }
            let puntos = match d.curva {
                None => [0.0, 0.0, 1.0, 1.0],
                Some(CurvaDato::Nombre(n)) => match n.as_str() {
                    "lineal" => [0.0, 0.0, 1.0, 1.0],
                    "entrada" => [0.42, 0.0, 1.0, 1.0],
                    "salida" => [0.0, 0.0, 0.58, 1.0],
                    "entrada-salida" => [0.42, 0.0, 0.58, 1.0],
                    _ => {
                        return Err(self.fallo(
                            &format!("{p}/curva"),
                            Causa::Transicion,
                            "Curva desconocida",
                            "Usa lineal, entrada, salida, entrada-salida o cuatro puntos CSS.",
                        ));
                    }
                },
                Some(CurvaDato::Puntos(v)) => v,
            };
            if puntos.iter().any(|v| !v.is_finite())
                || ![0, 2].iter().all(|i| (0.0..=1.0).contains(&puntos[*i]))
                || ![1, 3].iter().all(|i| (-10.0..=10.0).contains(&puntos[*i]))
            {
                return Err(self.fallo(
                    &format!("{p}/curva"),
                    Causa::Transicion,
                    "Puntos Bézier fuera de rango",
                    "Usa x1/x2 entre 0 y 1, y1/y2 entre -10 y 10.",
                ));
            }
            Ok(Transicion::Bezier {
                duracion: d.duracion / 1000.0,
                retardo: d.retardo / 1000.0,
                puntos,
            })
        }
    }
    fn cambio_layout(&mut self, k: &str, v: &Value, p: &str) -> Resultado<Option<Cambio>> {
        let cambio = match k {
            "ancho" => Cambio::Ancho(self.dimension(v, p)?),
            "alto" => Cambio::Alto(self.dimension(v, p)?),
            "min_ancho" => Cambio::MinAncho(self.longitud(v, p)?),
            "max_ancho" => Cambio::MaxAncho(self.longitud(v, p)?),
            "direccion" => Cambio::Direccion(match v.as_str() {
                Some("fila") => taffy::FlexDirection::Row,
                Some("columna") => taffy::FlexDirection::Column,
                _ => {
                    return Err(self.fallo(
                        p,
                        Causa::Tipo,
                        "Dirección desconocida",
                        "Usa fila o columna.",
                    ));
                }
            }),
            "alinear" => Cambio::Alinear(match v.as_str() {
                Some("inicio") => taffy::AlignItems::FLEX_START,
                Some("centro") => taffy::AlignItems::CENTER,
                Some("fin") => taffy::AlignItems::FLEX_END,
                Some("estirar") => taffy::AlignItems::STRETCH,
                _ => {
                    return Err(self.fallo(
                        p,
                        Causa::Tipo,
                        "Alineación desconocida",
                        "Usa inicio, centro, fin o estirar.",
                    ));
                }
            }),
            "justificar" => Cambio::Justificar(match v.as_str() {
                Some("inicio") => taffy::JustifyContent::FLEX_START,
                Some("centro") => taffy::JustifyContent::CENTER,
                Some("fin") => taffy::JustifyContent::FLEX_END,
                Some("entre") => taffy::JustifyContent::SPACE_BETWEEN,
                _ => {
                    return Err(self.fallo(
                        p,
                        Causa::Tipo,
                        "Justificación desconocida",
                        "Usa inicio, centro, fin o entre.",
                    ));
                }
            }),
            "hueco" => Cambio::Hueco(self.medida(v, p)?),
            "relleno" => Cambio::Relleno(self.lados(v, p, true)?),
            "radio" => Cambio::Radios(self.lados(v, p, false)?),
            "crecer" => Cambio::Crecer(self.numero(v, p)?),
            "encoger" => Cambio::Encoger(self.numero(v, p)?),
            "posicion" => Cambio::Posicion(match v.as_str() {
                Some("relativa") => taffy::Position::Relative,
                Some("absoluta") => taffy::Position::Absolute,
                _ => {
                    return Err(self.fallo(
                        p,
                        Causa::Tipo,
                        "Posición desconocida",
                        "Usa relativa o absoluta.",
                    ));
                }
            }),
            "arriba" => Cambio::Inset(0, self.longitud(v, p)?),
            "derecha" => Cambio::Inset(1, self.longitud(v, p)?),
            "abajo" => Cambio::Inset(2, self.longitud(v, p)?),
            "izquierda" => Cambio::Inset(3, self.longitud(v, p)?),
            _ => return Ok(None),
        };
        Ok(Some(cambio))
    }
    fn cambios(
        &mut self,
        estilo: &tipos::Estilo,
        ambitos: &Ambitos,
        puntero: &str,
    ) -> Resultado<Vec<Cambio>> {
        let mapa = estilo.valores().map_err(|estilo| {
            self.fallo(
                puntero,
                Causa::Tipo,
                &estilo.to_string(),
                "Corrige el estilo antes de compilar.",
            )
        })?;
        let mut cambios = Vec::new();
        for (k, v) in mapa {
            let puntero = format!("{puntero}/{k}");
            if let Some(c) = self.cambio_layout(&k, &v, &puntero)? {
                cambios.push(c);
                continue;
            }
            let c = match k.as_str() {
                "fondo" => Cambio::Fondo(self.eleccion(&v, ambitos, &puntero, Self::pintura)?),
                "color" => Cambio::Color(self.eleccion(&v, ambitos, &puntero, Self::color)?),
                "tipo" => Cambio::Fuente(self.eleccion(&v, ambitos, &puntero, Self::fuente)?),
                "borde" => {
                    let d: BordeDato = self.dto(v, &puntero)?;
                    Cambio::Borde(
                        self.medida(&d.ancho, &format!("{puntero}/ancho"))?,
                        self.eleccion(
                            &Value::String(d.color),
                            ambitos,
                            &format!("{puntero}/color"),
                            Self::color,
                        )?,
                    )
                }
                "sombra" => Cambio::Sombra(self.sombra(&v, &puntero)?),
                "alinear_texto" => Cambio::AlinearTexto(match v.as_str() {
                    Some("inicio") => Alineacion::Inicio,
                    Some("centro") => Alineacion::Centro,
                    Some("fin") => Alineacion::Fin,
                    _ => {
                        return Err(self.fallo(
                            &puntero,
                            Causa::Tipo,
                            "Alineación de texto desconocida",
                            "Usa inicio, centro o fin.",
                        ));
                    }
                }),
                otro => {
                    let i = propiedad(otro).ok_or_else(|| {
                        self.fallo(
                            &puntero,
                            Causa::Tipo,
                            "Propiedad de estilo desconocida",
                            "Usa un campo de Estilo.",
                        )
                    })?;
                    let numero = if let Some(r) = v
                        .as_str()
                        .and_then(|s| s.strip_prefix('{'))
                        .and_then(|s| s.strip_suffix('}'))
                    {
                        let (r, t) = self.ruta(r, ambitos, &puntero)?;
                        if !matches!(t,Campo::Simple(s) if s=="numero") {
                            return Err(self.fallo(
                                &puntero,
                                Causa::Enlace,
                                "Propiedad sin numero",
                                "Enlaza un campo numero.",
                            ));
                        }
                        Numero::Modelo(r)
                    } else {
                        Numero::Fijo(self.numero(&v, &puntero)?)
                    };
                    Cambio::Compuesta(i, numero)
                }
            };
            cambios.push(c);
        }
        Ok(cambios)
    }
    fn aparicion(&mut self, a: &tipos::Aparicion, p: &str, entrada: bool) -> Resultado<Aparicion> {
        let mut valores = [None; 5];
        let lado = if entrada { "desde" } else { "hacia" };
        for (k, v) in if entrada { &a.desde } else { &a.hacia } {
            let i = propiedad(k).ok_or_else(|| {
                self.fallo(
                    &format!("{p}/{lado}/{k}"),
                    Causa::Transicion,
                    "Propiedad no compuesta",
                    "Usa opacidad, x, y, escala o giro.",
                )
            })?;
            valores[i] = Some(self.numero(&Value::from(*v), &format!("{p}/{lado}/{k}"))?);
        }
        let transicion = match &a.transicion {
            Some(t) => self.transicion(t, &format!("{p}/transicion"))?,
            None => Transicion::PREDETERMINADA,
        };
        Ok(Aparicion {
            valores,
            transicion,
        })
    }
    fn bucle(&self, b: &tipos::Bucle, a: &Ambitos, p: &str) -> Resultado<Arc<Bucle>> {
        let i = propiedad(&b.propiedad).ok_or_else(|| {
            self.fallo(
                p,
                Causa::Transicion,
                "Propiedad de bucle no compuesta",
                "Usa una propiedad compuesta.",
            )
        })?;
        if b.valores.len() < 2
            || b.valores.len() > 64
            || !b.duracion.is_finite()
            || !(1.0..=10000.0).contains(&b.duracion)
            || b.valores
                .iter()
                .any(|n| !n.is_finite() || n.abs() > 1_000_000.0)
        {
            return Err(self.fallo(
                p,
                Causa::Transicion,
                "Bucle fuera de límites",
                "Usa 2..64 valores finitos y duración 1..10000 ms.",
            ));
        }
        Ok(Arc::new(Bucle {
            propiedad: i,
            valores: b.valores.clone().into(),
            duracion: b.duracion / 1000.0,
            cuando: b
                .cuando
                .as_ref()
                .map(|c| self.condicion(c, a, &format!("{p}/cuando")))
                .transpose()?,
        }))
    }
    fn contenido(
        &mut self,
        n: &Nodo,
        a: &mut Ambitos,
        p: &str,
        base: &EstiloBase,
        prof: usize,
    ) -> Resultado<Contenido> {
        Ok(match n.tipo.as_str() {
            "caja" => {
                let mut hijos = Vec::new();
                for (i, h) in n.hijos.iter().enumerate() {
                    match self.nodo(h, a, &format!("{p}/hijos/{i}"), base, false, prof + 1) {
                        Ok(h) => hijos.push(h),
                        Err(e) => self.errores.push(e),
                    }
                }
                Contenido::Caja(hijos)
            }
            "texto" => Contenido::Texto(self.texto(
                n.texto.as_deref().ok_or_else(|| {
                    self.fallo(
                        &format!("{p}/texto"),
                        Causa::Tipo,
                        "Falta texto",
                        "Añade el texto de la línea.",
                    )
                })?,
                a,
                p,
                base,
            )?),
            "lista" => {
                let (de, t) = self.ruta(
                    n.de.as_deref().ok_or_else(|| {
                        self.fallo(p, Causa::Lista, "Falta de", "Indica la lista del modelo.")
                    })?,
                    a,
                    &format!("{p}/de"),
                )?;
                let Campo::Lista(lista) = t else {
                    return Err(self.fallo(
                        p,
                        Causa::Lista,
                        "Origen no es lista",
                        "Usa un campo lista del contrato.",
                    ));
                };
                let alias = n.como.clone().ok_or_else(|| {
                    self.fallo(
                        p,
                        Causa::Lista,
                        "Falta alias",
                        "Define como para los elementos.",
                    )
                })?;
                let clave = n.clave.clone().ok_or_else(|| {
                    self.fallo(
                        p,
                        Causa::Lista,
                        "Falta clave",
                        "Usa un campo escalar estable.",
                    )
                })?;
                let plantilla = n.plantilla.as_ref().ok_or_else(|| {
                    self.fallo(
                        p,
                        Causa::Lista,
                        "Falta plantilla",
                        "Añade la plantilla de la lista.",
                    )
                })?;
                a.push((alias, lista.lista));
                let plantilla = self.nodo(
                    plantilla,
                    a,
                    &format!("{p}/plantilla"),
                    base,
                    true,
                    prof + 1,
                );
                a.pop();
                let plantilla = plantilla?;
                Contenido::Lista {
                    de,
                    clave,
                    plantilla: Box::new(plantilla),
                }
            }
            _ => {
                return Err(self.fallo(
                    &format!("{p}/tipo"),
                    Causa::Tipo,
                    "Tipo desconocido",
                    "Usa caja, texto o lista.",
                ));
            }
        })
    }
    fn estados(&mut self, n: &Nodo, a: &Ambitos, p: &str) -> Resultado<Vec<Estado>> {
        let mut estados = Vec::new();
        for (i, e) in n.estados.iter().enumerate() {
            let p = format!("{p}/estados/{i}");
            estados.push(Estado {
                condicion: self.condicion(&e.cuando, a, &format!("{p}/cuando"))?,
                cambios: self.cambios(&e.estilo, a, &format!("{p}/estilo"))?,
                bucle: e
                    .bucle
                    .as_ref()
                    .map(|b| self.bucle(b, a, &format!("{p}/bucle")))
                    .transpose()?,
            });
        }
        Ok(estados)
    }
    fn nodo(
        &mut self,
        n: &Nodo,
        a: &mut Ambitos,
        p: &str,
        heredado: &EstiloBase,
        forzar: bool,
        prof: usize,
    ) -> Resultado<NodoPrograma> {
        if prof > 32 || self.siguiente >= 512 {
            return Err(self.fallo(
                p,
                Causa::Limite,
                "Receta demasiado profunda o grande",
                "Usa como máximo 32 niveles y 512 nodos.",
            ));
        }
        let id = self.siguiente;
        self.siguiente += 1;
        let cambios = self.cambios(&n.estilo, a, &format!("{p}/estilo"))?;
        let mut base = EstiloBase {
            fuente: heredado.fuente.clone(),
            color: heredado.color.clone(),
            ..EstiloBase::default()
        };
        for c in &cambios {
            c.aplicar(&mut base);
        }
        let estados = self.estados(n, a, p)?;
        let transiciones = self.transiciones(&n.transiciones, &format!("{p}/transiciones"))?;
        let contenido = self.contenido(n, a, p, &base, prof)?;
        let capa = forzar
            || n.capa
            || n.visible.is_some()
            || n.bucle.is_some()
            || estados.iter().any(|e| {
                e.bucle.is_some() || e.cambios.iter().any(|c| matches!(c, Cambio::Compuesta(..)))
            })
            || cambios.iter().any(|c| matches!(c, Cambio::Compuesta(..)))
            || transiciones.compuestas.iter().any(Option::is_some);
        Ok(NodoPrograma {
            id,
            puntero: p.into(),
            base,
            estados,
            contenido,
            visible: n
                .visible
                .as_ref()
                .map(|c| self.condicion(c, a, &format!("{p}/visible")))
                .transpose()?,
            capa,
            transiciones: Arc::new(transiciones),
            bucle: n
                .bucle
                .as_ref()
                .map(|b| self.bucle(b, a, &format!("{p}/bucle")))
                .transpose()?,
            entrada: n
                .entrada
                .as_ref()
                .map(|v| {
                    self.aparicion(v, &format!("{p}/entrada"), true)
                        .map(Arc::new)
                })
                .transpose()?,
            salida: n
                .salida
                .as_ref()
                .map(|v| {
                    self.aparicion(v, &format!("{p}/salida"), false)
                        .map(Arc::new)
                })
                .transpose()?,
            movimiento: n
                .movimiento
                .as_ref()
                .map(|v| self.transicion(v, &format!("{p}/movimiento")))
                .transpose()?,
        })
    }
    fn texto(
        &self,
        texto: &str,
        ambitos: &Ambitos,
        puntero: &str,
        base: &EstiloBase,
    ) -> Resultado<Texto> {
        let mut fragmentos = Vec::new();
        let mut resto = texto;
        while let Some((literal, r)) = resto.split_once('{') {
            fragmentos.push(Fragmento::Literal(literal.into()));
            let (ruta, fin) = r.split_once('}').ok_or_else(|| {
                self.fallo(
                    puntero,
                    Causa::Enlace,
                    "Enlace incompleto",
                    "Cierra el enlace con }.",
                )
            })?;
            let (r, t) = self.ruta(ruta, ambitos, &format!("{puntero}/texto"))?;
            if matches!(t, Campo::Lista(_)) {
                return Err(self.fallo(
                    puntero,
                    Causa::Enlace,
                    "El texto no admite listas",
                    "Enlaza un campo escalar.",
                ));
            }
            fragmentos.push(Fragmento::Campo(r));
            resto = fin;
        }
        fragmentos.push(Fragmento::Literal(resto.into()));
        let fuente = base.fuente.clone().ok_or_else(|| {
            self.fallo(
                &format!("{puntero}/estilo/tipo"),
                Causa::Fuente,
                "Texto sin tipografía",
                "Define tipo mediante un token $tipo.* en este nodo o su padre.",
            )
        })?;
        let color = base.color.clone().ok_or_else(|| {
            self.fallo(
                &format!("{puntero}/estilo/color"),
                Causa::Token,
                "Texto sin color",
                "Define color mediante un token $color.* en este nodo o su padre.",
            )
        })?;
        Ok(Texto {
            fragmentos,
            fuente,
            color,
        })
    }
    fn transiciones(&mut self, m: &BTreeMap<String, Value>, p: &str) -> Resultado<Transiciones> {
        let mut t = Transiciones::default();
        let mut pintadas = Pintadas::default();
        for (k, v) in m {
            let p = format!("{p}/{k}");
            let valor = self.transicion(v, &p)?;
            if let Some(i) = propiedad(k) {
                t.compuestas[i] = Some(valor);
            } else {
                match k.as_str() {
                    "fondo" => pintadas.fondo = Some(valor),
                    "color" => pintadas.color = Some(valor),
                    "borde" => pintadas.borde = Some(valor),
                    _ => {
                        return Err(self.fallo(
                            &p,
                            Causa::Transicion,
                            "Propiedad no animable",
                            "Usa una propiedad compuesta o fondo, color o borde.",
                        ));
                    }
                }
            }
        }
        t.pintadas = Arc::new(pintadas);
        Ok(t)
    }
    fn programa(&mut self, r: &Receta) -> Resultado<CabeceraPrograma> {
        let mut raiz = self.nodo(
            &r.raiz,
            &mut Vec::new(),
            "/raiz",
            &EstiloBase::default(),
            true,
            1,
        )?;
        raiz.entrada = r
            .entrada
            .as_ref()
            .map(|v| self.aparicion(v, "/entrada", true).map(Arc::new))
            .transpose()?;
        raiz.salida = r
            .salida
            .as_ref()
            .map(|v| self.aparicion(v, "/salida", false).map(Arc::new))
            .transpose()?;
        if let Err(p) = cuenta_maxima(&raiz, 1, &mut (0, 0)) {
            return Err(self.fallo(
                &p,
                Causa::Limite,
                "Arbol expandido fuera de limites",
                "Reduce a 256 capas y 4096 nodos; cada plantilla de lista cuenta 64 elementos.",
            ));
        }
        let visible = r
            .visible
            .as_ref()
            .map(|c| self.condicion(c, &Vec::new(), "/visible"))
            .transpose()?;
        let cambio = match self.sistema.mov.get("cambio_sistema") {
            Some(v) => self.transicion(v, "/sistema/mov/cambio_sistema")?,
            None => Transicion::PREDETERMINADA,
        };
        Ok((raiz, visible, cambio))
    }
}
fn cuenta_maxima(
    n: &NodoPrograma,
    multiplicidad: usize,
    cuenta: &mut (usize, usize),
) -> Result<(), Arc<str>> {
    cuenta.0 = cuenta
        .0
        .saturating_add(usize::from(n.capa).saturating_mul(multiplicidad));
    cuenta.1 = cuenta.1.saturating_add(multiplicidad);
    if cuenta.0 > 256 || cuenta.1 > 4096 {
        return Err(n.puntero.clone());
    }
    match &n.contenido {
        Contenido::Caja(hijos) => {
            for hijo in hijos {
                cuenta_maxima(hijo, multiplicidad, cuenta)?;
            }
        }
        Contenido::Lista { plantilla, .. } => {
            cuenta_maxima(plantilla, multiplicidad.saturating_mul(64), cuenta)?;
        }
        Contenido::Texto(_) => {}
    }
    Ok(())
}
fn campos_compilados(c: &BTreeMap<String, Campo>) -> Vec<(String, TipoModelo)> {
    c.iter()
        .map(|(k, v)| {
            (
                k.clone(),
                match v {
                    Campo::Simple(s) if s == "bool" => TipoModelo::Bool,
                    Campo::Simple(s) if s == "texto" => TipoModelo::Texto,
                    Campo::Simple(_) => TipoModelo::Numero,
                    Campo::Enumerado(e) => TipoModelo::Enum(e.r#enum.clone().into()),
                    Campo::Lista(l) => TipoModelo::Lista(campos_compilados(&l.lista)),
                },
            )
        })
        .collect()
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct FuenteDato {
    familia: String,
    peso: u16,
    tamano: f32,
    interlinea: f32,
    #[serde(default)]
    interletra: f32,
    #[serde(default)]
    tabulares: bool,
    #[serde(default)]
    mayusculas: bool,
}
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct DegradadoDato {
    lineal: LinealDato,
}
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct LinealDato {
    angulo: f64,
    paradas: Vec<(String, f32)>,
}
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct BordeDato {
    ancho: Value,
    color: String,
}
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct EfectoDato {
    sombra: SombraDato,
}
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct SombraDato {
    color: String,
    desenfoque: f32,
    #[serde(default)]
    x: f32,
    #[serde(default)]
    y: f32,
}
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct MuelleExterior {
    muelle: MuelleDato,
}
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct MuelleDato {
    rigidez: f32,
    amortiguacion: f32,
}
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct BezierDato {
    duracion: f32,
    #[serde(default)]
    retardo: f32,
    #[serde(default)]
    curva: Option<CurvaDato>,
}
#[derive(Deserialize)]
#[serde(untagged)]
enum CurvaDato {
    Nombre(String),
    Puntos([f32; 4]),
}
