//! Ejecución del programa tipado: ámbitos prestados y flexbox, sin resolver JSON de diseño.
use super::{
    ErrorModelo, Medidor,
    capas::{self, Dibujo, Fuente, Pintura},
};
use crate::receta::{
    Programa,
    programa::{
        Aparicion, Bucle, Contenido, Contexto, EstiloBase, NodoPrograma, Pintadas, REPOSO, Texto,
        Transiciones,
    },
};
use serde_json::Value;
use std::{collections::BTreeSet, sync::Arc};
use taffy::prelude::*;

#[derive(Clone, Debug, PartialEq, Eq, PartialOrd, Ord)]
pub(crate) enum ParteClave {
    Nodo(u16),
    Fila(Arc<str>),
}
#[derive(Clone, Debug, PartialEq, Eq, PartialOrd, Ord)]
pub(crate) struct Clave(pub Vec<ParteClave>);
impl Clave {
    fn hija(&self, parte: ParteClave) -> Self {
        let mut v = self.0.clone();
        v.push(parte);
        Self(v)
    }
}
#[derive(Clone)]
pub(crate) struct Plano {
    pub clave: Clave,
    pub padre: Option<Clave>,
    pub puntero: Arc<str>,
    pub rect: capas::Rect,
    pub dibujos: Arc<[Dibujo]>,
    pub origenes: Arc<[(u16, u8)]>,
    pub pintadas: Arc<[Arc<Pintadas>]>,
    pub valores: [f32; 5],
    pub visible: bool,
    pub transiciones: Arc<Transiciones>,
    pub entrada: Option<Arc<Aparicion>>,
    pub salida: Option<Arc<Aparicion>>,
    pub movimiento: Option<crate::receta::Transicion>,
    pub bucle: Option<Arc<Bucle>>,
}
struct Expandido<'a> {
    programa: &'a NodoPrograma,
    clave: Clave,
    estilo: EstiloBase,
    texto: Option<(String, Fuente, capas::Color)>,
    fondo: Option<Pintura>,
    borde: Option<(f32, Pintura)>,
    hijos: Vec<Self>,
    visible: bool,
    bucle: Option<Arc<Bucle>>,
    valores: [f32; 5],
    layout: NodeId,
    entrada: Option<Arc<Aparicion>>,
    salida: Option<Arc<Aparicion>>,
    movimiento: Option<crate::receta::Transicion>,
}
struct Expansion<'a> {
    medidor: &'a dyn Medidor,
    tree: TaffyTree<Size<f32>>,
    cantidad: usize,
}
impl Expansion<'_> {
    fn nodo<'n>(
        &mut self,
        n: &'n NodoPrograma,
        c: &mut Contexto<'_>,
        clave: Clave,
        visible_raiz: bool,
    ) -> Result<Expandido<'n>, ErrorModelo> {
        self.cantidad += 1;
        if self.cantidad > 4096 {
            return Err(ErrorModelo::limite(&n.puntero));
        }
        let (estilo, bucle, visible) = Self::estado(n, c, visible_raiz)?;
        let mut valores = REPOSO;
        for (i, v) in estilo.valores.iter().enumerate() {
            valores[i] = v.evaluar(c, &format!("{}/estilo/{}", n.puntero, nombre(i)))?;
        }
        if !(0.0..=1.0).contains(&valores[0]) {
            return Err(ErrorModelo::enlace(&format!(
                "{}/estilo/opacidad",
                n.puntero
            )));
        }
        if !visible {
            valores[0] = 0.0;
        }
        let mut texto = None;
        let mut hijos = Vec::new();
        match &n.contenido {
            Contenido::Texto(t) => texto = Some(Self::texto(n, t, &estilo, c)?),
            Contenido::Caja(nodos) => {
                for h in nodos {
                    hijos.push(self.nodo(h, c, clave.hija(ParteClave::Nodo(h.id)), true)?);
                }
            }
            Contenido::Lista { .. } => self.lista(n, c, &clave, &mut hijos)?,
        }

        let fondo = estilo
            .fondo
            .as_ref()
            .map(|v| v.evaluar(c, &format!("{}/estilo/fondo", n.puntero)))
            .transpose()?;
        let borde = estilo
            .borde
            .as_ref()
            .map(|(ancho, v)| {
                v.evaluar(c, &format!("{}/estilo/borde/color", n.puntero))
                    .map(|color| (*ancho, Pintura::Solido(color)))
            })
            .transpose()?;
        let layout = if let Some((cadena, fuente, _)) = &texto {
            let (ancho, alto) = self.medidor.medir(cadena, fuente);
            if !ancho.is_finite()
                || !alto.is_finite()
                || !(0.0..=1_000_000.0).contains(&ancho)
                || !(0.0..=1_000_000.0).contains(&alto)
            {
                return Err(ErrorModelo::layout(&format!("{}/texto", n.puntero)));
            }
            self.tree.new_leaf_with_context(
                estilo.layout.clone(),
                Size {
                    width: ancho,
                    height: alto,
                },
            )
        } else {
            self.tree.new_with_children(
                estilo.layout.clone(),
                &hijos.iter().map(|h| h.layout).collect::<Vec<_>>(),
            )
        }
        .map_err(|_| ErrorModelo::layout(&n.puntero))?;
        Ok(Expandido {
            programa: n,
            clave,
            estilo,
            texto,
            fondo,
            borde,
            hijos,
            visible,
            bucle,
            valores,
            layout,
            entrada: n.entrada.clone(),
            salida: n.salida.clone(),
            movimiento: n.movimiento,
        })
    }
    fn estado(
        n: &NodoPrograma,
        c: &Contexto<'_>,
        visible_raiz: bool,
    ) -> Result<(EstiloBase, Option<Arc<Bucle>>, bool), ErrorModelo> {
        let mut estilo = n.base.clone();
        let mut bucle = n.bucle.clone();
        for e in &n.estados {
            if e.condicion
                .evaluar(c, &format!("{}/estados/cuando", n.puntero))?
            {
                for cambio in &e.cambios {
                    cambio.aplicar(&mut estilo);
                }
                if e.bucle.is_some() {
                    bucle.clone_from(&e.bucle);
                }
            }
        }
        let visible = visible_raiz
            && match &n.visible {
                Some(v) => v.evaluar(c, &format!("{}/visible", n.puntero))?,
                None => true,
            };
        if !visible {
            bucle = None;
        }
        if let Some(b) = &bucle
            && let Some(cuando) = &b.cuando
            && !cuando.evaluar(c, &format!("{}/bucle/cuando", n.puntero))?
        {
            bucle = None;
        }
        Ok((estilo, bucle, visible))
    }
    fn texto(
        n: &NodoPrograma,
        t: &Texto,
        estilo: &EstiloBase,
        c: &Contexto<'_>,
    ) -> Result<(String, Fuente, capas::Color), ErrorModelo> {
        let mut cadena = t.evaluar(c, &format!("{}/texto", n.puntero))?;
        let fuente = estilo
            .fuente
            .as_ref()
            .map_or(&t.fuente, |v| v)
            .evaluar(c, &format!("{}/estilo/tipo", n.puntero))?;
        let color = estilo
            .color
            .as_ref()
            .map_or(&t.color, |v| v)
            .evaluar(c, &format!("{}/estilo/color", n.puntero))?;
        if fuente.mayusculas {
            cadena = cadena.to_uppercase();
        }
        if cadena.chars().count() > 256 {
            return Err(ErrorModelo::limite(&format!("{}/texto", n.puntero)));
        }
        Ok((cadena, fuente, color))
    }
    fn lista<'n>(
        &mut self,
        n: &'n NodoPrograma,
        c: &mut Contexto<'_>,
        clave: &Clave,
        hijos: &mut Vec<Expandido<'n>>,
    ) -> Result<(), ErrorModelo> {
        if let Contenido::Lista {
            de,
            clave: campo_clave,
            plantilla,
        } = &n.contenido
        {
            let lista = de
                .leer(c, &format!("{}/de", n.puntero))?
                .as_array()
                .ok_or_else(|| ErrorModelo::enlace(&format!("{}/de", n.puntero)))?;
            if lista.len() > 64 {
                return Err(ErrorModelo::limite(&format!("{}/de", n.puntero)));
            }
            let mut claves = BTreeSet::new();
            for fila in lista {
                let valor = fila
                    .get(campo_clave)
                    .ok_or_else(|| ErrorModelo::enlace(&format!("{}/clave", n.puntero)))?;
                let clave_fila: Arc<str> = match valor {
                    Value::String(s) => Arc::from(s.as_str()),
                    Value::Number(n) => Arc::from(n.to_string()),
                    _ => return Err(ErrorModelo::enlace(&format!("{}/clave", n.puntero))),
                };
                if !claves.insert(clave_fila.clone()) {
                    return Err(ErrorModelo::identidad(&format!("{}/clave", n.puntero)));
                }
                c.ambitos.push(fila);
                let hijo = self.nodo(
                    plantilla,
                    c,
                    clave
                        .hija(ParteClave::Fila(clave_fila))
                        .hija(ParteClave::Nodo(plantilla.id)),
                    true,
                );
                c.ambitos.pop();
                let mut hijo = hijo?;
                hijo.entrada.clone_from(&n.entrada);
                hijo.salida.clone_from(&n.salida);
                hijo.movimiento = n.movimiento;
                hijos.push(hijo);
            }
        }
        Ok(())
    }
    fn planos(
        &self,
        n: &Expandido<'_>,
        padre: Option<&Clave>,
        offset: (f32, f32),
        salida: &mut Vec<Plano>,
        capa: usize,
    ) -> Result<(), ErrorModelo> {
        let layout = self
            .tree
            .layout(n.layout)
            .map_err(|_| ErrorModelo::layout(&n.programa.puntero))?;
        let rect = capas::Rect {
            x: offset.0 + layout.location.x,
            y: offset.1 + layout.location.y,
            ancho: layout.size.width,
            alto: layout.size.height,
        };
        if [rect.x, rect.y, rect.ancho, rect.alto]
            .iter()
            .any(|v| !v.is_finite() || v.abs() > 1_000_000.0)
        {
            return Err(ErrorModelo::layout(&n.programa.puntero));
        }
        let propia = n.programa.capa;
        let indice = if propia {
            if salida.len() >= 256 {
                return Err(ErrorModelo::limite(&n.programa.puntero));
            }
            salida.push(Plano {
                clave: n.clave.clone(),
                padre: padre.cloned(),
                puntero: n.programa.puntero.clone(),
                rect,
                dibujos: Arc::from([]),
                origenes: Arc::from([]),
                pintadas: Arc::from([]),
                valores: n.valores,
                visible: n.visible,
                transiciones: n.programa.transiciones.clone(),
                entrada: n.entrada.clone(),
                salida: n.salida.clone(),
                movimiento: n.movimiento,
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
        let nuevos = dibujos(n, rect_dibujo);
        let plano = &mut salida[indice];
        let mut dibujos = plano.dibujos.to_vec();
        let mut pintadas = plano.pintadas.to_vec();
        let mut origenes = plano.origenes.to_vec();
        origenes.extend(nuevos.iter().map(|d| {
            (
                n.programa.id,
                match d {
                    Dibujo::Rect { .. } => 0,
                    Dibujo::Texto { .. } => 1,
                    Dibujo::Sombra { .. } => 2,
                    Dibujo::Recorte { .. } => 3,
                    Dibujo::FinRecorte => 4,
                },
            )
        }));
        pintadas.extend(std::iter::repeat_n(
            n.programa.transiciones.pintadas.clone(),
            nuevos.len(),
        ));
        dibujos.extend(nuevos);
        plano.dibujos = dibujos.into();
        plano.pintadas = pintadas.into();
        plano.origenes = origenes.into();
        let padre = salida[indice].clave.clone();
        for hijo in &n.hijos {
            self.planos(hijo, Some(&padre), local, salida, indice)?;
        }
        Ok(())
    }
}
pub(crate) fn maquetar(
    p: &Programa,
    modelo: &Value,
    medidor: &dyn Medidor,
) -> Result<Vec<Plano>, ErrorModelo> {
    p.datos.contrato.validar(modelo)?;
    let mut contexto = Contexto {
        raiz: modelo,
        ambitos: Vec::new(),
    };
    let visible = match &p.datos.visible {
        Some(c) => c.evaluar(&contexto, "/visible")?,
        None => true,
    };
    let mut e = Expansion {
        medidor,
        tree: TaffyTree::new(),
        cantidad: 0,
    };
    let raiz = e.nodo(
        &p.datos.raiz,
        &mut contexto,
        Clave(vec![ParteClave::Nodo(p.datos.raiz.id)]),
        visible,
    )?;
    e.tree
        .compute_layout_with_measure(
            raiz.layout,
            Size {
                width: AvailableSpace::MaxContent,
                height: AvailableSpace::MaxContent,
            },
            |entrada, _, contexto, estilo| {
                taffy::compute_leaf_layout(
                    entrada,
                    estilo,
                    |_, _| 0.0,
                    |conocido, disponible| {
                        let medido = match contexto {
                            Some(v) => *v,
                            None => Size {
                                width: 0.0,
                                height: 0.0,
                            },
                        };
                        let ancho = match disponible.width {
                            AvailableSpace::Definite(v) => medido.width.min(v),
                            AvailableSpace::MinContent => 0.0,
                            AvailableSpace::MaxContent => medido.width,
                        };
                        Size {
                            width: conocido.width.map_or(ancho, |v| v),
                            height: conocido.height.map_or(medido.height, |v| v),
                        }
                    },
                )
            },
        )
        .map_err(|_| ErrorModelo::layout("/raiz"))?;
    let mut planos = Vec::new();
    e.planos(&raiz, None, (0.0, 0.0), &mut planos, 0)?;
    Ok(planos)
}
fn dibujos(n: &Expandido<'_>, rect: capas::Rect) -> Vec<Dibujo> {
    let e = &n.estilo;
    let mut salida = Vec::new();
    if let Some(s) = e.sombra {
        salida.push(Dibujo::Sombra {
            rect,
            radios: e.radios,
            color: s.color,
            desenfoque: s.desenfoque,
            desplazamiento: s.desplazamiento,
        });
    }
    let fondo = n.fondo.clone();
    let borde = n.borde.clone();
    if fondo.is_some() || borde.is_some() {
        salida.push(Dibujo::Rect {
            rect,
            radios: e.radios,
            relleno: fondo,
            borde,
        });
    }
    if let Some((texto, fuente, color)) = &n.texto {
        salida.push(Dibujo::Texto {
            caja: rect,
            texto: texto.clone(),
            fuente: fuente.clone(),
            color: *color,
            alineacion: e.alineacion,
        });
    }
    salida
}
fn nombre(i: usize) -> &'static str {
    match i {
        0 => "opacidad",
        1 => "x",
        2 => "y",
        3 => "escala",
        _ => "giro",
    }
}
