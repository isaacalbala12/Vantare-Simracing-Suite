use super::{Error, Plataforma, Resultado};
use crate::escena::capas::Instante;
use serde::Serialize;
use std::path::Path;
use windows::Win32::{
    Foundation::HWND,
    Graphics::Dwm::{DWM_TIMING_INFO, DwmGetCompositionTimingInfo},
};

#[derive(Default, Serialize)]
pub struct Distribucion {
    pub muestras: usize,
    pub mediana_ms: f64,
    pub p99_ms: f64,
    pub maximo_ms: f64,
}
impl Distribucion {
    fn de(mut v: Vec<f64>) -> Self {
        v.sort_by(f64::total_cmp);
        let n = v.len();
        if n == 0 {
            return Self::default();
        }
        Self {
            muestras: n,
            mediana_ms: if n.is_multiple_of(2) {
                f64::midpoint(v[n / 2 - 1], v[n / 2])
            } else {
                v[n / 2]
            },
            p99_ms: v[n - n / 100 - 1],
            maximo_ms: v[n - 1],
        }
    }
}
#[derive(Clone, Copy, Default)]
struct Contadores {
    refrescos: u64,
    fotogramas: u64,
    perdidos: u64,
    descartados: u64,
    hz: f64,
}
fn contadores() -> Resultado<Contadores> {
    let mut info = DWM_TIMING_INFO {
        cbSize: u32::try_from(std::mem::size_of::<DWM_TIMING_INFO>())
            .map_err(|_| Error::Entrada("Tamaño DWM"))?,
        ..Default::default()
    };
    // SAFETY: estructura dimensionada, puntero válido; HWND nulo pide estadísticas globales de DWM.
    unsafe {
        DwmGetCompositionTimingInfo(HWND::default(), &raw mut info)?;
    }
    Ok(Contadores {
        refrescos: info.cRefresh,
        fotogramas: info.cFrame,
        perdidos: info.cFramesMissed,
        descartados: info.cFramesDropped,
        hz: f64::from(info.rateRefresh.uiNumerator) / f64::from(info.rateRefresh.uiDenominator),
    })
}
struct Pendiente {
    reposo: bool,
    nombre: String,
    inicio: Instante,
    fin: Instante,
    contadores: Contadores,
}
#[derive(Serialize)]
struct Transicion {
    nombre: String,
    reposo: bool,
    duracion_s: f64,
    refrescos: u64,
    fotogramas_compuestos: u64,
    fotogramas_perdidos: u64,
    fotogramas_descartados: u64,
    refrescos_esperados: f64,
    refrescos_coherentes: bool,
}
fn comparar(
    nombre: String,
    segundos: f64,
    antes: Contadores,
    despues: Contadores,
    reposo: bool,
) -> Transicion {
    let refrescos = despues.refrescos.saturating_sub(antes.refrescos);
    let esperados = segundos * antes.hz;
    #[expect(
        clippy::cast_precision_loss,
        reason = "Contadores de una ventana de medición de segundos, por debajo de 2^53"
    )]
    let observados = refrescos as f64;
    let valida = esperados.is_finite()
        && esperados > 0.0
        && observados >= esperados * 0.75
        && observados <= esperados * 1.25
        && despues.fotogramas >= antes.fotogramas;
    Transicion {
        nombre,
        reposo,
        duracion_s: segundos,
        refrescos,
        fotogramas_compuestos: despues.fotogramas.saturating_sub(antes.fotogramas),
        fotogramas_perdidos: despues.perdidos.saturating_sub(antes.perdidos),
        fotogramas_descartados: despues.descartados.saturating_sub(antes.descartados),
        refrescos_esperados: esperados,
        refrescos_coherentes: valida,
    }
}
#[derive(Default)]
pub struct Medicion {
    ultimo: Option<i64>,
    intervalos: Vec<f64>,
    reloj_estado: Option<u32>,
    pendientes: Vec<Pendiente>,
    transiciones: Vec<Transicion>,
    inicio: Option<Instante>,
    monitor_confirmado: bool,
}
#[derive(Serialize)]
struct Informe<'a> {
    fuente: &'static str,
    valida: bool,
    motivos: Vec<&'static str>,
    reloj_estado: Option<u32>,
    fotogramas: Option<Distribucion>,
    transiciones: &'a [Transicion],
    trabajo_lote: Distribucion,
    lotes: &'a [super::TrabajoLote],
    repintados: u64,
    superficies_creadas: u64,
    repintados_por_segundo: f64,
}
impl Medicion {
    /// Solo tras comprobar físicamente el monitor; los contadores DWM no lo prueban.
    pub fn confirmar_monitor_encendido(&mut self, confirmado: bool) {
        self.monitor_confirmado = confirmado;
    }
    pub fn comenzar_reposo(&mut self, p: &Plataforma, fin: Instante) -> Resultado<()> {
        self.pendientes.push(Pendiente {
            reposo: true,
            nombre: "reposo previo sin animaciones".into(),
            inicio: p.ahora()?,
            fin,
            contadores: contadores()?,
        });
        Ok(())
    }

