//! Límites de tinta y recorrido compuesto; la maquetación no se modifica.
use super::{Error, Plataforma, Resultado, tiempo};
use crate::escena::capas::{CapaId, Dibujo, Propiedad, Rect};
use std::f32::consts::{FRAC_PI_2, PI, TAU};

#[derive(Clone, Copy, Debug)]
pub(super) struct Limites {
    pub izquierda: f32,
    pub arriba: f32,
    pub derecha: f32,
    pub abajo: f32,
}
impl Limites {
    pub fn rect(rect: Rect) -> Resultado<Self> {
        Self {
            izquierda: rect.x,
            arriba: rect.y,
            derecha: rect.x + rect.ancho,
            abajo: rect.y + rect.alto,
        }
        .validar()
    }
    fn validar(self) -> Resultado<Self> {
        if ![self.izquierda, self.arriba, self.derecha, self.abajo]
            .iter()
            .all(|v| v.is_finite())
            || self.derecha < self.izquierda
            || self.abajo < self.arriba
        {
            return Err(Error::Entrada("Límites de tinta inválidos"));
        }
        Ok(self)
    }
    fn unir(self, otro: Self) -> Self {
        Self {
            izquierda: self.izquierda.min(otro.izquierda),
            arriba: self.arriba.min(otro.arriba),
            derecha: self.derecha.max(otro.derecha),
            abajo: self.abajo.max(otro.abajo),
        }
    }
    fn interseccion(self, otro: Self) -> Option<Self> {
        let r = Self {
            izquierda: self.izquierda.max(otro.izquierda),
            arriba: self.arriba.max(otro.arriba),
            derecha: self.derecha.min(otro.derecha),
            abajo: self.abajo.min(otro.abajo),
        };
        (r.derecha >= r.izquierda && r.abajo >= r.arriba).then_some(r)
    }
    fn inflar(self, margen: f32) -> Resultado<Self> {
        Self {
            izquierda: self.izquierda - margen,
            arriba: self.arriba - margen,
            derecha: self.derecha + margen,
            abajo: self.abajo + margen,
        }
        .validar()
    }
    fn desplazar(self, x: f32, y: f32) -> Resultado<Self> {
        Self {
            izquierda: self.izquierda + x,
            arriba: self.arriba + y,
            derecha: self.derecha + x,
            abajo: self.abajo + y,
        }
        .validar()
    }
    pub fn ancho(self) -> f32 {
        self.derecha - self.izquierda
    }
    pub fn alto(self) -> f32 {
        self.abajo - self.arriba
    }
}

pub(super) fn tinta(rect: Rect, dibujos: &[Dibujo]) -> Resultado<Limites> {
    let mut tinta = Limites::rect(Rect {
        x: 0.0,
        y: 0.0,
        ..rect
    })?;
    let mut clips: Vec<Option<Limites>> = Vec::new();
    for dibujo in dibujos {
        let candidato = match dibujo {
            Dibujo::Rect { rect, borde, .. } => {
                let ancho = borde.as_ref().map_or(0.0, |(ancho, _)| *ancho);
                if !ancho.is_finite() || ancho < 0.0 {
                    return Err(Error::Entrada("Borde no finito o negativo"));
                }
                Limites::rect(*rect)?
            }
            Dibujo::Texto { caja, fuente, .. } => Limites::rect(*caja)?.inflar(fuente.tamano)?,
            Dibujo::Sombra {
                rect,
                desenfoque,
                desplazamiento,
                ..
            } => {
                if !desenfoque.is_finite() || *desenfoque < 0.0 {
                    return Err(Error::Entrada("Desenfoque no finito o negativo"));
                }
                Limites::rect(*rect)?
                    .inflar(3.0 * desenfoque)?
                    .desplazar(desplazamiento.0, desplazamiento.1)?
            }
            Dibujo::Recorte { rect, .. } => {
                let nuevo = Limites::rect(*rect)?;
                clips.push(match clips.last() {
                    None => Some(nuevo),
                    Some(Some(actual)) => actual.interseccion(nuevo),
                    Some(None) => None,
                });
                continue;
            }
            Dibujo::FinRecorte => {
                if clips.pop().is_none() {
                    return Err(Error::Entrada("FinRecorte sin Recorte"));
                }
                continue;
            }
        };
        let visible = match clips.last() {
            None => Some(candidato),
            Some(Some(clip)) => candidato.interseccion(*clip),
            Some(None) => None,
        };
        if let Some(visible) = visible {
            tinta = tinta.unir(visible);
        }
    }
    if !clips.is_empty() {
        return Err(Error::Entrada("Recorte sin FinRecorte"));
    }
    Ok(tinta)
}

