//! Receta + sistema de diseño + modelo → operaciones sobre capas.
//! Implementación: ver `README.md` del crate («Escena»).
pub mod animacion;
#[rustfmt::skip]
pub mod capas;
mod maquetacion;
mod pintura;
use crate::receta::{Receta, Sistema};
use capas::Fuente;
use capas::{CapaId, Curva, Instante, Lote, Operacion, Propiedad};
use maquetacion::{Plano, nombre, propiedad};
use serde_json::Value;
use std::collections::BTreeMap;
/// Mide una línea de texto con la fuente ya resuelta: (ancho, alto) en DIP.
/// La implementa DirectWrite en la plataforma; los tests usan un medidor fijo.
pub trait Medidor {
    fn medir(&self, texto: &str, fuente: &Fuente) -> (f32, f32);
}
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum CausaModelo {
    Enlace,
    Identidad,
    Limite,
    Maquetacion,
}
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct ErrorModelo {
    pub puntero: String,
    pub causa: CausaModelo,
}
impl ErrorModelo {
    fn enlace(p: &str) -> Self {
        Self {
            puntero: p.into(),
            causa: CausaModelo::Enlace,
        }
    }
    fn identidad(p: &str) -> Self {
        Self {
            puntero: p.into(),
            causa: CausaModelo::Identidad,
        }
    }
    fn limite(p: &str) -> Self {
        Self {
            puntero: p.into(),
            causa: CausaModelo::Limite,
        }
    }
    fn layout(p: &str) -> Self {
        Self {
            puntero: p.into(),
            causa: CausaModelo::Maquetacion,
        }
    }
}
impl std::fmt::Display for ErrorModelo {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(
            f,
            "{}: {:?}; corrige el modelo conforme al contrato y a los límites de RECETA.md",
            self.puntero, self.causa
        )
    }
}
impl std::error::Error for ErrorModelo {}
#[derive(Clone)]
struct Viva {
    id: CapaId,
    plano: Plano,
    curvas: Vec<(Propiedad, Curva)>,
    pintada: Option<pintura::TransicionPintada>,
}
impl Viva {
    fn muestra(&self, p: Propiedad, t: Instante) -> (f32, f32) {
        self.curvas.iter().find(|(k, _)| *k == p).map_or_else(
            || {
                (
                    self.plano
                        .valores
                        .iter()
                        .find(|(k, _)| *k == p)
                        .map_or(0.0, |(_, v)| *v),
                    0.0,
                )
            },
            |(_, c)| animacion::muestra(c, t),
        )
    }
    fn animar(&mut self, p: Propiedad, c: Curva, lote: &mut Lote) {
        self.curvas.retain(|(k, _)| *k != p);
        self.curvas.push((p, c.clone()));
        lote.operaciones.push(Operacion::Animar {
            id: self.id,
            propiedad: p,
            curva: c,
        });
    }
}
struct Fantasma {
    viva: Viva,
    fin: Instante,
    quitar: bool,
}
/// Estado del compositor puro. El anfitrión suministra todos los instantes.
pub struct Escena {
    receta: Receta,
    sistema: Sistema,
    modelo: Option<Value>,
    vivas: BTreeMap<String, Viva>,
    fantasmas: Vec<Fantasma>,
    siguiente: u32,
    ultimo: Instante,
}
fn defecto() -> Value {
    serde_json::json!({"duracion":180,"curva":"salida"})
}
fn config(s: &Sistema, v: Option<&Value>) -> Value {
    v.and_then(|x| s.resolver(x)).unwrap_or_else(defecto)
}
impl Escena {
    pub fn nueva(receta: Receta, sistema: Sistema) -> Self {
        Self {
            receta,
            sistema,
            modelo: None,
            vivas: BTreeMap::new(),
            fantasmas: Vec::new(),
            siguiente: 1,
            ultimo: Instante(0.0),
        }
    }
    pub fn actualizar(
        &mut self,
        modelo: &Value,
        ahora: Instante,
        medidor: &dyn Medidor,
    ) -> Result<Lote, ErrorModelo> {
        if !ahora.0.is_finite() {
            return Err(ErrorModelo::enlace("/ahora"));
        }
        let planos = maquetacion::maquetar(&self.receta, &self.sistema, modelo, medidor)?;
        let nuevas = planos
            .iter()
            .filter(|p| !self.vivas.contains_key(&p.clave))
            .count();
        if self.vivas.len() + self.fantasmas.len() + nuevas > 256 {
            return Err(ErrorModelo::limite("/capas"));
        }
        if u32::try_from(planos.len())
            .ok()
            .and_then(|n| self.siguiente.checked_add(n))
            .is_none()
        {
            return Err(ErrorModelo::limite("/capas"));
        }
        let mut lote = self.avanzar(ahora, medidor);
        self.aplicar(planos, ahora, &mut lote);
        self.modelo = Some(modelo.clone());
        Ok(lote)
    }
    fn aplicar(&mut self, planos: Vec<Plano>, ahora: Instante, lote: &mut Lote) {
        let mut anteriores = std::mem::take(&mut self.vivas);
        let mut ordenes = BTreeMap::new();
        for plano in planos {
            let orden = ordenes.entry(plano.padre.clone()).or_insert(0_u32);
            let posicion = *orden;
            *orden += 1;
            let clave = plano.clave.clone();
            let viva = if let Some(viva) = anteriores.remove(&clave) {
                self.modificar(viva, plano, ahora, lote)
            } else {
                self.crear(plano, posicion, ahora, lote)
            };
            self.vivas.insert(clave, viva);
        }
        self.retirar(anteriores, ahora, lote);
    }
    fn modificar(&self, mut viva: Viva, plano: Plano, ahora: Instante, lote: &mut Lote) -> Viva {
        if viva.plano.rect != plano.rect {
            lote.operaciones.push(Operacion::Colocar {
                id: viva.id,
                rect: plano.rect,
            });
            if let Some(t) = &plano.movimiento {
                let (actual, v) = viva.muestra(Propiedad::Y, ahora);
                let desde = actual + viva.plano.rect.y - plano.rect.y;
                let destino = plano
                    .valores
                    .iter()
                    .find(|(k, _)| *k == Propiedad::Y)
                    .map_or(0.0, |(_, v)| *v);
                viva.animar(
                    Propiedad::Y,
                    animacion::transicion(
                        &config(&self.sistema, Some(t)),
                        ahora,
                        desde,
                        destino,
                        Some(v),
                    ),
                    lote,
                );
            }
        }
        if viva.plano.dibujos != plano.dibujos {
            let configs = plano
                .transiciones
                .iter()
                .filter(|(k, _)| ["fondo", "color", "borde"].contains(&k.as_str()))
                .map(|(k, v)| (k.clone(), config(&self.sistema, Some(v))))
                .collect();
            let desde = viva
                .pintada
                .as_ref()
                .map_or_else(|| viva.plano.dibujos.clone(), |p| p.dibujos(ahora));
            if pintura::TransicionPintada::necesaria(&desde, &plano.dibujos, &configs) {
                viva.pintada = Some(pintura::TransicionPintada::nueva(
                    &desde,
                    plano.dibujos.clone(),
                    &configs,
                    ahora,
                    viva.pintada.as_ref(),
                ));
            } else {
                viva.pintada = None;
                lote.operaciones.push(Operacion::Pintar {
                    id: viva.id,
                    dibujos: plano.dibujos.clone(),
                });
            }
        }
        self.propiedades(&mut viva, &plano, ahora, lote);
        viva.plano = plano;
        viva
    }
    fn visibilidad(
        &self,
        viva: &mut Viva,
        plano: &Plano,
        ahora: Instante,
        lote: &mut Lote,
    ) -> bool {
        let visible = |p: &Plano| {
            p.valores
                .iter()
                .find(|(k, _)| *k == Propiedad::Opacidad)
                .is_none_or(|(_, v)| *v > 0.0)
        };
        let cambio_visible = visible(&viva.plano) != visible(plano);
        if cambio_visible {
            let aparicion = if visible(plano) {
                plano.entrada.as_ref()
            } else {
                plano.salida.as_ref()
            };
            if let Some(a) = aparicion {
                let mapa = if visible(plano) { &a.desde } else { &a.hacia };
                for (k, v) in mapa {
                    if let Some(p) = propiedad(k) {
                        let (actual, velocidad) = viva.muestra(p, ahora);
                        let destino = if visible(plano) {
                            plano
                                .valores
                                .iter()
                                .find(|(k, _)| *k == p)
                                .map_or(0.0, |(_, v)| *v)
                        } else {
                            *v
                        };
                        let desde = if visible(plano)
                            && !viva.curvas.iter().any(|(k, curva)| {
                                *k == p
                                    && (curva.repetir.is_some()
                                        || ahora.0 < curva.inicio.0 + curva.fin)
                            }) {
                            *v
                        } else {
                            actual
                        };
                        viva.animar(
                            p,
                            animacion::transicion(
                                &config(&self.sistema, a.transicion.as_ref()),
                                ahora,
                                desde,
                                destino,
                                Some(velocidad),
                            ),
                            lote,
                        );
                    }
                }
            }
        }
        cambio_visible
    }
    fn propiedades(&self, viva: &mut Viva, plano: &Plano, ahora: Instante, lote: &mut Lote) {
        let cambio_visible = self.visibilidad(viva, plano, ahora, lote);
        let visible = |p: &Plano| {
            p.valores
                .iter()
                .find(|(k, _)| *k == Propiedad::Opacidad)
                .is_none_or(|(_, v)| *v > 0.0)
        };
        for (p, destino) in &plano.valores {
            if *p == Propiedad::Y && plano.movimiento.is_some() && viva.plano.rect != plano.rect {
                continue;
            }
            if cambio_visible
                && (if visible(plano) {
                    plano.entrada.as_ref()
                } else {
                    plano.salida.as_ref()
                })
                .is_some_and(|a| {
                    a.desde.contains_key(nombre(*p)) || a.hacia.contains_key(nombre(*p))
                })
            {
                continue;
            }
            let anterior = viva
                .plano
                .valores
                .iter()
                .find(|(k, _)| k == p)
                .map_or(0.0, |(_, v)| *v);
            let bucle_antes = viva
                .plano
                .bucle
                .as_ref()
                .filter(|b| propiedad(&b.propiedad) == Some(*p));
            let bucle_despues = plano
                .bucle
                .as_ref()
                .filter(|b| propiedad(&b.propiedad) == Some(*p));
            let cambio_bucle = bucle_antes != bucle_despues;
            if anterior.partial_cmp(destino) != Some(std::cmp::Ordering::Equal) || cambio_bucle {
                let (actual, v) = viva.muestra(*p, ahora);
                if let Some(b) = bucle_despues {
                    viva.animar(
                        *p,
                        animacion::bucle_desde(&b.valores, b.duracion / 1000.0, ahora, actual, v),
                        lote,
                    );
                } else if let Some(t) = plano.transiciones.get(nombre(*p)).or({
                    if cambio_bucle {
                        Some(&Value::Null)
                    } else {
                        None
                    }
                }) {
                    viva.animar(
                        *p,
                        animacion::transicion(
                            &config(&self.sistema, Some(t)),
                            ahora,
                            actual,
                            *destino,
                            Some(v),
                        ),
                        lote,
                    );
                } else {
                    viva.curvas.retain(|(k, _)| k != p);
                    lote.operaciones.push(Operacion::Fijar {
                        id: viva.id,
                        propiedad: *p,
                        valor: *destino,
                    });
                }
            }
        }
    }
    fn crear(&mut self, plano: Plano, orden: u32, ahora: Instante, lote: &mut Lote) -> Viva {
        let id = CapaId(self.siguiente);
        self.siguiente += 1;
        let padre = plano
            .padre
            .as_ref()
            .and_then(|p| self.vivas.get(p))
            .map(|v| v.id);
        lote.operaciones.push(Operacion::Crear { id, padre, orden });
        lote.operaciones.push(Operacion::Colocar {
            id,
            rect: plano.rect,
        });
        lote.operaciones.push(Operacion::Pintar {
            id,
            dibujos: plano.dibujos.clone(),
        });
        let mut viva = Viva {
            id,
            plano,
            curvas: Vec::new(),
            pintada: None,
        };
        for (p, v) in viva.plano.valores.clone() {
            lote.operaciones.push(Operacion::Fijar {
                id,
                propiedad: p,
                valor: v,
            });
        }
        if let Some(a) = viva.plano.entrada.clone() {
            for (k, desde) in a.desde {
                if let Some(p) = propiedad(&k) {
                    let hasta = viva.muestra(p, ahora).0;
                    viva.animar(
                        p,
                        animacion::transicion(
                            &config(&self.sistema, a.transicion.as_ref()),
                            ahora,
                            desde,
                            hasta,
                            None,
                        ),
                        lote,
                    );
                }
            }
        }
        if let Some(b) = viva.plano.bucle.clone()
            && let Some(p) = propiedad(&b.propiedad)
        {
            let (actual, v) = viva.muestra(p, ahora);
            viva.animar(
                p,
                animacion::bucle_desde(&b.valores, b.duracion / 1000.0, ahora, actual, v),
                lote,
            );
        }
        viva
    }
    fn retirar(
        &mut self,
        mut anteriores: BTreeMap<String, Viva>,
        ahora: Instante,
        lote: &mut Lote,
    ) {
        let raices = anteriores
            .iter()
            .filter(|(_, v)| {
                v.plano
                    .padre
                    .as_ref()
                    .is_none_or(|p| !anteriores.contains_key(p))
            })
            .map(|(k, _)| k.clone())
            .collect::<Vec<_>>();
        for raiz in raices {
            let claves = anteriores
                .keys()
                .filter(|k| *k == &raiz || k.starts_with(&format!("{raiz}/")))
                .cloned()
                .collect::<Vec<_>>();
            let mut retiradas = Vec::new();
            let mut fin = ahora;
            let mut id_raiz = None;
            for clave in claves {
                if let Some(mut viva) = anteriores.remove(&clave) {
                    if clave == raiz {
                        id_raiz = Some(viva.id);
                    }
                    if let Some(salida) = viva.plano.salida.clone() {
                        for (k, hasta) in salida.hacia {
                            if let Some(p) = propiedad(&k) {
                                let (desde, velocidad) = viva.muestra(p, ahora);
                                let curva = animacion::transicion(
                                    &config(&self.sistema, salida.transicion.as_ref()),
                                    ahora,
                                    desde,
                                    hasta,
                                    Some(velocidad),
                                );
                                fin.0 = fin.0.max(ahora.0 + curva.fin);
                                viva.animar(p, curva, lote);
                            }
                        }
                    }
                    retiradas.push(viva);
                }
            }
            if fin > ahora {
                self.fantasmas.extend(retiradas.into_iter().map(|viva| {
                    let quitar = Some(viva.id) == id_raiz;
                    Fantasma { viva, fin, quitar }
                }));
            } else if let Some(id) = id_raiz {
                lote.operaciones.push(Operacion::Quitar { id });
            }
        }
    }
    pub fn avanzar(&mut self, ahora: Instante, _medidor: &dyn Medidor) -> Lote {
        self.ultimo = ahora;
        let mut lote = Lote::default();
        for viva in self.vivas.values_mut() {
            if let Some(p) = &viva.pintada {
                lote.operaciones.push(Operacion::Pintar {
                    id: viva.id,
                    dibujos: p.dibujos(ahora),
                });
                if ahora >= p.fin() {
                    viva.pintada = None;
                }
            }
        }
        self.fantasmas.retain(|f| {
            if ahora >= f.fin {
                if f.quitar {
                    lote.operaciones.push(Operacion::Quitar { id: f.viva.id });
                }
                false
            } else {
                true
            }
        });
        lote
    }
    pub fn proximo_fotograma(&self) -> Option<Instante> {
        self.vivas
            .values()
            .filter_map(|v| {
                v.pintada.as_ref().map(|p| {
                    Instante(
                        (self.ultimo.0 + 1.0 / 60.0)
                            .min(p.fin().0)
                            .max(self.ultimo.0),
                    )
                })
            })
            .chain(self.fantasmas.iter().map(|f| f.fin))
            .min_by(|a, b| a.0.total_cmp(&b.0))
    }
    /// Devuelve error si el nuevo diseño no puede representar el último modelo; conserva la escena.
    pub fn cambiar_receta(
        &mut self,
        receta: Receta,
        ahora: Instante,
        medidor: &dyn Medidor,
    ) -> Result<Lote, ErrorModelo> {
        let modelo = self.modelo.clone().unwrap_or_else(|| serde_json::json!({}));
        let planos = maquetacion::maquetar(&receta, &self.sistema, &modelo, medidor)?;
        self.limite_fundido(planos.len())?;
        let lote = self.fundir(planos, ahora);
        self.receta = receta;
        Ok(lote)
    }
    pub fn cambiar_sistema(
        &mut self,
        sistema: Sistema,
        ahora: Instante,
        medidor: &dyn Medidor,
    ) -> Result<Lote, ErrorModelo> {
        let modelo = self.modelo.clone().unwrap_or_else(|| serde_json::json!({}));
        let planos = maquetacion::maquetar(&self.receta, &sistema, &modelo, medidor)?;
        self.limite_fundido(planos.len())?;
        self.sistema = sistema;
        Ok(self.fundir(planos, ahora))
    }
    fn fundir(&mut self, planos: Vec<Plano>, ahora: Instante) -> Lote {
        let mut lote = Lote::default();
        let token = Value::String("$mov.cambio_sistema".into());
        let cfg = config(&self.sistema, Some(&token));
        let mut fin_arbol = ahora;
        for (_, mut viva) in std::mem::take(&mut self.vivas) {
            let raiz = viva.plano.padre.is_none();
            if raiz {
                let (v, d) = viva.muestra(Propiedad::Opacidad, ahora);
                let c = animacion::transicion(&cfg, ahora, v, 0.0, Some(d));
                let fin = Instante(ahora.0 + c.fin);
                fin_arbol = fin;
                viva.animar(Propiedad::Opacidad, c, &mut lote);
                self.fantasmas.push(Fantasma {
                    viva,
                    fin,
                    quitar: true,
                });
            } else {
                self.fantasmas.push(Fantasma {
                    viva,
                    fin: fin_arbol,
                    quitar: false,
                });
            }
        }
        self.aplicar(planos, ahora, &mut lote);
        for viva in self.vivas.values_mut().filter(|v| v.plano.padre.is_none()) {
            let hasta = viva.muestra(Propiedad::Opacidad, ahora).0;
            viva.animar(
                Propiedad::Opacidad,
                animacion::transicion(&cfg, ahora, 0.0, hasta, None),
                &mut lote,
            );
        }
        lote
    }
    fn limite_fundido(&self, nuevas: usize) -> Result<(), ErrorModelo> {
        if self.vivas.len() + self.fantasmas.len() + nuevas > 256
            || u32::try_from(nuevas)
                .ok()
                .and_then(|n| self.siguiente.checked_add(n))
                .is_none()
        {
            Err(ErrorModelo::limite("/capas"))
        } else {
            Ok(())
        }
    }
    pub fn valor(&self, capa: CapaId, propiedad: Propiedad, ahora: Instante) -> f32 {
        self.vivas
            .values()
            .chain(self.fantasmas.iter().map(|f| &f.viva))
            .find(|v| v.id == capa)
            .map_or(0.0, |v| v.muestra(propiedad, ahora).0)
    }
}