    pub fn registrar_estado_reloj(&mut self, estado: Option<u32>) {
        self.reloj_estado = estado;
    }
    pub fn comenzar_transicion(
        &mut self,
        p: &Plataforma,
        nombre: &str,
        fin: Instante,
    ) -> Resultado<()> {
        let inicio = p.ahora()?;
        self.inicio.get_or_insert(inicio);
        self.pendientes.push(Pendiente {
            reposo: false,
            nombre: nombre.into(),
            inicio,
            fin,
            contadores: contadores()?,
        });
        Ok(())
    }
    pub fn fotograma(&mut self, p: &Plataforma) -> Resultado<()> {
        let ahora = p.ahora()?;
        self.terminar_transiciones(ahora, false)?;
        // SAFETY: dispositivo vivo del hilo COM creador. Solo es diagnóstico de muestreo.
        let s = unsafe { p.dispositivo.GetFrameStatistics()? };
        if self.ultimo == Some(s.lastFrameTime) {
            return Ok(());
        }
        if let Some(anterior) = self.ultimo {
            self.intervalos
                .push(super::tiempo_qpc(s.lastFrameTime - anterior, s.timeFrequency)? * 1000.0);
        }
        self.ultimo = Some(s.lastFrameTime);
        Ok(())
    }
    fn terminar_transiciones(&mut self, ahora: Instante, todas: bool) -> Resultado<()> {
        let despues = contadores()?;
        let mut restantes = Vec::new();
        for t in self.pendientes.drain(..) {
            if todas || ahora.0 >= t.fin.0 {
                self.transiciones.push(comparar(
                    t.nombre,
                    ahora.0 - t.inicio.0,
                    t.contadores,
                    despues,
                    t.reposo,
                ));
            } else {
                restantes.push(t);
            }
        }
        self.pendientes = restantes;
        Ok(())
    }
    pub fn guardar(&mut self, p: &Plataforma, ruta: &Path) -> Resultado<()> {
        let ahora = p.ahora()?;
        self.terminar_transiciones(ahora, true)?;
        let mut motivos = Vec::new();
        if !self.monitor_confirmado {
            motivos.push("No válidos hasta confirmar monitor físico encendido");
        }
        if self.reloj_estado == Some(0xc01e_0006) {
            motivos.push("Pantalla ocluida o dormida según el reloj DComp");
        }
        if self.transiciones.is_empty() || self.transiciones.iter().any(|t| !t.refrescos_coherentes)
        {
            motivos.push("Los refrescos DWM no concuerdan con la frecuencia esperada del monitor");
        }
        if !self
            .transiciones
            .iter()
            .any(|t| t.reposo && t.duracion_s >= 1.5)
        {
            motivos.push("Falta una muestra de reposo previa de al menos 1,5 segundos");
        }
        let valida = motivos.is_empty();
        let segundos = self.inicio.map_or(0.0, |t| ahora.0 - t.0);
        #[expect(
            clippy::cast_precision_loss,
            reason = "Contador de repintados durante segundos, por debajo de 2^53"
        )]
        let repintados = p.pintados as f64;
        let informe = Informe {
            fuente: "DwmGetCompositionTimingInfo: contadores entre extremos de cada transición; percentiles de lastFrameTime solo con pantalla activa",
            valida,
            motivos,
            reloj_estado: self.reloj_estado,
            fotogramas: valida.then(|| Distribucion::de(self.intervalos.clone())),
            transiciones: &self.transiciones,
            trabajo_lote: Distribucion::de(p.trabajos_ms.clone()),
            lotes: &p.trabajos_detalle,
            repintados: p.pintados,
            superficies_creadas: p.superficies_creadas,
            repintados_por_segundo: if segundos > 0.0 {
                repintados / segundos
            } else {
                0.0
            },
        };
        std::fs::write(ruta, serde_json::to_vec_pretty(&informe)?)?;
        Ok(())
    }
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn una_pantalla_dormida_invalida_los_contadores_aunque_el_proceso_muestree() {
        let antes = Contadores {
            refrescos: 100,
            fotogramas: 80,
            hz: 60.0,
            ..Default::default()
        };
        let dormida = Contadores {
            refrescos: 101,
            fotogramas: 81,
            ..antes
        };
        assert!(!comparar("dormida".into(), 2.0, antes, dormida, true).refrescos_coherentes);
        let activa = Contadores {
            refrescos: 220,
            fotogramas: 200,
            ..antes
        };
        assert!(comparar("activa".into(), 2.0, antes, activa, false).refrescos_coherentes);
    }
    #[test]
    fn el_p99_incluye_el_lote_mas_lento() {
        assert!((Distribucion::de(vec![1.0, 2.0, 180.0]).p99_ms - 180.0).abs() < f64::EPSILON);
    }
}
