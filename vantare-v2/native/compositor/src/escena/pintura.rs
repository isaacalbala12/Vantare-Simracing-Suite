//! Canales de color estables por nodo/dibujo/parada, en luz lineal premultiplicada.
use super::{
    animacion::{self, ErrorAnimacion},
    capas::{Color, Curva, Dibujo, Instante, Pintura},
    maquetacion::Plano,
};
use crate::receta::{Transicion, programa::Pintadas};
use std::{collections::BTreeMap, sync::Arc};
#[derive(Clone, Copy, Debug, PartialEq, Eq, PartialOrd, Ord)]
enum Rol {
    Fondo,
    Borde,
    Color,
    Sombra,
}
#[derive(Clone, Copy, Debug, PartialEq, Eq, PartialOrd, Ord)]
struct Clave {
    origen: (u16, u8),
    rol: Rol,
    parada: usize,
    canal: usize,
}
#[derive(Clone)]
pub(super) struct TransicionPintada {
    hasta: Arc<[Dibujo]>,
    origenes: Arc<[(u16, u8)]>,
    curvas: BTreeMap<Clave, Curva>,
}
impl TransicionPintada {
    pub fn nueva(
        desde: &Plano,
        hasta: &Plano,
        ahora: Instante,
        anterior: Option<&Self>,
    ) -> Result<Option<Self>, ErrorAnimacion> {
        let originales = canales(&desde.dibujos, &desde.origenes)?;
        let destinos = canales(&hasta.dibujos, &hasta.origenes)?;
        let mut curvas = BTreeMap::new();
        let mut pendiente = false;
        for (clave, (destino, indice)) in destinos {
            let previa = anterior.and_then(|p| p.curvas.get(&clave));
            let (actual, velocidad) = match previa {
                Some(c) => animacion::muestra(c, ahora),
                None => match originales.get(&clave) {
                    Some((v, _)) => (*v, 0.0),
                    None => (0.0, 0.0),
                },
            };
            let configuracion = hasta.pintadas.get(indice).ok_or(ErrorAnimacion::Entrada)?;
            let config = configuracion.obtener(clave.rol);
            let curva = if let Some(previa) = previa
                && previa.final_.partial_cmp(&destino) == Some(std::cmp::Ordering::Equal)
            {
                previa.clone()
            } else if let Some(config) = config
                && actual.partial_cmp(&destino) != Some(std::cmp::Ordering::Equal)
            {
                animacion::transicion(&config, ahora, actual, destino, previa.map(|_| velocidad))?
            } else {
                animacion::constante(ahora, destino, 0.0)
            };
            pendiente |= ahora.0 < curva.inicio.0 + curva.fin;
            curvas.insert(clave, curva);
        }
        Ok(if pendiente {
            Some(Self {
                hasta: hasta.dibujos.clone(),
                origenes: hasta.origenes.clone(),
                curvas,
            })
        } else {
            None
        })
    }
    pub fn fin(&self) -> Instante {
        Instante(
            self.curvas
                .values()
                .map(|c| c.inicio.0 + c.fin)
                .fold(0.0, f64::max),
        )
    }
    pub fn dibujos(&self, t: Instante) -> Result<Vec<Dibujo>, ErrorAnimacion> {
        let mut salida = self.hasta.to_vec();
        visitar(
            &mut salida,
            &self.origenes,
            &mut |origen, rol, parada, _, color| {
                let mut valores = [0.0; 4];
                for (canal, v) in valores.iter_mut().enumerate() {
                    let curva = self
                        .curvas
                        .get(&Clave {
                            origen,
                            rol,
                            parada,
                            canal,
                        })
                        .ok_or(ErrorAnimacion::Entrada)?;
                    *v = animacion::muestra(curva, t).0;
                }
                *color = despremultiplicar(valores);
                Ok(())
            },
        )?;
        Ok(salida)
    }
}
impl Pintadas {
    fn obtener(&self, r: Rol) -> Option<Transicion> {
        match r {
            Rol::Fondo => self.fondo,
            Rol::Borde => self.borde,
            Rol::Color => self.color,
            Rol::Sombra => None,
        }
    }
}
fn canales(
    dibujos: &[Dibujo],
    origenes: &[(u16, u8)],
) -> Result<BTreeMap<Clave, (f32, usize)>, ErrorAnimacion> {
    let mut canales = BTreeMap::new();
    visitar(
        &mut dibujos.to_vec(),
        origenes,
        &mut |origen, rol, parada, indice, color| {
            for (canal, valor) in premultiplicar(*color).into_iter().enumerate() {
                canales.insert(
                    Clave {
                        origen,
                        rol,
                        parada,
                        canal,
                    },
                    (valor, indice),
                );
            }
            Ok(())
        },
    )?;
    Ok(canales)
}
fn visitar(
    dibujos: &mut [Dibujo],
    origenes: &[(u16, u8)],
    f: &mut impl FnMut((u16, u8), Rol, usize, usize, &mut Color) -> Result<(), ErrorAnimacion>,
) -> Result<(), ErrorAnimacion> {
    for (indice, d) in dibujos.iter_mut().enumerate() {
        let origen = *origenes.get(indice).ok_or(ErrorAnimacion::Entrada)?;
        match d {
            Dibujo::Rect { relleno, borde, .. } => {
                if let Some(p) = relleno {
                    visitar_pintura(p, origen, Rol::Fondo, indice, f)?;
                }
                if let Some((_, p)) = borde {
                    visitar_pintura(p, origen, Rol::Borde, indice, f)?;
                }
            }
            Dibujo::Texto { color, .. } => f(origen, Rol::Color, 0, indice, color)?,
            Dibujo::Sombra { color, .. } => f(origen, Rol::Sombra, 0, indice, color)?,
            Dibujo::Recorte { .. } | Dibujo::FinRecorte => {}
        }
    }
    Ok(())
}
fn visitar_pintura(
    p: &mut Pintura,
    origen: (u16, u8),
    rol: Rol,
    indice: usize,
    f: &mut impl FnMut((u16, u8), Rol, usize, usize, &mut Color) -> Result<(), ErrorAnimacion>,
) -> Result<(), ErrorAnimacion> {
    match p {
        Pintura::Solido(c) => f(origen, rol, 0, indice, c),
        Pintura::Lineal { paradas, .. } | Pintura::Radial { paradas, .. } => {
            for (i, p) in paradas.iter_mut().enumerate() {
                f(origen, rol, i, indice, &mut p.color)?;
            }
            Ok(())
        }
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
        let transparente = premultiplicar(a);
        let azul = premultiplicar(b);
        let color = despremultiplicar(std::array::from_fn(|i| (transparente[i] + azul[i]) * 0.5));
        assert!(
            color.r.abs() < 1e-6 && (color.b - 1.0).abs() < 1e-6 && (color.a - 0.5).abs() < 1e-6
        );
    }
}