fn rotar_punto(salida: &mut Option<Limites>, centro: (f32, f32), punto: (f32, f32), angulo: f32) {
    let (seno, coseno) = angulo.sin_cos();
    let x = centro.0 + punto.0 * coseno - punto.1 * seno;
    let y = centro.1 + punto.0 * seno + punto.1 * coseno;
    let r = Limites {
        izquierda: x,
        arriba: y,
        derecha: x,
        abajo: y,
    };
    *salida = Some(salida.map_or(r, |s| s.unir(r)));
}
fn transformar(
    tinta: Limites,
    rect: Rect,
    escala: (f32, f32),
    giro: (f32, f32),
) -> Resultado<Limites> {
    let centro = (rect.ancho / 2.0, rect.alto / 2.0);
    let mut salida: Option<Limites> = None;
    let amplitud = (giro.1 - giro.0).to_radians();
    let inicio = giro.0.to_radians().rem_euclid(TAU);
    for x in [tinta.izquierda, tinta.derecha] {
        for y in [tinta.arriba, tinta.abajo] {
            for escala in [escala.0, escala.1] {
                let punto = ((x - centro.0) * escala, (y - centro.1) * escala);
                if amplitud >= TAU {
                    let radio = punto.0.hypot(punto.1);
                    let circulo = Limites {
                        izquierda: centro.0 - radio,
                        arriba: centro.1 - radio,
                        derecha: centro.0 + radio,
                        abajo: centro.1 + radio,
                    };
                    salida = Some(salida.map_or(circulo, |s| s.unir(circulo)));
                } else {
                    rotar_punto(&mut salida, centro, punto, inicio);
                    rotar_punto(&mut salida, centro, punto, inicio + amplitud);
                    let fase = punto.1.atan2(punto.0);
                    for base in [-fase, FRAC_PI_2 - fase] {
                        let primero = ((inicio - base) / PI).ceil();
                        for vuelta in [primero, primero + 1.0, primero + 2.0] {
                            let angulo = base + vuelta * PI;
                            if angulo >= inicio && angulo <= inicio + amplitud {
                                rotar_punto(&mut salida, centro, punto, angulo);
                            }
                        }
                    }
                }
            }
        }
    }
    salida
        .ok_or(Error::Entrada("Capa sin límites compuestos"))?
        .validar()
}

pub(super) struct VistaSalida {
    id: CapaId,
    region: windows::Win32::Foundation::RECT,
    origen: (f32, f32),
    offset_px: (f32, f32),
}

