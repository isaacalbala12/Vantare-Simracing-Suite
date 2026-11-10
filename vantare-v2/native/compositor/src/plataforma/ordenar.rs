use super::{Error, Modo, Plataforma, Resultado};
use crate::escena::capas::CapaId;
use std::collections::BTreeSet;
use windows::{
    Win32::{
        Graphics::DirectComposition::IDCompositionVisual,
        UI::WindowsAndMessaging::{
            BeginDeferWindowPos, DeferWindowPos, EndDeferWindowPos, HWND_TOPMOST, SWP_NOACTIVATE,
            SWP_NOMOVE, SWP_NOSIZE,
        },
    },
    core::Interface,
};

#[derive(Debug, PartialEq, Eq)]
pub enum MotivoOrden {
    Duplicada(CapaId),
    PadreDistinto(CapaId),
    Cantidad { esperada: usize, recibida: usize },
}

impl Plataforma {
    fn validar_orden(&self, padre: Option<CapaId>, hijos: &[CapaId]) -> Resultado<()> {
        if let Some(padre) = padre {
            self.capa(padre)?;
        }
        let mut unicas = BTreeSet::new();
        for id in hijos {
            let capa = self.capa(*id)?;
            if capa.padre != padre {
                return Err(Error::OrdenInvalido {
                    padre,
                    motivo: MotivoOrden::PadreDistinto(*id),
                });
            }
            if !unicas.insert(*id) {
                return Err(Error::OrdenInvalido {
                    padre,
                    motivo: MotivoOrden::Duplicada(*id),
                });
            }
        }
        let esperada = self.capas.values().filter(|c| c.padre == padre).count();
        if hijos.len() != esperada {
            return Err(Error::OrdenInvalido {
                padre,
                motivo: MotivoOrden::Cantidad {
                    esperada,
                    recibida: hijos.len(),
                },
            });
        }
        Ok(())
    }

    pub(super) fn ordenar(&mut self, padre: Option<CapaId>, hijos: &[CapaId]) -> Resultado<()> {
        self.validar_orden(padre, hijos)?;
        if padre.is_none() && self.modo == Modo::PorOverlay {
            self.ordenar_salidas(hijos)?;
        } else {
            let contenedor: IDCompositionVisual = if let Some(padre) = padre {
                self.capa(padre)?.visual.cast()?
            } else {
                self.salidas
                    .get(&None)
                    .ok_or(Error::Entrada("Sin salida Monitor"))?
                    .raiz
                    .cast()?
            };
            let mut referencia = padre
                .map(|id| {
                    self.capa(id)?
                        .contenido
                        .cast::<IDCompositionVisual>()
                        .map_err(Error::from)
                })
                .transpose()?;
            unsafe {
                for id in hijos {
                    contenedor.RemoveVisual(&self.capa(*id)?.posicion)?;
                }
                // AddVisual(TRUE, NULL) coloca debajo de todas las hermanas;
                // con referencia, TRUE coloca inmediatamente por encima de ella.
                for id in hijos {
                    let visual = &self.capa(*id)?.posicion;
                    contenedor.AddVisual(visual, true, referencia.as_ref())?;
                    referencia = Some(visual.cast()?);
                }
            }
        }
        for (indice, id) in hijos.iter().enumerate() {
            self.capas.get_mut(id).ok_or(Error::Capa(*id))?.orden =
                u32::try_from(indice).map_err(|_| Error::Entrada("Demasiadas capas hermanas"))?;
        }
        Ok(())
    }

    fn ordenar_salidas(&self, hijos: &[CapaId]) -> Resultado<()> {
        if hijos.is_empty() {
            return Ok(());
        }
        let ventanas: Vec<_> = hijos
            .iter()
            .map(|id| {
                self.salidas
                    .get(&Some(*id))
                    .map(|s| s.ventana.hwnd)
                    .ok_or(Error::Entrada("Salida raíz ausente"))
            })
            .collect::<Resultado<_>>()?;
        let cantidad =
            i32::try_from(ventanas.len()).map_err(|_| Error::Entrada("Demasiadas salidas"))?;
        unsafe {
            let mut grupo = BeginDeferWindowPos(cantidad)?;
            for ventana in ventanas {
                grupo = DeferWindowPos(
                    grupo,
                    ventana,
                    Some(HWND_TOPMOST),
                    0,
                    0,
                    0,
                    0,
                    SWP_NOMOVE | SWP_NOSIZE | SWP_NOACTIVATE,
                )?;
            }
            EndDeferWindowPos(grupo)?;
        }
        Ok(())
    }
}
