//! Expansión acotada, resolución de estilos y flexbox.
use super::{
    ErrorModelo, Medidor,
    animacion::numero,
    capas::{self, Alineacion, Color, Dibujo, Fuente, Parada, Pintura, Propiedad},
};
use crate::receta::{Aparicion, Bucle, Nodo, Receta, Sistema};
use serde_json::Value;
use std::collections::{BTreeMap, BTreeSet};
use taffy::prelude::*;
#[derive(Clone)]
pub(crate) struct Plano {
    pub clave: String,
    pub padre: Option<String>,
    pub rect: capas::Rect,
    pub dibujos: Vec<Dibujo>,
    pub valores: Vec<(Propiedad, f32)>,
    pub transiciones: BTreeMap<String, Value>,
    pub entrada: Option<Aparicion>,
    pub salida: Option<Aparicion>,
    pub movimiento: Option<Value>,
    pub bucle: Option<Bucle>,
}
struct Expandido {
    clave: String,
    estilo: BTreeMap<String, Value>,
    texto: Option<String>,
    fuente: Fuente,
    hijos: Vec<Self>,
    capa: bool,
    transiciones: BTreeMap<String, Value>,
    entrada: Option<Aparicion>,
    salida: Option<Aparicion>,
    movimiento: Option<Value>,
    bucle: Option<Bucle>,
    layout: NodeId,
}
pub(crate) fn campo<'a>(modelo: &'a Value, ruta: &str) -> Option<&'a Value> {
    let mut v = modelo;
    for parte in ruta.split('.') {
        v = v.get(parte)?;
    }
    Some(v)
}
pub(crate) fn condicion(c: &str, m: &Value) -> bool {
    if let Some((ruta, v)) = c.split_once('=') {
        campo(m, ruta).and_then(Value::as_str) == Some(v)
    } else if let Some(r) = c.strip_prefix('!') {
        campo(m, r).and_then(Value::as_bool) == Some(false)
    } else {
        campo(m, c).and_then(Value::as_bool) == Some(true)
    }
}
fn comprobar_condicion(c: &str, m: &Value, p: &str) -> Result<bool, ErrorModelo> {
    let (ruta, enumerado) = c
        .split_once('=')
        .map_or((c.strip_prefix('!').unwrap_or(c), false), |(r, _)| {
            (r, true)
        });
    let v = campo(m, ruta).ok_or_else(|| ErrorModelo::enlace(p))?;
    if (enumerado && !v.is_string()) || (!enumerado && !v.is_boolean()) {
        return Err(ErrorModelo::enlace(p));
    }
    Ok(condicion(c, m))
}
fn enlazar(texto: &str, m: &Value, p: &str) -> Result<String, ErrorModelo> {
    let mut salida = String::new();
    let mut resto = texto;
    while let Some((antes, r)) = resto.split_once('{') {
        salida.push_str(antes);
        let (ruta, fin) = r.split_once('}').ok_or_else(|| ErrorModelo::enlace(p))?;
        let v = campo(m, ruta).ok_or_else(|| ErrorModelo::enlace(p))?;
        if let Some(s) = v.as_str() {
            salida.push_str(s);
        } else if v.is_number() || v.is_boolean() {
            salida.push_str(&v.to_string());
        } else {
            return Err(ErrorModelo::enlace(p));
        }
        if salida.chars().count() > 256 {
            return Err(ErrorModelo::limite(p));
        }
        resto = fin;
    }
    salida.push_str(resto);
    if salida.chars().count() > 256 {
        return Err(ErrorModelo::limite(p));
    }
    Ok(salida)
}
fn resolver(v: &Value, m: &Value, s: &Sistema, p: &str) -> Result<Value, ErrorModelo> {
    resolver_acotado(v, m, s, p, 0, &mut 0)
}
fn resolver_acotado(
    valor: &Value,
    modelo: &Value,
    sistema: &Sistema,
    puntero: &str,
    profundidad: usize,
    cantidad: &mut usize,
) -> Result<Value, ErrorModelo> {
    *cantidad += 1;
    if profundidad > 64 || *cantidad > 4096 {
        return Err(ErrorModelo::limite(puntero));
    }
    match valor {
        Value::String(t) if t.starts_with('{') && t.ends_with('}') => {
            campo(modelo, &t[1..t.len() - 1])
                .cloned()
                .ok_or_else(|| ErrorModelo::enlace(puntero))
        }
        Value::String(t) if t.starts_with('$') => {
            let resuelto = sistema
                .resolver(&Value::String(enlazar(t, modelo, puntero)?))
                .ok_or_else(|| ErrorModelo::enlace(puntero))?;
            resolver_acotado(
                &resuelto,
                modelo,
                sistema,
                puntero,
                profundidad + 1,
                cantidad,
            )
        }
        Value::Array(a) => a
            .iter()
            .map(|x| resolver_acotado(x, modelo, sistema, puntero, profundidad + 1, cantidad))
            .collect(),
        Value::Object(o) => o
            .iter()
            .map(|(k, x)| {
                resolver_acotado(x, modelo, sistema, puntero, profundidad + 1, cantidad)
                    .map(|valor| (k.clone(), valor))
            })
            .collect(),
        _ => Ok(valor.clone()),
    }
}
fn fuente(e: &BTreeMap<String, Value>) -> Result<Fuente, ErrorModelo> {
    let Some(v) = e.get("tipo") else {
        return Ok(Fuente {
            familia: "Inter".into(),
            peso: 400,
            tamano: 13.0,
            interletra: 0.0,
            interlinea: 18.0,
            tabulares: false,
            mayusculas: false,
        });
    };
    Ok(Fuente {
        familia: v["familia"]
            .as_str()
            .ok_or_else(|| ErrorModelo::enlace("tipo/familia"))?
            .into(),
        peso: serde_json::from_value(v["peso"].clone()).unwrap_or(400),
        tamano: numero(&v["tamano"], 13.0),
        interletra: numero(&v["interletra"], 0.0),
        interlinea: numero(&v["interlinea"], 18.0),
        tabulares: v["tabulares"].as_bool().unwrap_or(false),
        mayusculas: v["mayusculas"].as_bool().unwrap_or(false),
    })
}
struct Expansion<'a> {
    sistema: &'a Sistema,
    medidor: &'a dyn Medidor,
    tree: TaffyTree<()>,
    cantidad: usize,
}
impl Expansion<'_> {
    fn nodo(
        &mut self,
        n: &Nodo,
        m: &Value,
        clave: String,
        forzar: bool,
        prof: usize,
    ) -> Result<Expandido, ErrorModelo> {
        self.cantidad += 1;
        if self.cantidad > 4096 || prof > 32 {
            return Err(ErrorModelo::limite(&clave));
        }
        let mut estilos = n.estilo.valores();
        let mut bucle = n.bucle.clone();
        for estado in &n.estados {
            if comprobar_condicion(&estado.cuando, m, &format!("{clave}/estados/cuando"))? {
                estilos.extend(estado.estilo.valores());
                if estado.bucle.is_some() {
                    bucle = estado.bucle.clone();
                }
            }
        }
        if n.visible
            .as_ref()
            .map(|c| comprobar_condicion(c, m, &format!("{clave}/visible")))
            .transpose()?
            == Some(false)
        {
            estilos.insert("opacidad".into(), Value::from(0));
        }
        let estilos = estilos
            .iter()
            .map(|(k, v)| {
                resolver(v, m, self.sistema, &format!("{clave}/estilo/{k}")).map(|v| (k.clone(), v))
            })
            .collect::<Result<BTreeMap<_, _>, _>>()?;
        let fuente = fuente(&estilos)?;
        for (k, v) in &estilos {
            if propiedad(k).is_some()
                && !v
                    .as_f64()
                    .is_some_and(|n| n.is_finite() && (k != "opacidad" || (0.0..=1.0).contains(&n)))
            {
                return Err(ErrorModelo::enlace(&format!("{clave}/estilo/{k}")));
            }
        }
        let texto = n
            .texto
            .as_ref()
            .map(|t| enlazar(t, m, &format!("{clave}/texto")))
            .transpose()?
            .map(|t| {
                if fuente.mayusculas {
                    t.to_uppercase()
                } else {
                    t
                }
            });
        let mut hijos = Vec::new();
        if texto.as_ref().is_some_and(|t| t.chars().count() > 256) {
            return Err(ErrorModelo::limite(&format!("{clave}/texto")));
        }
        for (i, alto_texto) in n.hijos.iter().enumerate() {
            let key = alto_texto.id.clone().unwrap_or_else(|| i.to_string());
            hijos.push(self.nodo(alto_texto, m, format!("{clave}/{key}"), false, prof + 1)?);
        }
        self.lista(n, m, &clave, prof, &mut hijos)?;
        if bucle
            .as_ref()
            .and_then(|b| b.cuando.as_ref())
            .map(|c| comprobar_condicion(c, m, &format!("{clave}/bucle/cuando")))
            .transpose()?
            == Some(false)
        {
            bucle = None;
        }
        let mut estilo = estilo(&estilos);
        if let Some(t) = &texto {
            let (ancho_texto, alto_texto) = self.medidor.medir(t, &fuente);
            if !ancho_texto.is_finite()
                || !alto_texto.is_finite()
                || ancho_texto < 0.0
                || alto_texto < 0.0
            {
                return Err(ErrorModelo::layout(&format!("{clave}/texto")));
            }
            if !estilos.contains_key("ancho") {
                estilo.size.width = Dimension::length(ancho_texto);
            }
            if !estilos.contains_key("alto") {
                estilo.size.height = Dimension::length(alto_texto);
            }
        }
        let ids = hijos
            .iter()
            .map(|alto_texto| alto_texto.layout)
            .collect::<Vec<_>>();
        let layout = self
            .tree
            .new_with_children(estilo, &ids)
            .map_err(|_| ErrorModelo::layout(&clave))?;
        Ok(Expandido {
            clave,
            estilo: estilos,
            texto,
            fuente,
            hijos,
            capa: forzar
                || n.capa
                || n.visible.is_some()
                || n.estilo.valores().keys().any(|k| propiedad(k).is_some())
                || n.estados
                    .iter()
                    .any(|s| s.estilo.valores().keys().any(|k| propiedad(k).is_some()))
                || n.bucle.is_some()
                || n.estados.iter().any(|s| s.bucle.is_some())
                || n.transiciones.keys().any(|k| propiedad(k).is_some()),
            transiciones: n.transiciones.clone(),
            entrada: n.entrada.clone(),
            salida: n.salida.clone(),
            movimiento: n.movimiento.clone(),
            bucle,
            layout,
        })
    }
    fn lista(
        &mut self,
        n: &Nodo,
        m: &Value,
        clave: &str,
        prof: usize,
        hijos: &mut Vec<Expandido>,
    ) -> Result<(), ErrorModelo> {
        if n.tipo == "lista" {
            let lista =
                n.de.as_ref()
                    .and_then(|r| campo(m, r))
                    .and_then(Value::as_array)
                    .ok_or_else(|| ErrorModelo::enlace(&format!("{clave}/de")))?;
            if lista.len() > 64 {
                return Err(ErrorModelo::limite(&format!("{clave}/de")));
            }
            let alias = n.como.as_ref().ok_or_else(|| ErrorModelo::enlace(clave))?;
            let plantilla = n
                .plantilla
                .as_ref()
                .ok_or_else(|| ErrorModelo::enlace(clave))?;
            let mut claves = BTreeSet::new();
            for fila in lista {
                let key = n
                    .clave
                    .as_ref()
                    .and_then(|k| fila.get(k))
                    .filter(|v| v.is_string() || v.is_number())
                    .ok_or_else(|| ErrorModelo::enlace(&format!("{clave}/clave")))?
                    .to_string();
                if !claves.insert(key.clone()) {
                    return Err(ErrorModelo::identidad(clave));
                }
                let mut contexto = m.clone();
                contexto
                    .as_object_mut()
                    .ok_or_else(|| ErrorModelo::enlace(clave))?
                    .insert(alias.clone(), fila.clone());
                let mut h = self.nodo(
                    plantilla,
                    &contexto,
                    format!("{clave}/@{}", key.replace('~', "~0").replace('/', "~1")),
                    true,
                    prof + 1,
                )?;
                h.entrada = n.entrada.clone();
                h.salida = n.salida.clone();
                h.movimiento = n.movimiento.clone();
                hijos.push(h);
            }
        }
        Ok(())
    }
    fn planos(
        &self,
        n: &Expandido,
        padre: Option<&str>,
        offset: (f32, f32),
        salida: &mut Vec<Plano>,
        capa: usize,
    ) -> Result<(), ErrorModelo> {
        let l = self
            .tree
            .layout(n.layout)
            .map_err(|_| ErrorModelo::layout(&n.clave))?;
        let rect = capas::Rect {
            x: offset.0 + l.location.x,
            y: offset.1 + l.location.y,
            ancho: l.size.width,
            alto: l.size.height,
        };
        let propia = n.capa || padre.is_none();
        let indice = if propia {
            if salida.len() >= 256 {
                return Err(ErrorModelo::limite(&n.clave));
            }
            salida.push(Plano {
                clave: n.clave.clone(),
                padre: padre.map(str::to_owned),
                rect,
                dibujos: Vec::new(),
                valores: valores(&n.estilo),
                transiciones: n.transiciones.clone(),
                entrada: n.entrada.clone(),
                salida: n.salida.clone(),
                movimiento: n.movimiento.clone(),
                bucle: n.bucle.clone(),
            });
            salida.len() - 1
        } else {
            capa
        };
        let local = if propia { (0.0, 0.0) } else { (rect.x, rect.y) };
        let rect_dibujo = capas::Rect {
            x: local.0,
            y: local.1,
            ..rect
        };
        dibujos(n, rect_dibujo, &mut salida[indice].dibujos)?;
        for h in &n.hijos {
            self.planos(
                h,
                Some(&salida[indice].clave.clone()),
                local,
                salida,
                indice,
            )?;
        }
        Ok(())
    }
}
pub(crate) fn maquetar(
    r: &Receta,
    s: &Sistema,
    m: &Value,
    medidor: &dyn Medidor,
) -> Result<Vec<Plano>, ErrorModelo> {
    acotar_modelo(m, 0, &mut 0, &mut 0)?;
    if let Some(c) = &r.contrato_validado {
        validar_modelo(m, &c.campos, "", 0)?;
    }
    let mut x = Expansion {
        sistema: s,
        medidor,
        tree: TaffyTree::new(),
        cantidad: 0,
    };
    let mut raiz = x.nodo(&r.raiz, m, "/raiz".into(), true, 1)?;
    raiz.entrada = r.entrada.clone();
    raiz.salida = r.salida.clone();
    if r.visible
        .as_ref()
        .map(|c| comprobar_condicion(c, m, "/visible"))
        .transpose()?
        == Some(false)
    {
        raiz.estilo.insert("opacidad".into(), Value::from(0));
    }
    x.tree
        .compute_layout(
            raiz.layout,
            Size {
                width: AvailableSpace::MaxContent,
                height: AvailableSpace::MaxContent,
            },
        )
        .map_err(|_| ErrorModelo::layout("/raiz"))?;
    let mut planos = Vec::new();
    x.planos(&raiz, None, (0.0, 0.0), &mut planos, 0)?;
    Ok(planos)
}
fn validar_modelo(
    m: &Value,
    campos: &BTreeMap<String, crate::receta::Campo>,
    p: &str,
    prof: usize,
) -> Result<(), ErrorModelo> {
    use crate::receta::Campo;
    if prof > 32 {
        return Err(ErrorModelo::limite(p));
    }
    for (k, tipo) in campos {
        let p = format!("{p}/{k}");
        let dato = m.get(k).ok_or_else(|| ErrorModelo::enlace(&p))?;
        let valido = match tipo {
            Campo::Simple(t) => match t.as_str() {
                "bool" => dato.is_boolean(),
                "texto" => dato.is_string(),
                "numero" => dato.is_number(),
                _ => false,
            },
            Campo::Enumerado(e) => dato
                .as_str()
                .is_some_and(|s| e.r#enum.iter().any(|x| x == s)),
            Campo::Lista(l) => {
                let a = dato.as_array().ok_or_else(|| ErrorModelo::enlace(&p))?;
                if a.len() > 64 {
                    return Err(ErrorModelo::limite(&p));
                }
                for (i, fila) in a.iter().enumerate() {
                    validar_modelo(fila, &l.lista, &format!("{p}/{i}"), prof + 1)?;
                }
                true
            }
        };
        if !valido {
            return Err(ErrorModelo::enlace(&p));
        }
    }
    Ok(())
}
fn acotar_modelo(
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
                acotar_modelo(v, prof + 1, cuenta, bytes)?;
            }
        }
        Value::Array(a) => {
            for v in a {
                acotar_modelo(v, prof + 1, cuenta, bytes)?;
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
pub(crate) fn propiedad(s: &str) -> Option<Propiedad> {
    match s {
        "opacidad" => Some(Propiedad::Opacidad),
        "x" => Some(Propiedad::X),
        "y" => Some(Propiedad::Y),
        "escala" => Some(Propiedad::Escala),
        "giro" => Some(Propiedad::Giro),
        _ => None,
    }
}
pub(crate) fn nombre(p: Propiedad) -> &'static str {
    match p {
        Propiedad::Opacidad => "opacidad",
        Propiedad::X => "x",
        Propiedad::Y => "y",
        Propiedad::Escala => "escala",
        Propiedad::Giro => "giro",
    }
}
fn valores(e: &BTreeMap<String, Value>) -> Vec<(Propiedad, f32)> {
    [
        Propiedad::Opacidad,
        Propiedad::X,
        Propiedad::Y,
        Propiedad::Escala,
        Propiedad::Giro,
    ]
    .into_iter()
    .map(|p| {
        let defecto = if matches!(p, Propiedad::Opacidad | Propiedad::Escala) {
            1.0
        } else {
            0.0
        };
        (p, e.get(nombre(p)).map_or(defecto, |v| numero(v, defecto)))
    })
    .collect()
}
fn valor<'a>(e: &'a BTreeMap<String, Value>, k: &str) -> Option<&'a str> {
    e.get(k).and_then(Value::as_str)
}
fn dim(v: Option<&Value>) -> Dimension {
    match v.and_then(Value::as_str) {
        Some("100%") => Dimension::percent(1.0),
        Some("auto") => Dimension::auto(),
        _ => v.map_or(Dimension::auto(), |v| Dimension::length(numero(v, 0.0))),
    }
}
fn longitud(v: Option<&Value>) -> LengthPercentageAuto {
    match v.and_then(Value::as_str) {
        Some("100%") => LengthPercentageAuto::percent(1.0),
        Some("auto") => LengthPercentageAuto::auto(),
        _ => v.map_or(LengthPercentageAuto::auto(), |v| {
            LengthPercentageAuto::length(numero(v, 0.0))
        }),
    }
}
fn lados(v: Option<&Value>) -> [f32; 4] {
    let Some(v) = v else { return [0.0; 4] };
    if let Some(a) = v.as_array() {
        let n = |i| a.get(i).map_or(0.0, |x| numero(x, 0.0));
        match a.len() {
            1 => [n(0); 4],
            2 => [n(0), n(1), n(0), n(1)],
            4 => [n(0), n(1), n(2), n(3)],
            _ => [0.0; 4],
        }
    } else {
        [numero(v, 0.0); 4]
    }
}
fn estilo(e: &BTreeMap<String, Value>) -> Style {
    let pad = lados(e.get("relleno"));
    let align = match valor(e, "alinear") {
        Some("centro") => AlignItems::CENTER,
        Some("fin") => AlignItems::FLEX_END,
        Some("inicio") => AlignItems::FLEX_START,
        _ => AlignItems::STRETCH,
    };
    let inset = |k: &str| match e.get(k) {
        None => LengthPercentageAuto::auto(),
        Some(v) if v.as_str() == Some("100%") => LengthPercentageAuto::percent(1.0),
        Some(v) => LengthPercentageAuto::length(numero(v, 0.0)),
    };
    Style {
        size: Size {
            width: dim(e.get("ancho")),
            height: dim(e.get("alto")),
        },
        min_size: Size {
            width: longitud(e.get("min_ancho")),
            height: LengthPercentageAuto::auto(),
        },
        max_size: Size {
            width: longitud(e.get("max_ancho")),
            height: LengthPercentageAuto::auto(),
        },
        flex_direction: if valor(e, "direccion") == Some("fila") {
            FlexDirection::Row
        } else {
            FlexDirection::Column
        },
        align_items: align,
        justify_content: match valor(e, "justificar") {
            Some("centro") => JustifyContent::CENTER,
            Some("fin") => JustifyContent::FLEX_END,
            Some("entre") => JustifyContent::SPACE_BETWEEN,
            _ => JustifyContent::FLEX_START,
        },
        gap: Size {
            width: LengthPercentage::length(e.get("hueco").map_or(0.0, |v| numero(v, 0.0))),
            height: LengthPercentage::length(e.get("hueco").map_or(0.0, |v| numero(v, 0.0))),
        },
        padding: Rect {
            top: LengthPercentage::length(pad[0]),
            right: LengthPercentage::length(pad[1]),
            bottom: LengthPercentage::length(pad[2]),
            left: LengthPercentage::length(pad[3]),
        },
        position: if valor(e, "posicion") == Some("absoluta") {
            Position::Absolute
        } else {
            Position::Relative
        },
        inset: Rect {
            top: inset("arriba"),
            right: inset("derecha"),
            bottom: inset("abajo"),
            left: inset("izquierda"),
        },
        flex_grow: e.get("crecer").map_or(0.0, |v| numero(v, 0.0)),
        flex_shrink: e.get("encoger").map_or(1.0, |v| numero(v, 1.0)),
        ..Style::default()
    }
}
fn color(v: &Value) -> Result<Color, ErrorModelo> {
    let s = v
        .as_str()
        .and_then(|s| s.strip_prefix('#'))
        .filter(|s| s.len() == 6 || s.len() == 8)
        .ok_or_else(|| ErrorModelo::enlace("color"))?;
    let canal = |i| {
        u8::from_str_radix(&s[i..i + 2], 16)
            .map(|x| f32::from(x) / 255.0)
            .map_err(|_| ErrorModelo::enlace("color"))
    };
    if !s.is_ascii() {
        return Err(ErrorModelo::enlace("color"));
    }
    Ok(Color {
        r: canal(0)?,
        g: canal(2)?,
        b: canal(4)?,
        a: if s.len() == 8 { canal(6)? } else { 1.0 },
    })
}
fn pintura(v: &Value) -> Result<Pintura, ErrorModelo> {
    if v.is_string() {
        return color(v).map(Pintura::Solido);
    }
    let g = &v["lineal"];
    let ang = numero(&g["angulo"], 90.0).to_radians();
    let (s, c) = ang.sin_cos();
    let paradas = g["paradas"]
        .as_array()
        .ok_or_else(|| ErrorModelo::enlace("lineal/paradas"))?
        .iter()
        .map(|v| {
            Ok(Parada {
                posicion: numero(&v[1], 0.0),
                color: color(&v[0])?,
            })
        })
        .collect::<Result<Vec<_>, ErrorModelo>>()?;
    Ok(Pintura::Lineal {
        desde: (0.5 - s * 0.5, 0.5 + c * 0.5),
        hasta: (0.5 + s * 0.5, 0.5 - c * 0.5),
        paradas,
    })
}
fn dibujos(n: &Expandido, rect: capas::Rect, out: &mut Vec<Dibujo>) -> Result<(), ErrorModelo> {
    let e = &n.estilo;
    let radios = lados(e.get("radio"));
    if let Some(s) = e.get("sombra").and_then(|v| v.get("sombra")) {
        out.push(Dibujo::Sombra {
            rect,
            radios,
            color: color(&s["color"])?,
            desenfoque: numero(&s["desenfoque"], 0.0),
            desplazamiento: (numero(&s["x"], 0.0), numero(&s["y"], 0.0)),
        });
    }
    let relleno = e.get("fondo").map(pintura).transpose()?;
    let borde = e
        .get("borde")
        .map(|b| pintura(&b["color"]).map(|p| (numero(&b["ancho"], 0.0), p)))
        .transpose()?;
    if relleno.is_some() || borde.is_some() {
        out.push(Dibujo::Rect {
            rect,
            radios,
            relleno,
            borde,
        });
    }
    if let Some(t) = &n.texto {
        out.push(Dibujo::Texto {
            caja: rect,
            texto: t.clone(),
            fuente: n.fuente.clone(),
            color: e.get("color").map(color).transpose()?.unwrap_or(Color {
                r: 1.0,
                g: 1.0,
                b: 1.0,
                a: 1.0,
            }),
            alineacion: match valor(e, "alinear_texto") {
                Some("centro") => Alineacion::Centro,
                Some("fin") => Alineacion::Fin,
                _ => Alineacion::Inicio,
            },
        });
    }
    Ok(())
}
