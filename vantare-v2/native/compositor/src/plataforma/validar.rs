//! Validación de un borrador sin interfaces COM ni cambios visibles.
use super::{Error, MotivoOrden, Plataforma, Resultado, limites, tiempo};
use crate::escena::capas::{CapaId, Dibujo, Lote, Operacion, Pintura, Rect};
use std::collections::{BTreeMap, BTreeSet};
/// Exceso admitido en curvas de opacidad aproximadas por tramos cúbicos (DComp satura a 0..1).
const OPACIDAD_TOLERANCIA: f32 = 0.01;

impl Plataforma {
    pub(super) fn validar_lote(&self, lote: &Lote) -> Resultado<()> {
        let mut capas: BTreeMap<_, _> = self
            .capas
            .iter()
            .map(|(id, c)| (*id, (c.padre, c.rect)))
            .collect();
        for op in &lote.operaciones {
            match op {
                Operacion::Crear { id, padre, .. } => {
                    if capas.contains_key(id) {
                        return Err(Error::CapaDuplicada(*id));
                    }
                    if let Some(padre) = padre {
                        existe(&capas, *padre)?;
                    }
                    capas.insert(
                        *id,
                        (
                            *padre,
                            Rect {
                                x: 0.0,
                                y: 0.0,
                                ancho: 1.0,
                                alto: 1.0,
                            },
                        ),
                    );
                }
                Operacion::Quitar { id } => {
                    existe(&capas, *id)?;
                    let mut quitar = BTreeSet::from([*id]);
                    loop {
                        let antes = quitar.len();
                        for (id, (padre, _)) in &capas {
                            if padre.is_some_and(|p| quitar.contains(&p)) {
                                quitar.insert(*id);
                            }
                        }
                        if quitar.len() == antes {
                            break;
                        }
                    }
                    capas.retain(|id, _| !quitar.contains(id));
                }
                Operacion::Colocar { id, rect: r } => {
                    existe(&capas, *id)?;
                    rect_capa(*r)?;
                    capas.get_mut(id).ok_or(Error::Capa(*id))?.1 = *r;
                }
                Operacion::Pintar { id, dibujos } => {
                    let (_, r) = existe(&capas, *id)?;
                    limites::tinta(*r, dibujos)?;
                    self.validar_dibujos(dibujos)?;
                }
                Operacion::Fijar {
                    id,
                    propiedad,
                    valor,
                } => {
                    existe(&capas, *id)?;
                    if !valor.is_finite()
                        || valor.abs() > 1_000_000.0
                        || (*propiedad == crate::escena::capas::Propiedad::Opacidad
                            && !(0.0..=1.0).contains(valor))
                    {
                        return Err(Error::PropiedadInvalida);
                    }
                }
                Operacion::Animar {
                    id,
                    propiedad,
                    curva,
                } => {
                    existe(&capas, *id)?;
                    tiempo::programar(curva, 10_000_000)?;
                    let (min, max) = tiempo::rango(curva)?;
                    if min.abs() > 1_000_000.0
                        || max.abs() > 1_000_000.0
                        // Las aproximaciones cúbicas de una curva 0..1 rozan los extremos
                        // por milésimas; DirectComposition satura la opacidad a 0..1.
                        || (*propiedad == crate::escena::capas::Propiedad::Opacidad
                            && (min < -OPACIDAD_TOLERANCIA || max > 1.0 + OPACIDAD_TOLERANCIA))
                    {
                        return Err(Error::CurvaInvalida);
                    }
                }
                Operacion::Ordenar { padre, hijos } => validar_orden(&capas, *padre, hijos)?,
            }
        }
        Ok(())
    }
    fn validar_dibujos(&self, dibujos: &[Dibujo]) -> Resultado<()> {
        for dibujo in dibujos {
            match dibujo {
                Dibujo::Texto {
                    caja,
                    texto,
                    fuente,
                    alineacion,
                    color: c,
                } => {
                    rect(*caja)?;
                    color(*c)?;
                    self.texto
                        .layout(texto, fuente, caja.ancho, caja.alto, *alineacion)?;
                }
                Dibujo::Rect {
                    rect: r,
                    radios,
                    relleno,
                    borde,
                } => {
                    rect(*r)?;
                    esquinas(*radios)?;
                    if let Some(p) = relleno {
                        pintura(p)?;
                    }
                    if let Some((ancho, p)) = borde {
                        if !ancho.is_finite() || *ancho < 0.0 {
                            return Err(Error::RectInvalido);
                        }
                        pintura(p)?;
                    }
                }
                Dibujo::Sombra {
                    rect: r,
                    radios,
                    color: c,
                    desenfoque,
                    desplazamiento,
                } => {
                    rect(*r)?;
                    esquinas(*radios)?;
                    color(*c)?;
                    if !desenfoque.is_finite()
                        || !(0.0..=250.0).contains(desenfoque)
                        || ![desplazamiento.0, desplazamiento.1]
                            .iter()
                            .all(|v| v.is_finite())
                    {
                        return Err(Error::RectInvalido);
                    }
                }
                Dibujo::Recorte { rect: r, radios } => {
                    rect(*r)?;
                    esquinas(*radios)?;
                }
                Dibujo::FinRecorte => {}
            }
        }
        Ok(())
    }
}
fn existe(
    capas: &BTreeMap<CapaId, (Option<CapaId>, Rect)>,
    id: CapaId,
) -> Resultado<&(Option<CapaId>, Rect)> {
    capas.get(&id).ok_or(Error::Capa(id))
}
fn rect(r: Rect) -> Resultado<()> {
    if ![r.x, r.y, r.ancho, r.alto].iter().all(|v| v.is_finite())
        || r.x.abs() > 1_000_000.0
        || r.y.abs() > 1_000_000.0
        || r.ancho <= 0.0
        || r.alto <= 0.0
        || r.ancho > 16384.0
        || r.alto > 16384.0
    {
        return Err(Error::RectInvalido);
    }
    Ok(())
}
/// Una capa puede medir cero (plegada o vacía): no tiene superficie hasta crecer.
fn rect_capa(r: Rect) -> Resultado<()> {
    if r.ancho == 0.0 || r.alto == 0.0 {
        return rect(Rect {
            ancho: r.ancho.max(1.0),
            alto: r.alto.max(1.0),
            ..r
        });
    }
    rect(r)
}
fn esquinas(radios: [f32; 4]) -> Resultado<()> {
    if radios.iter().any(|v| !v.is_finite() || *v < 0.0) {
        return Err(Error::RectInvalido);
    }
    Ok(())
}
fn color(c: crate::escena::capas::Color) -> Resultado<()> {
    if [c.r, c.g, c.b, c.a]
        .iter()
        .any(|v| !v.is_finite() || !(0.0..=1.0).contains(v))
    {
        return Err(Error::PropiedadInvalida);
    }
    Ok(())
}
fn pintura(p: &Pintura) -> Resultado<()> {
    match p {
        Pintura::Solido(c) => color(*c),
        Pintura::Lineal {
            desde,
            hasta,
            paradas,
        } => {
            if ![desde.0, desde.1, hasta.0, hasta.1]
                .iter()
                .all(|v| v.is_finite())
            {
                return Err(Error::RectInvalido);
            }
            paradas_validas(paradas)
        }
        Pintura::Radial {
            centro,
            radio,
            paradas,
        } => {
            if ![centro.0, centro.1, radio.0, radio.1]
                .iter()
                .all(|v| v.is_finite())
                || radio.0 <= 0.0
                || radio.1 <= 0.0
            {
                return Err(Error::RectInvalido);
            }
            paradas_validas(paradas)
        }
    }
}
fn paradas_validas(paradas: &[crate::escena::capas::Parada]) -> Resultado<()> {
    if paradas.len() < 2 {
        return Err(Error::PropiedadInvalida);
    }
    let mut anterior = 0.0;
    for p in paradas {
        if !p.posicion.is_finite() || !(anterior..=1.0).contains(&p.posicion) {
            return Err(Error::PropiedadInvalida);
        }
        color(p.color)?;
        anterior = p.posicion;
    }
    Ok(())
}
fn validar_orden(
    capas: &BTreeMap<CapaId, (Option<CapaId>, Rect)>,
    padre: Option<CapaId>,
    hijos: &[CapaId],
) -> Resultado<()> {
    if let Some(p) = padre {
        existe(capas, p)?;
    }
    let error = |motivo| Error::OrdenInvalido { padre, motivo };
    let mut ids = BTreeSet::new();
    for id in hijos {
        if existe(capas, *id)?.0 != padre {
            return Err(error(MotivoOrden::PadreDistinto(*id)));
        }
        if !ids.insert(*id) {
            return Err(error(MotivoOrden::Duplicada(*id)));
        }
    }
    let esperada = capas.values().filter(|(p, _)| *p == padre).count();
    if esperada != hijos.len() {
        return Err(error(MotivoOrden::Cantidad {
            esperada,
            recibida: hijos.len(),
        }));
    }
    Ok(())
}