impl Plataforma {
    pub(super) fn limites_capa(&self, id: CapaId) -> Resultado<Limites> {
        let capa = self.capa(id)?;
        let mut local = tinta(capa.rect, &capa.dibujos)?;
        for (hijo, _) in self.capas.iter().filter(|(_, c)| c.padre == Some(id)) {
            local = local.unir(self.limites_capa(*hijo)?);
        }
        let rango = |propiedad, defecto| -> Resultado<(f32, f32)> {
            if let Some(curva) = capa.curvas.get(&propiedad) {
                tiempo::rango(curva)
            } else {
                let valor = capa.valores.get(&propiedad).copied().unwrap_or(defecto);
                Ok((valor, valor))
            }
        };
        let mut compuesto = transformar(
            local,
            capa.rect,
            rango(Propiedad::Escala, 1.0)?,
            rango(Propiedad::Giro, 0.0)?,
        )?;
        let x = rango(Propiedad::X, 0.0)?;
        let y = rango(Propiedad::Y, 0.0)?;
        compuesto.izquierda += capa.rect.x + x.0;
        compuesto.derecha += capa.rect.x + x.1;
        compuesto.arriba += capa.rect.y + y.0;
        compuesto.abajo += capa.rect.y + y.1;
        compuesto.validar()
    }
    pub(super) fn preparar_salidas(&self) -> Resultado<Vec<VistaSalida>> {
        use windows::Win32::Foundation::RECT;
        if self.modo != super::Modo::PorOverlay {
            return Ok(Vec::new());
        }
        let mut vistas = Vec::new();
        for (id, _) in self.capas.iter().filter(|(_, c)| c.padre.is_none()) {
            let limites = self.limites_capa(*id)?;
            let salida = self
                .salidas
                .get(&Some(*id))
                .ok_or(Error::Entrada("Sin salida de la raíz"))?;
            let escala = salida.ventana.dpi / 96.0;
            let izquierda = ((limites.izquierda - self.margen) * escala).floor();
            let arriba = ((limites.arriba - self.margen) * escala).floor();
            let derecha = ((limites.derecha + self.margen) * escala).ceil();
            let abajo = ((limites.abajo + self.margen) * escala).ceil();
            let x = self
                .region
                .left
                .checked_add(super::entero(izquierda)?)
                .ok_or(Error::Entrada("Posición X de salida fuera de rango"))?;
            let y = self
                .region
                .top
                .checked_add(super::entero(arriba)?)
                .ok_or(Error::Entrada("Posición Y de salida fuera de rango"))?;
            let ancho = super::entero((derecha - izquierda).max(1.0))?;
            let alto = super::entero((abajo - arriba).max(1.0))?;
            let region = RECT {
                left: x,
                top: y,
                right: x
                    .checked_add(ancho)
                    .ok_or(Error::Entrada("Ancho de salida fuera de rango"))?,
                bottom: y
                    .checked_add(alto)
                    .ok_or(Error::Entrada("Alto de salida fuera de rango"))?,
            };
            vistas.push(VistaSalida {
                id: *id,
                region,
                origen: (-izquierda / escala, -arriba / escala),
                offset_px: (-izquierda, -arriba),
            });
        }
        Ok(vistas)
    }
    pub(super) fn ajustar_salidas(&mut self, vistas: Vec<VistaSalida>) -> Resultado<()> {
        use windows::Win32::UI::WindowsAndMessaging::{SWP_NOACTIVATE, SWP_NOZORDER, SetWindowPos};
        for vista in vistas {
            let salida = self
                .salidas
                .get_mut(&Some(vista.id))
                .ok_or(Error::Entrada("Sin salida de la raíz"))?;
            unsafe {
                salida.raiz.SetOffsetX2(vista.offset_px.0)?;
                salida.raiz.SetOffsetY2(vista.offset_px.1)?;
                let r = vista.region;
                if salida.region.left != r.left
                    || salida.region.top != r.top
                    || salida.region.right != r.right
                    || salida.region.bottom != r.bottom
                {
                    SetWindowPos(
                        salida.ventana.hwnd,
                        None,
                        r.left,
                        r.top,
                        r.right - r.left,
                        r.bottom - r.top,
                        SWP_NOACTIVATE | SWP_NOZORDER,
                    )?;
                    salida.region = r;
                }
            }
            salida.origen = vista.origen;
        }
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::escena::capas::Color;
    #[test]
    fn sombra_y_borde_fuera_de_la_maquetacion_amplian_la_tinta() -> Resultado<()> {
        let rect = Rect {
            x: 0.0,
            y: 0.0,
            ancho: 100.0,
            alto: 50.0,
        };
        let sombra = Dibujo::Sombra {
            rect,
            radios: [0.0; 4],
            color: Color {
                r: 0.0,
                g: 0.0,
                b: 0.0,
                a: 1.0,
            },
            desenfoque: 26.0,
            desplazamiento: (0.0, 10.0),
        };
        let limites = tinta(rect, &[sombra])?;
        assert!((limites.izquierda + 78.0).abs() < 0.001);
        assert!((limites.arriba + 68.0).abs() < 0.001);
        assert!((limites.derecha - 178.0).abs() < 0.001);
        assert!((limites.abajo - 138.0).abs() < 0.001);
        let borde = Dibujo::Rect {
            rect: Rect {
                x: -120.0,
                y: -30.0,
                ancho: 10.0,
                alto: 10.0,
            },
            radios: [0.0; 4],
            relleno: None,
            borde: Some((
                4.0,
                crate::escena::capas::Pintura::Solido(Color {
                    r: 1.0,
                    g: 0.0,
                    b: 0.0,
                    a: 1.0,
                }),
            )),
        };
        let limites = tinta(rect, &[borde])?;
        assert!((limites.izquierda + 120.0).abs() < 0.001);
        assert!((limites.arriba + 30.0).abs() < 0.001);
        Ok(())
    }
}
