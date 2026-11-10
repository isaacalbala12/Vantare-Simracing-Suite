use super::{Plataforma, Resultado};
use serde::Serialize;
use std::path::Path;

#[derive(Default, Serialize)]
pub struct Distribucion {
    pub muestras: usize,
    pub mediana_ms: f64,
    pub p99_ms: f64,
    pub maximo_ms: f64,
}
impl Distribucion {
    fn de(mut valores: Vec<f64>) -> Self {
        valores.sort_by(f64::total_cmp);
        let n = valores.len();
        if n == 0 {
            return Self::default();
        }
        Self {
            muestras: n,
            mediana_ms: if n.is_multiple_of(2) {
                f64::midpoint(valores[n / 2 - 1],valores[n / 2])
            } else {
                valores[n / 2]
            },
            p99_ms: valores[(n - 1) * 99 / 100],
            maximo_ms: valores[n - 1],
        }
    }
}
#[derive(Default)]
pub struct Medicion {
    ultimo: Option<i64>,
    intervalos: Vec<f64>,
    perdidos: u64,
}
#[derive(Serialize)]
struct Informe {
    fuente: &'static str,
    fotogramas: Distribucion,
    trabajo_lote: Distribucion,
    perdidos: u64,
}
impl Medicion {
    pub fn fotograma(&mut self, p: &Plataforma) -> Resultado<()> {
        let s = unsafe { p.dispositivo.GetFrameStatistics()? };
        if self.ultimo == Some(s.lastFrameTime) {
            return Ok(());
        }
        if let Some(anterior) = self.ultimo {
            let intervalo = super::tiempo_qpc(s.lastFrameTime - anterior, s.timeFrequency)?;
            let periodo = f64::from(s.currentCompositionRate.Denominator)
                / f64::from(s.currentCompositionRate.Numerator);
            self.intervalos.push(intervalo * 1000.0);
            if intervalo > 1.5 * periodo {
                self.perdidos += 1;
            }
        }
        self.ultimo = Some(s.lastFrameTime);
        Ok(())
    }
    pub fn guardar(&self, p: &Plataforma, ruta: &Path) -> Resultado<()> {
        let informe = Informe {
            fuente: "IDCompositionDevice::GetFrameStatistics lastFrameTime (muestreo del compositor, no presentación del simulador)",
            fotogramas: Distribucion::de(self.intervalos.clone()),
            trabajo_lote: Distribucion::de(p.trabajos_ms.clone()),
            perdidos: self.perdidos,
        };
        std::fs::write(ruta, serde_json::to_vec_pretty(&informe)?)?;
        Ok(())
    }
}
