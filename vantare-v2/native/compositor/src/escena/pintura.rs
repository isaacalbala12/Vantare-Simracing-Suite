//! Colores animados en luz lineal y alfa premultiplicado, con velocidad por canal.
use super::{
    animacion,
    capas::{Color, Curva, Dibujo, Instante, Pintura},
};
use serde_json::Value;
use std::collections::BTreeMap;
#[derive(Clone)]
pub(super) struct TransicionPintada {
    hasta: Vec<Dibujo>,
    curvas: Vec<Curva>,
}
impl TransicionPintada {
    pub fn nueva(
        desde: &[Dibujo],
        hasta: Vec<Dibujo>,
        config: &BTreeMap<String, Value>,
        ahora: Instante,
        anterior: Option<&Self>,
    ) -> Self {
        let a = canales(desde);
        let b = canales(&hasta);
        let roles = roles(&hasta);
        let curvas = if a.len() == b.len() {
            a.into_iter()
                .zip(b)
                .enumerate()
                .map(|(i, (a, b))| {
                    let velocidad = anterior
                        .and_then(|p| p.curvas.get(i))
                        .map(|c| animacion::muestra(c, ahora).1);
                    if let Some(cfg) = config.get(roles[i]) {
                        animacion::transicion(cfg, ahora, a, b, velocidad)
                    } else {
                        Curva {
                            inicio: ahora,
                            tramos: Vec::new(),
                            fin: 0.0,
                            final_: b,
                            repetir: None,
                        }
                    }
                })
                .collect()
        } else {
            Vec::new()
        };
        Self { hasta, curvas }
    }
    pub fn necesaria(desde: &[Dibujo], hasta: &[Dibujo], config: &BTreeMap<String, Value>) -> bool {
        let a = canales(desde);
        let b = canales(hasta);
        let roles = roles(hasta);
        a.len() == b.len()
            && a.iter().zip(&b).enumerate().any(|(i, (a, b))| {
                a.partial_cmp(b) != Some(std::cmp::Ordering::Equal) && config.contains_key(roles[i])
            })
    }
    pub fn fin(&self) -> Instante {
        Instante(
            self.curvas
                .iter()
                .map(|c| c.inicio.0 + c.fin)
                .fold(0.0, f64::max),
        )
    }
    pub fn dibujos(&self, t: Instante) -> Vec<Dibujo> {
        if self.curvas.is_empty() {
            return self.hasta.clone();
        }
        let mut iter = self.curvas.iter();
        let mut salida = self.hasta.clone();
        recorrer(&mut salida, &mut |color| {
            let mut valor = || iter.next().map_or(0.0, |c| animacion::muestra(c, t).0);
            *color = despremultiplicar([valor(), valor(), valor(), valor()]);
        });
        salida
    }
}
fn dec(x: f32) -> f32 {
    if x <= 0.04045 {
        x / 12.92
    } else {
        ((x + 0.055) / 1.055).powf(2.4)
    }
}
fn enc(x: f32) -> f32 {
    if x <= 0.003_130_8 {
        x * 12.92
    } else {
        1.055 * x.powf(1.0 / 2.4) - 0.055
    }
}
fn premultiplicar(c: Color) -> [f32; 4] {
    [dec(c.r) * c.a, dec(c.g) * c.a, dec(c.b) * c.a, c.a]
}
fn despremultiplicar(v: [f32; 4]) -> Color {
    let a = v[3].clamp(0.0, 1.0);
    let canal = |x: f32| {
        if a <= f32::EPSILON {
            0.0
        } else {
            enc((x / a).clamp(0.0, 1.0))
        }
    };
    Color {
        r: canal(v[0]),
        g: canal(v[1]),
        b: canal(v[2]),
        a,
    }
}
fn roles(dibujos: &[Dibujo]) -> Vec<&'static str> {
    let mut roles = Vec::new();
    let colores = |p: &Pintura| match p {
        Pintura::Solido(_) => 1,
        Pintura::Lineal { paradas, .. } | Pintura::Radial { paradas, .. } => paradas.len(),
    };
    for d in dibujos {
        match d {
            Dibujo::Rect { relleno, borde, .. } => {
                if let Some(p) = relleno {
                    roles.extend(std::iter::repeat_n("fondo", colores(p) * 4));
                }
                if let Some((_, p)) = borde {
                    roles.extend(std::iter::repeat_n("borde", colores(p) * 4));
                }
            }
            Dibujo::Texto { .. } => roles.extend(["color"; 4]),
            Dibujo::Sombra { .. } => roles.extend([""; 4]),
            Dibujo::Recorte { .. } | Dibujo::FinRecorte => {}
        }
    }
    roles
}
fn canales(dibujos: &[Dibujo]) -> Vec<f32> {
    let mut salida = Vec::new();
    recorrer(&mut dibujos.to_vec(), &mut |c| {
        salida.extend(premultiplicar(*c));
    });
    salida
}
fn recorrer(dibujos: &mut [Dibujo], f: &mut impl FnMut(&mut Color)) {
    for d in dibujos {
        match d {
            Dibujo::Rect { relleno, borde, .. } => {
                if let Some(p) = relleno {
                    pintura(p, f);
                }
                if let Some((_, p)) = borde {
                    pintura(p, f);
                }
            }
            Dibujo::Texto { color, .. } | Dibujo::Sombra { color, .. } => f(color),
            Dibujo::Recorte { .. } | Dibujo::FinRecorte => {}
        }
    }
}
fn pintura(p: &mut Pintura, f: &mut impl FnMut(&mut Color)) {
    match p {
        Pintura::Solido(c) => f(c),
        Pintura::Lineal { paradas, .. } | Pintura::Radial { paradas, .. } => {
            for p in paradas {
                f(&mut p.color);
            }
        }
    }
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn alfa_premultiplicado_no_inventa_rojo() {
        let a = Color {
            r: 1.0,
            g: 0.0,
            b: 0.0,
            a: 0.0,
        };
        let b = Color {
            r: 0.0,
            g: 0.0,
            b: 1.0,
            a: 1.0,
        };
        let x = premultiplicar(a);
        let y = premultiplicar(b);
        let resultado = despremultiplicar(std::array::from_fn(|i| (x[i] + y[i]) * 0.5));
        assert!(
            resultado.r.abs() < 1.0e-6
                && (resultado.b - 1.0).abs() < 1.0e-6
                && (resultado.a - 0.5).abs() < 1.0e-6
        );
    }
    #[test]
    fn interrupcion_pintada_conserva_valor_y_velocidad() {
        let dibujar = |c| {
            vec![Dibujo::Texto {
                caja: super::super::capas::Rect {
                    x: 0.0,
                    y: 0.0,
                    ancho: 100.0,
                    alto: 20.0,
                },
                texto: "x".into(),
                fuente: super::super::capas::Fuente {
                    familia: "Inter".into(),
                    peso: 400,
                    tamano: 13.0,
                    interletra: 0.0,
                    interlinea: 18.0,
                    tabulares: false,
                    mayusculas: false,
                },
                color: c,
                alineacion: super::super::capas::Alineacion::Inicio,
            }]
        };
        let rojo = dibujar(Color {
            r: 1.0,
            g: 0.0,
            b: 0.0,
            a: 1.0,
        });
        let azul = dibujar(Color {
            r: 0.0,
            g: 0.0,
            b: 1.0,
            a: 0.7,
        });
        let cfg = BTreeMap::from([(
            "color".into(),
            serde_json::json!({"duracion":1000,"curva":"lineal"}),
        )]);
        let a = TransicionPintada::nueva(&rojo, azul, &cfg, Instante(0.0), None);
        let actual = a.dibujos(Instante(0.4));
        let b = TransicionPintada::nueva(&actual, rojo, &cfg, Instante(0.4), Some(&a));
        for (a, b) in a.curvas.iter().zip(b.curvas.iter()) {
            let antes = animacion::muestra(a, Instante(0.4));
            let despues = animacion::muestra(b, Instante(0.4));
            assert!((antes.0 - despues.0).abs() < 1.0e-5 && (antes.1 - despues.1).abs() < 1.0e-5);
        }
    }
}
