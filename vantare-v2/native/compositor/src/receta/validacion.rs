//! Validación acumulativa con ubicación y reparación para cada diagnóstico.
use super::{Campo, Contrato, Nodo, Receta, Sistema};
use serde_json::Value;
use std::collections::{BTreeMap, BTreeSet};
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Causa {
    Json,
    CampoDesconocido,
    Version,
    NoSoportado,
    Token,
    Ciclo,
    Medida,
    Enlace,
    Condicion,
    Lista,
    Identidad,
    Transicion,
    Limite,
    Fuente,
    Tipo,
}
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Diagnostico {
    pub fichero: String,
    pub puntero: String,
    pub causa: Causa,
    pub detalle: String,
    pub solucion: String,
}
impl std::fmt::Display for Diagnostico {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(
            f,
            "{}:{}: {}. {}",
            self.fichero, self.puntero, self.detalle, self.solucion
        )
    }
}
#[derive(Clone, Debug)]
pub struct Carga {
    pub receta: Receta,
    pub sistema: Sistema,
    pub contrato: Contrato,
    pub avisos: Vec<Diagnostico>,
}
struct Validador<'a> {
    fichero: &'a str,
    sistema: &'a Sistema,
    errores: Vec<Diagnostico>,
    avisos: Vec<Diagnostico>,
    nodos: usize,
    capas: usize,
}
impl Validador<'_> {
    fn error(&mut self, p: &str, causa: Causa, detalle: &str, solucion: &str) {
        if self
            .errores
            .iter()
            .any(|e| e.puntero == p && e.causa == causa && e.fichero == self.fichero)
        {
            return;
        }
        self.errores.push(Diagnostico {
            fichero: self.fichero.into(),
            puntero: p.into(),
            causa,
            detalle: detalle.into(),
            solucion: solucion.into(),
        });
    }
    fn condicion(&mut self, c: &str, p: &str, campos: &BTreeMap<String, Campo>) {
        let (ruta, valor) = c
            .split_once('=')
            .map_or((c.strip_prefix('!').unwrap_or(c), None), |(a, b)| {
                (a, Some(b))
            });
        let valido = match (campos.get(ruta), valor) {
            (Some(Campo::Simple(t)), None) => t == "bool",
            (Some(Campo::Enumerado(e)), Some(v)) => e.r#enum.iter().any(|x| x == v),
            _ => false,
        };
        if !valido {
            self.error(
                p,
                Causa::Condicion,
                "Condición incompatible con el contrato",
                "Usa un campo bool o campo=valor con un valor de su enum.",
            );
        }
    }
    fn enlace(&mut self, s: &str, p: &str, campos: &BTreeMap<String, Campo>) {
        let mut resto = s;
        while let Some((_, r)) = resto.split_once('{') {
            let Some((ruta, fin)) = r.split_once('}') else {
                self.error(
                    p,
                    Causa::Enlace,
                    "Enlace sin cierre",
                    "Cierra el enlace con }.",
                );
                return;
            };
            if !matches!(
                campos.get(ruta),
                Some(Campo::Simple(_) | Campo::Enumerado(_))
            ) {
                self.error(
                    p,
                    Causa::Enlace,
                    "Campo de enlace inexistente o no escalar",
                    "Declara el campo escalar en el contrato y usa su ruta exacta.",
                );
            }
            resto = fin;
        }
    }
    fn token(&mut self, s: &str, p: &str, prefijo: Option<&str>, campos: &BTreeMap<String, Campo>) {
        if !s.starts_with('$') || prefijo.is_some_and(|pre| !s.starts_with(pre)) {
            self.error(
                p,
                Causa::Token,
                "Se necesita un token del tipo correcto",
                "Usa un token existente $color.*, $tipo.*, $mov.* o $efecto.* según la propiedad.",
            );
            return;
        }
        if let Some((antes, r)) = s.split_once('{') {
            let Some((ruta, despues)) = r.split_once('}') else {
                self.enlace(s, p, campos);
                return;
            };
            if despues.contains('{') {
                self.error(
                    p,
                    Causa::Enlace,
                    "Token con varios enlaces",
                    "Usa un único campo enum por token.",
                );
                return;
            }
            match campos.get(ruta) {
                Some(Campo::Enumerado(e)) => {
                    for v in &e.r#enum {
                        self.token(&format!("{antes}{v}{despues}"), p, prefijo, campos);
                    }
                }
                _ => self.error(
                    p,
                    Causa::Enlace,
                    "Token dinámico sin enum",
                    "Declara el campo como enum y un token por cada valor.",
                ),
            }
        } else if self.sistema.token(s).is_none() {
            self.error(
                p,
                Causa::Token,
                "Token inexistente",
                "Añade el token al sistema o corrige su ruta.",
            );
        } else if self.sistema.resolver(&Value::String(s.into())).is_none()
            || ciclo_token(
                self.sistema,
                s,
                &mut BTreeSet::new(),
                &mut BTreeSet::new(),
                0,
            )
        {
            self.error(
                p,
                Causa::Ciclo,
                "Referencia circular entre tokens",
                "Rompe el ciclo con un valor final en el sistema.",
            );
        }
    }
    fn medida(&mut self, v: &Value, p: &str, campos: &BTreeMap<String, Campo>) {
        if let Some(a) = v.as_array() {
            if ![1, 2, 4].contains(&a.len()) {
                self.error(
                    p,
                    Causa::Medida,
                    "Número de valores incorrecto",
                    "Usa uno, dos o cuatro valores.",
                );
            }
            for (i, x) in a.iter().enumerate() {
                self.medida(x, &format!("{p}/{i}"), campos);
            }
        } else if v.as_f64() == Some(0.0) || matches!(v.as_str(), Some("auto" | "100%")) {
        } else if let Some(s) = v.as_str().filter(|s| {
            s.starts_with('$')
                && !["$color.", "$tipo.", "$mov.", "$efecto."]
                    .iter()
                    .any(|pre| s.starts_with(pre))
        }) {
            self.token(s, p, None, campos);
        } else {
            self.error(p,Causa::Medida,"Medida fija no admitida", "Define la medida en el sistema y usa $medida.nombre; también se admite 0, auto o 100%.");
        }
    }
    fn pintura(&mut self, v: &Value, p: &str, campos: &BTreeMap<String, Campo>) {
        if let Some(s) = v.as_str() {
            self.token(s, p, Some("$color."), campos);
        } else if let Some(g) = v.get("lineal") {
            desconocidos(
                g,
                &["angulo", "paradas"],
                self.fichero,
                &format!("{p}/lineal"),
                &mut self.errores,
            );
            if let Some(a) = g.get("paradas").and_then(Value::as_array) {
                if a.len() < 2 {
                    self.error(
                        p,
                        Causa::Tipo,
                        "Degradado sin dos paradas",
                        "Añade al menos dos paradas con color y posición 0..1.",
                    );
                }
                let mut anterior = 0.0;
                for (i, parada) in a.iter().enumerate() {
                    if let Some(color) = parada.get(0) {
                        self.pintura(color, &format!("{p}/lineal/paradas/{i}/0"), campos);
                    }
                    let posicion = parada.get(1).and_then(Value::as_f64);
                    if !posicion.is_some_and(|x| (anterior..=1.0).contains(&x)) {
                        self.error(
                            p,
                            Causa::Tipo,
                            "Paradas fuera de orden o rango",
                            "Ordena las posiciones del degradado de 0 a 1.",
                        );
                    }
                    anterior = posicion.unwrap_or(anterior);
                }
            } else {
                self.error(
                    p,
                    Causa::Tipo,
                    "Faltan paradas",
                    "Añade lineal.paradas con pares [token, posición].",
                );
            }
        } else {
            self.error(
                p,
                Causa::Token,
                "Color fijo o pintura desconocida",
                "Usa $color.nombre o un degradado lineal con tokens.",
            );
        }
    }
    fn estilo(&mut self, e: &super::Estilo, p: &str, campos: &BTreeMap<String, Campo>) {
        for (k, v) in e.valores() {
            let p = format!("{p}/{k}");
            match k.as_str() {
                "fondo" | "color" => self.pintura(&v, &p, campos),
                "tipo" | "sombra" => self.token(
                    v.as_str().unwrap_or(""),
                    &p,
                    Some(if k == "tipo" { "$tipo." } else { "$efecto." }),
                    campos,
                ),
                "borde" => {
                    desconocidos(&v, &["ancho", "color"], self.fichero, &p, &mut self.errores);
                    self.medida(&v["ancho"], &format!("{p}/ancho"), campos);
                    self.pintura(&v["color"], &format!("{p}/color"), campos);
                }
                "opacidad" | "x" | "y" | "escala" | "giro" => {
                    if let Some(s) = v
                        .as_str()
                        .filter(|s| s.starts_with('{') && s.ends_with('}'))
                    {
                        let ruta = &s[1..s.len() - 1];
                        if !matches!(campos.get(ruta),Some(Campo::Simple(t)) if t=="numero") {
                            self.error(
                                &p,
                                Causa::Enlace,
                                "La propiedad necesita numero",
                                "Enlaza un campo numero del contrato.",
                            );
                        }
                    } else if !v.as_f64().is_some_and(|x| {
                        x.is_finite() && (k != "opacidad" || (0.0..=1.0).contains(&x))
                    }) {
                        self.error(
                            &p,
                            Causa::Tipo,
                            "Valor compuesto fuera de rango",
                            "Usa un número finito; opacidad debe estar entre 0 y 1.",
                        );
                    }
                }
                "direccion" | "alinear" | "justificar" | "posicion" | "alinear_texto" => {
                    let opciones: &[&str] = match k.as_str() {
                        "direccion" => &["fila", "columna"],
                        "posicion" => &["relativa", "absoluta"],
                        "alinear" => &["inicio", "centro", "fin", "estirar"],
                        "justificar" => &["inicio", "centro", "fin", "entre"],
                        _ => &["inicio", "centro", "fin"],
                    };
                    if !v.as_str().is_some_and(|s| opciones.contains(&s)) {
                        self.error(
                            &p,
                            Causa::Tipo,
                            "Valor de estilo desconocido",
                            "Usa una de las opciones enumeradas en RECETA.md.",
                        );
                    }
                }
                "crecer" | "encoger" => {
                    if !v.as_f64().is_some_and(|x| x >= 0.0) {
                        self.error(
                            &p,
                            Causa::Tipo,
                            "Factor flex negativo",
                            "Usa un factor mayor o igual a cero.",
                        );
                    }
                }
                "radio" if v.as_array().is_some_and(|a| !matches!(a.len(), 1 | 4)) => self.error(
                    &p,
                    Causa::Medida,
                    "Radio con número de valores incorrecto",
                    "Usa uno o cuatro radios; dos valores solo se admiten en relleno.",
                ),
                _ => self.medida(&v, &p, campos),
            }
        }
    }
    fn transicion(&mut self, v: &Value, p: &str) {
        let resuelto = if let Some(s) = v.as_str() {
            self.token(s, p, Some("$mov."), &BTreeMap::new());
            self.sistema.resolver(v)
        } else {
            Some(v.clone())
        };
        let Some(v) = resuelto else { return };
        desconocidos(
            &v,
            &["duracion", "retardo", "curva", "muelle"],
            self.fichero,
            p,
            &mut self.errores,
        );
        let valido = if let Some(m) = v.get("muelle") {
            desconocidos(
                m,
                &["rigidez", "amortiguacion"],
                self.fichero,
                &format!("{p}/muelle"),
                &mut self.errores,
            );
            ["rigidez", "amortiguacion"]
                .iter()
                .all(|k| m[*k].as_f64().is_some_and(|x| x > 0.0 && x <= 10000.0))
                && muelle_asentado(
                    m["rigidez"].as_f64().unwrap_or(0.0),
                    m["amortiguacion"].as_f64().unwrap_or(0.0),
                )
        } else {
            let dur = v["duracion"].as_f64();
            let ret = v.get("retardo").and_then(Value::as_f64).unwrap_or(0.0);
            let curva = v.get("curva");
            v.get("retardo").is_none_or(Value::is_number)
                && dur.is_some_and(|x| {
                    (0.0..=10000.0).contains(&x) && ret >= 0.0 && x + ret <= 10000.0
                })
                && curva.is_none_or(|c| {
                    matches!(
                        c.as_str(),
                        Some("lineal" | "entrada" | "salida" | "entrada-salida")
                    ) || c.as_array().is_some_and(|a| {
                        a.len() == 4
                            && a.iter().all(Value::is_number)
                            && [0, 2]
                                .iter()
                                .all(|i| a[*i].as_f64().is_some_and(|n| (0.0..=1.0).contains(&n)))
                    })
                })
        };
        if !valido {
            self.error(p,Causa::Transicion,"Transición inválida o superior a 10 s", "Usa duración y retardo positivos que sumen ≤10000 ms y una curva CSS válida, o un muelle con rigidez y amortiguación positivas.");
        }
    }
    fn bucle(&mut self, b: &super::Bucle, p: &str, campos: &BTreeMap<String, Campo>) {
        if !compuesta(&b.propiedad)
            || b.valores.len() < 2
            || b.valores.len() > 64
            || !(0.0..=10000.0).contains(&b.duracion)
            || b.duracion <= 0.0
            || b.valores
                .iter()
                .any(|x| !x.is_finite() || (b.propiedad == "opacidad" && !(0.0..=1.0).contains(x)))
        {
            self.error(
                p,
                Causa::Transicion,
                "Bucle inválido",
                "Usa una propiedad compuesta, 2..64 valores y duración 1..10000 ms; opacidad 0..1.",
            );
        }
        if let Some(c) = &b.cuando {
            self.condicion(c, &format!("{p}/cuando"), campos);
        }
    }
    fn aparicion(&mut self, a: &super::Aparicion, p: &str) {
        for (lado, m) in [("desde", &a.desde), ("hacia", &a.hacia)] {
            for (k, v) in m {
                if !compuesta(k) || !v.is_finite() || (k == "opacidad" && !(0.0..=1.0).contains(v))
                {
                    self.error(
                        &format!("{p}/{lado}/{k}"),
                        Causa::Transicion,
                        "Propiedad de aparición inválida",
                        "Usa opacidad, x, y, escala o giro con un valor finito.",
                    );
                }
            }
        }
        if let Some(t) = &a.transicion {
            self.transicion(t, &format!("{p}/transicion"));
        }
    }
    fn nodo(&mut self, n: &Nodo, p: &str, campos: &BTreeMap<String, Campo>, prof: usize) {
        self.nodos += 1;
        if p == "/raiz" || n.capa || n.transiciones.keys().any(|k| compuesta(k)) {
            self.capas += 1;
        }
        if self.capas > 256 {
            self.error(
                p,
                Causa::Limite,
                "Demasiadas capas",
                "Reduce el diseño a 256 capas, contando la raíz y las capas de las listas.",
            );
            return;
        }
        if prof > 32 || self.nodos > 512 {
            self.error(
                p,
                Causa::Limite,
                "Receta demasiado grande o profunda",
                "Reduce la receta a 512 nodos y 32 niveles.",
            );
            return;
        }
        if !["caja", "texto", "lista"].contains(&n.tipo.as_str()) {
            self.error(
                &format!("{p}/tipo"),
                Causa::Tipo,
                "Tipo de nodo desconocido",
                "Usa caja, texto o lista.",
            );
        }
        for (k, invalido) in [
            ("texto", n.tipo != "texto" && n.texto.is_some()),
            ("hijos", n.tipo != "caja" && !n.hijos.is_empty()),
            (
                "de",
                n.tipo != "lista"
                    && (n.de.is_some()
                        || n.como.is_some()
                        || n.clave.is_some()
                        || n.plantilla.is_some()),
            ),
        ] {
            if invalido {
                self.error(
                    &format!("{p}/{k}"),
                    Causa::Tipo,
                    "Campo incompatible con el tipo de nodo",
                    "Conserva solo los campos propios de caja, texto o lista según RECETA.md.",
                );
            }
        }
        if let Some(id) = &n.id {
            if !identificador(id) {
                self.error(
                    &format!("{p}/id"),
                    Causa::Identidad,
                    "Identificador inválido",
                    "Usa [a-z][a-z0-9_]*.",
                );
            }
        }
        self.estilo(&n.estilo, &format!("{p}/estilo"), campos);
        if let Some(c) = &n.visible {
            self.condicion(c, &format!("{p}/visible"), campos);
        }
        if let Some(t) = &n.texto {
            self.enlace(t, &format!("{p}/texto"), campos);
            if t.chars().count() > 256 {
                self.error(
                    &format!("{p}/texto"),
                    Causa::Limite,
                    "Texto demasiado largo",
                    "Reduce el texto a 256 caracteres.",
                );
            }
        }
        if n.tipo == "texto" && n.texto.is_none() {
            self.error(
                &format!("{p}/texto"),
                Causa::Tipo,
                "Falta texto",
                "Añade texto al nodo texto.",
            );
        }
        self.transiciones_nodo(n, p);
        for (i, e) in n.estados.iter().enumerate() {
            let p = format!("{p}/estados/{i}");
            self.condicion(&e.cuando, &format!("{p}/cuando"), campos);
            self.estilo(&e.estilo, &format!("{p}/estilo"), campos);
            if let Some(b) = &e.bucle {
                self.bucle(b, &format!("{p}/bucle"), campos);
            }
        }
        if let Some(b) = &n.bucle {
            self.bucle(b, &format!("{p}/bucle"), campos);
        }
        for (k, a) in [("entrada", &n.entrada), ("salida", &n.salida)] {
            if let Some(a) = a {
                self.aparicion(a, &format!("{p}/{k}"));
            }
        }
        if let Some(t) = &n.movimiento {
            self.transicion(t, &format!("{p}/movimiento"));
        }
        let mut ids = BTreeSet::new();
        for (i, h) in n.hijos.iter().enumerate() {
            let p = format!("{p}/hijos/{i}");
            if h.id.as_ref().is_some_and(|id| !ids.insert(id)) {
                self.error(
                    &format!("{p}/id"),
                    Causa::Identidad,
                    "Id repetido entre hermanos",
                    "Asigna un id distinto a cada hermano.",
                );
            }
            self.nodo(h, &p, campos, prof + 1);
        }
        self.lista(n, p, campos, prof);
    }
    fn transiciones_nodo(&mut self, n: &Nodo, p: &str) {
        for (k, v) in &n.transiciones {
            let p = format!("{p}/transiciones/{k}");
            if !compuesta(k) && !["fondo", "color", "borde"].contains(&k.as_str()) {
                self.error(
                    &p,
                    Causa::Transicion,
                    "Propiedad no animable",
                    "Usa una propiedad compuesta o fondo, color, borde.",
                );
            }
            self.transicion(v, &p);
            if ["fondo", "color", "borde"].contains(&k.as_str()) {
                self.avisos.push(Diagnostico {
                    fichero: self.fichero.into(),
                    puntero: p,
                    causa: Causa::Transicion,
                    detalle: "Esta transición repinta cada fotograma".into(),
                    solucion: "Superpón una capa con el color final y anima su opacidad.".into(),
                });
            }
        }
    }
    fn lista(&mut self, n: &Nodo, p: &str, campos: &BTreeMap<String, Campo>, prof: usize) {
        if n.tipo == "lista" {
            let elemento = n.de.as_ref().and_then(|de| campos.get(de));
            if let Some(Campo::Lista(lista)) = elemento {
                if !n.clave.as_ref().is_some_and(|k|matches!(lista.lista.get(k),Some(Campo::Simple(t)) if t=="texto" || t=="numero")) {self.error(&format!("{p}/clave"),Causa::Identidad,"Clave inexistente o no escalar", "Usa un campo texto o numero del elemento como clave estable.");}
                let alias = n.como.as_deref().unwrap_or("");
                if !identificador(alias)
                    || campos
                        .keys()
                        .any(|k| k == alias || k.starts_with(&format!("{alias}.")))
                {
                    self.error(
                        &format!("{p}/como"),
                        Causa::Lista,
                        "Alias inválido o en colisión",
                        "Elige un alias nuevo con formato [a-z][a-z0-9_]*.",
                    );
                }
                let mut ampliados = campos.clone();
                for (k, v) in &lista.lista {
                    ampliados.insert(format!("{alias}.{k}"), v.clone());
                }
                if let Some(t) = &n.plantilla {
                    self.nodo(t, &format!("{p}/plantilla"), &ampliados, prof + 1);
                } else {
                    self.error(
                        &format!("{p}/plantilla"),
                        Causa::Lista,
                        "Falta plantilla",
                        "Añade un nodo plantilla para los elementos.",
                    );
                }
            } else {
                self.error(
                    &format!("{p}/de"),
                    Causa::Lista,
                    "Origen no es una lista",
                    "Usa la ruta de un campo lista del contrato.",
                );
            }
        }
    }
}
pub(crate) fn compuesta(p: &str) -> bool {
    matches!(p, "opacidad" | "x" | "y" | "escala" | "giro")
}
fn identificador(s: &str) -> bool {
    let mut c = s.chars();
    c.next().is_some_and(|x| x.is_ascii_lowercase())
        && c.all(|x| x.is_ascii_lowercase() || x.is_ascii_digit() || x == '_')
}
fn diagnostico(f: &str, p: &str, causa: Causa, d: &str, s: &str) -> Diagnostico {
    Diagnostico {
        fichero: f.into(),
        puntero: p.into(),
        causa,
        detalle: d.into(),
        solucion: s.into(),
    }
}
fn desconocidos(v: &Value, permitidos: &[&str], f: &str, p: &str, e: &mut Vec<Diagnostico>) {
    if let Some(m) = v.as_object() {
        for k in m.keys() {
            if !permitidos.contains(&k.as_str()) {
                e.push(diagnostico(
                    f,
                    &format!("{p}/{}", k.replace('~', "~0").replace('/', "~1")),
                    Causa::CampoDesconocido,
                    "Campo desconocido",
                    "Retira el campo o usa un nombre de RECETA.md.",
                ));
            }
        }
    }
}
fn forma_nodo(v: &Value, f: &str, p: &str, e: &mut Vec<Diagnostico>, prof: usize) {
    if prof > 32 {
        e.push(diagnostico(
            f,
            p,
            Causa::Limite,
            "Profundidad excesiva",
            "Reduce el árbol a 32 niveles.",
        ));
        return;
    }
    desconocidos(
        v,
        &[
            "tipo",
            "id",
            "estilo",
            "estados",
            "transiciones",
            "capa",
            "visible",
            "hijos",
            "texto",
            "de",
            "como",
            "clave",
            "plantilla",
            "entrada",
            "salida",
            "movimiento",
            "bucle",
        ],
        f,
        p,
        e,
    );
    if let Some(a) = v["hijos"].as_array() {
        for (i, h) in a.iter().enumerate() {
            forma_nodo(h, f, &format!("{p}/hijos/{i}"), e, prof + 1);
        }
    }
    if let Some(t) = v.get("plantilla") {
        forma_nodo(t, f, &format!("{p}/plantilla"), e, prof + 1);
    }
    if let Some(s) = v.get("estilo") {
        forma_estilo(s, f, &format!("{p}/estilo"), e);
    }
    for k in ["entrada", "salida"] {
        if let Some(a) = v.get(k) {
            desconocidos(
                a,
                &["desde", "hacia", "transicion"],
                f,
                &format!("{p}/{k}"),
                e,
            );
        }
    }
    if let Some(b) = v.get("bucle") {
        desconocidos(
            b,
            &["propiedad", "valores", "duracion", "cuando"],
            f,
            &format!("{p}/bucle"),
            e,
        );
    }
    if let Some(a) = v["estados"].as_array() {
        for (i, s) in a.iter().enumerate() {
            let p = format!("{p}/estados/{i}");
            desconocidos(s, &["cuando", "estilo", "bucle"], f, &p, e);
            if let Some(b) = s.get("bucle") {
                desconocidos(
                    b,
                    &["propiedad", "valores", "duracion", "cuando"],
                    f,
                    &format!("{p}/bucle"),
                    e,
                );
            }
            if let Some(v) = s.get("estilo") {
                forma_estilo(v, f, &format!("{p}/estilo"), e);
            }
        }
    }
}
fn forma_estilo(v: &Value, f: &str, p: &str, e: &mut Vec<Diagnostico>) {
    desconocidos(
        v,
        &[
            "ancho",
            "alto",
            "min_ancho",
            "max_ancho",
            "direccion",
            "alinear",
            "justificar",
            "hueco",
            "relleno",
            "crecer",
            "encoger",
            "posicion",
            "arriba",
            "izquierda",
            "derecha",
            "abajo",
            "fondo",
            "borde",
            "radio",
            "sombra",
            "opacidad",
            "tipo",
            "color",
            "alinear_texto",
            "x",
            "y",
            "escala",
            "giro",
        ],
        f,
        p,
        e,
    );
}
fn leer<T: serde::de::DeserializeOwned>(f: &str, s: &str) -> Result<T, Vec<Diagnostico>> {
    if s.len() > 256 * 1024 {
        return Err(vec![diagnostico(
            f,
            "",
            Causa::Limite,
            "Fichero mayor de 256 KiB",
            "Divide el diseño o reduce el fichero a 256 KiB.",
        )]);
    }
    serde_json::from_str(s).map_err(|e| {
        vec![diagnostico(
            f,
            "",
            Causa::Json,
            &e.to_string(),
            "Corrige la sintaxis y los tipos según RECETA.md.",
        )]
    })
}
/// Carga los tres documentos y acumula los diagnósticos semánticos.
pub fn cargar(
    receta: (&str, &str),
    sistema: (&str, &str),
    modelo: (&str, &str),
) -> Result<Carga, Vec<Diagnostico>> {
    cargar_con_fuentes(receta, sistema, modelo, &["Inter"])
}
/// El anfitrión proporciona las familias que realmente incluye su paquete.
pub fn cargar_con_fuentes(
    receta: (&str, &str),
    sistema: (&str, &str),
    modelo: (&str, &str),
    fuentes: &[&str],
) -> Result<Carga, Vec<Diagnostico>> {
    let mut rv: Value = leer(receta.0, receta.1)?;
    let mut errores = Vec::new();
    desconocidos(
        &rv,
        &[
            "receta", "tipo", "nombre", "modelo", "visible", "entrada", "salida", "raiz",
        ],
        receta.0,
        "",
        &mut errores,
    );
    forma_nodo(&rv["raiz"], receta.0, "/raiz", &mut errores, 1);
    for k in ["entrada", "salida"] {
        if let Some(a) = rv.get(k) {
            desconocidos(
                a,
                &["desde", "hacia", "transicion"],
                receta.0,
                &format!("/{k}"),
                &mut errores,
            );
        }
    }
    if errores.iter().any(|e| e.causa != Causa::CampoDesconocido) {
        return Err(errores);
    }
    for e in &errores {
        if let Some((padre, campo)) = e.puntero.rsplit_once('/') {
            if let Some(m) = rv.pointer_mut(padre).and_then(Value::as_object_mut) {
                m.remove(&campo.replace("~1", "/").replace("~0", "~"));
            }
        }
    }
    let mut r: Receta = match serde_json::from_value(rv) {
        Ok(r) => r,
        Err(e) => {
            errores.push(diagnostico(
                receta.0,
                "",
                Causa::Json,
                &e.to_string(),
                "Corrige los campos y tipos de la receta según RECETA.md.",
            ));
            return Err(errores);
        }
    };
    let s: Sistema = leer(sistema.0, sistema.1)?;
    let c: Contrato = leer(modelo.0, modelo.1)?;
    let mut v = Validador {
        fichero: receta.0,
        sistema: &s,
        errores,
        avisos: Vec::new(),
        nodos: 0,
        capas: 0,
    };
    if r.receta != 1 {
        v.error(
            "/receta",
            Causa::Version,
            "Versión de receta desconocida",
            "Usa receta: 1.",
        );
    }
    if r.tipo != "overlay" {
        v.error(
            "/tipo",
            Causa::NoSoportado,
            "Tipo aún no soportado",
            "Usa tipo: overlay; menu está reservado.",
        );
    }
    if r.modelo != c.modelo {
        v.error(
            "/modelo",
            Causa::Enlace,
            "Contrato distinto",
            "Usa el identificador nombre/versión del contrato cargado.",
        );
    }
    if let Some(cond) = &r.visible {
        v.condicion(cond, "/visible", &c.campos);
    }
    for (k, a) in [("entrada", &r.entrada), ("salida", &r.salida)] {
        if let Some(a) = a {
            v.aparicion(a, &format!("/{k}"));
        }
    }
    v.nodo(&r.raiz, "/raiz", &c.campos, 1);
    v.fichero = sistema.0;
    for (i, f) in s.fuentes.iter().enumerate() {
        if !fuentes.contains(&f.as_str()) {
            v.error(
                &format!("/fuentes/{i}"),
                Causa::Fuente,
                "Fuente fuera del paquete",
                "Usa una familia suministrada por el producto; por defecto Inter.",
            );
        }
    }
    let sv: Value = leer(sistema.0, sistema.1)?;
    validar_sistema(&s, &sv, &mut v);
    v.fichero = modelo.0;
    validar_campos(&c.campos, "/campos", &mut v);
    if !v.errores.is_empty() {
        return Err(v.errores);
    }
    let avisos = v.avisos;
    r.contrato_validado = Some(c.clone());
    Ok(Carga {
        receta: r,
        sistema: s,
        contrato: c,
        avisos,
    })
}
fn validar_sistema(s: &Sistema, sv: &Value, v: &mut Validador<'_>) {
    if s.sistema != 1 {
        v.error(
            "/sistema",
            Causa::Version,
            "Versión de sistema desconocida",
            "Usa sistema: 1.",
        );
    }
    validar_tokens(sv, "", v, &mut BTreeSet::new());
    for (nombre, tipo) in &s.tipo {
        let Some(tipo) = s.resolver(tipo) else {
            continue;
        };
        let p = format!("/tipo/{nombre}");
        validar_tipografia(&tipo, &p, v);
        desconocidos(
            &tipo,
            &[
                "familia",
                "peso",
                "tamano",
                "interletra",
                "interlinea",
                "tabulares",
                "mayusculas",
            ],
            v.fichero,
            &p,
            &mut v.errores,
        );
        if !tipo["familia"]
            .as_str()
            .is_some_and(|f| s.fuentes.iter().any(|x| x == f))
        {
            v.error(
                &format!("{p}/familia"),
                Causa::Fuente,
                "Fuente no registrada",
                "Usa una familia declarada en fuentes y suministrada por el producto.",
            );
        }
    }
    for (nombre, mov) in &s.mov {
        v.transicion(mov, &format!("/mov/{nombre}"));
    }
    validar_colores(&s.color, "/color", v);
    validar_medidas(
        &serde_json::to_value(&s.medida).unwrap_or(Value::Null),
        "/medida",
        v,
    );
    for (k, x) in &s.propios {
        validar_medidas(x, &format!("/{k}"), v);
    }
}
fn validar_tipografia(t: &Value, p: &str, v: &mut Validador<'_>) {
    for k in [
        "peso",
        "tamano",
        "interletra",
        "interlinea",
        "tabulares",
        "mayusculas",
    ] {
        if let Some(x) = t.get(k) {
            let Some(x) = v.sistema.resolver(x) else {
                continue;
            };
            let valido = match k {
                "peso" => x.as_u64().is_some_and(|n| (100..=900).contains(&n)),
                "tabulares" | "mayusculas" => x.is_boolean(),
                "interletra" => x.as_f64().is_some_and(f64::is_finite),
                _ => x
                    .as_f64()
                    .is_some_and(|n| n > 0.0 && n <= f64::from(f32::MAX)),
            };
            if !valido {
                v.error(&format!("{p}/{k}"),Causa::Tipo,"Propiedad tipográfica inválida","Usa peso entero 100..900, tamaños positivos finitos y booleanos para tabulares/mayusculas.");
            }
        }
    }
}
fn validar_tokens(valor: &Value, p: &str, v: &mut Validador<'_>, vistos: &mut BTreeSet<String>) {
    match valor {
        Value::Object(m) => {
            for (k, x) in m {
                validar_tokens(x, &format!("{p}/{k}"), v, vistos);
            }
        }
        Value::Array(a) => {
            for (i, x) in a.iter().enumerate() {
                validar_tokens(x, &format!("{p}/{i}"), v, vistos);
            }
        }
        Value::String(s) if s.starts_with('$') => {
            if vistos.insert(s.clone()) {
                v.token(s, p, None, &BTreeMap::new());
            }
        }
        _ => {}
    }
}
fn validar_colores(colores: &BTreeMap<String, Value>, p: &str, v: &mut Validador<'_>) {
    for (k, x) in colores {
        let p = format!("{p}/{k}");
        if let Some(m) = x.as_object() {
            validar_colores(&m.clone().into_iter().collect(), &p, v);
        } else {
            let res = v.sistema.resolver(x);
            if !res.as_ref().and_then(Value::as_str).is_some_and(|s| {
                s.strip_prefix('#').is_some_and(|s| {
                    [6, 8].contains(&s.len()) && s.bytes().all(|c| c.is_ascii_hexdigit())
                })
            }) {
                v.error(
                    &p,
                    Causa::Token,
                    "Color de sistema inválido",
                    "Usa #rrggbb, #rrggbbaa o una referencia a otro token de color.",
                );
            }
        }
    }
}
fn validar_medidas(x: &Value, p: &str, v: &mut Validador<'_>) {
    if let Some(o) = x.as_object() {
        for (k, x) in o {
            validar_medidas(x, &format!("{p}/{k}"), v);
        }
    } else if !v
        .sistema
        .resolver(x)
        .is_some_and(|x| x.as_f64().is_some_and(|x| x.is_finite() && x >= 0.0))
    {
        v.error(
            p,
            Causa::Medida,
            "Token de medida inválido",
            "Usa un número finito positivo o una referencia a otra medida.",
        );
    }
}
fn validar_campos(campos: &BTreeMap<String, Campo>, p: &str, v: &mut Validador<'_>) {
    for (k, c) in campos {
        let p = format!("{p}/{k}");
        match c {
            Campo::Simple(t) if ["bool", "texto", "numero"].contains(&t.as_str()) => {}
            Campo::Simple(_) => v.error(
                &p,
                Causa::Tipo,
                "Tipo de campo desconocido",
                "Usa bool, texto, numero, enum o lista.",
            ),
            Campo::Enumerado(e) => {
                let unicos = e.r#enum.iter().collect::<BTreeSet<_>>();
                if e.r#enum.is_empty()
                    || unicos.len() != e.r#enum.len()
                    || e.r#enum.iter().any(String::is_empty)
                {
                    v.error(
                        &format!("{p}/enum"),
                        Causa::Tipo,
                        "Enum vacío, repetido o inválido",
                        "Declara valores únicos y no vacíos.",
                    );
                }
            }
            Campo::Lista(l) => validar_campos(&l.lista, &format!("{p}/lista"), v),
        }
    }
}
fn ciclo_token(
    s: &Sistema,
    token: &str,
    activos: &mut BTreeSet<String>,
    listos: &mut BTreeSet<String>,
    nivel: usize,
) -> bool {
    if listos.contains(token) {
        return false;
    }
    if nivel > 64 || !activos.insert(token.into()) {
        return true;
    }
    let ciclo = s
        .token(token)
        .is_some_and(|v| ciclo_valor(s, &v, activos, listos, nivel + 1));
    activos.remove(token);
    listos.insert(token.into());
    ciclo
}
fn ciclo_valor(
    s: &Sistema,
    v: &Value,
    activos: &mut BTreeSet<String>,
    listos: &mut BTreeSet<String>,
    nivel: usize,
) -> bool {
    match v {
        Value::String(t) if t.starts_with('$') => ciclo_token(s, t, activos, listos, nivel),
        Value::Object(m) => m
            .values()
            .any(|v| ciclo_valor(s, v, activos, listos, nivel)),
        Value::Array(a) => a.iter().any(|v| ciclo_valor(s, v, activos, listos, nivel)),
        _ => false,
    }
}
fn muelle_asentado(rigidez: f64, amortiguacion: f64) -> bool {
    let alpha = amortiguacion * 0.5;
    let discriminante = rigidez - alpha * alpha;
    let (posicion, velocidad) = if discriminante > 1.0e-8 {
        let frecuencia = discriminante.sqrt();
        let envolvente = (-alpha * 10.0).exp();
        (
            (1.0 + (alpha / frecuencia).powi(2)).sqrt() * envolvente,
            rigidez / frecuencia * envolvente,
        )
    } else if discriminante < -1.0e-8 {
        let raiz = (-discriminante).sqrt();
        let lento = -alpha + raiz;
        let rapido = -alpha - raiz;
        let coef_lento = -rapido / (lento - rapido);
        let coef_rapido = 1.0 - coef_lento;
        (
            coef_lento * (10.0 * lento).exp() + coef_rapido * (10.0 * rapido).exp(),
            (coef_lento * lento * (10.0 * lento).exp()
                + coef_rapido * rapido * (10.0 * rapido).exp())
            .abs(),
        )
    } else {
        let envolvente = (-alpha * 10.0).exp();
        (
            (1.0 + alpha * 10.0) * envolvente,
            alpha * alpha * 10.0 * envolvente,
        )
    };
    posicion < 0.001 && velocidad < 0.001
}
