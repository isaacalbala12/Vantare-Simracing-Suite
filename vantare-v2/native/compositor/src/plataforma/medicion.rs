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
                f64::midpoint(valores[n / 2 - 1], valores[n / 2])
            } else {
                valores[n / 2]
            },
            p99_ms: valores[n - n / 100 - 1],
            maximo_ms: valores[n - 1],
        }
    }
}
#[derive(Default)]
pub struct Medicion {
    ultimo: Option<i64>,
    intervalos: Vec<f64>,
    perdidos: u64,
    reloj_estado: Option<u32>,
    periodo_esperado_ms: Option<f64>,
}
#[derive(Serialize)]
struct Informe {
    fuente: &'static str,
    fotogramas: Distribucion,
    trabajo_lote: Distribucion,
    perdidos: u64,
    reloj_estado: Option<u32>,
    periodo_esperado_ms: Option<f64>,
}
impl Medicion {
    pub fn registrar_estado_reloj(&mut self, estado: Option<u32>) {
        self.reloj_estado = estado;
    }
    pub fn fotograma(&mut self, p: &Plataforma) -> Resultado<()> {
        let s = unsafe { p.dispositivo.GetFrameStatistics()? };
        if self.ultimo == Some(s.lastFrameTime) {
            return Ok(());
        }
        if let Some(anterior) = self.ultimo {
            let intervalo = super::tiempo_qpc(s.lastFrameTime - anterior, s.timeFrequency)?;
            let periodo = f64::from(s.currentCompositionRate.Denominator)
                / f64::from(s.currentCompositionRate.Numerator);
            self.periodo_esperado_ms = Some(periodo * 1000.0);
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
            reloj_estado: self.reloj_estado,
            periodo_esperado_ms: self.periodo_esperado_ms,
        };
        std::fs::write(ruta, serde_json::to_vec_pretty(&informe)?)?;
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn el_p99_de_una_ventana_corta_incluye_el_peor_lote() {
        let medidas = Distribucion::de(vec![100.0, 1.0, 3.0, 2.0]);
        assert_eq!(medidas.muestras, 4);
        assert!((medidas.mediana_ms - 2.5).abs() < f64::EPSILON);
        assert!((medidas.p99_ms - 100.0).abs() < f64::EPSILON);
        assert!((medidas.maximo_ms - 100.0).abs() < f64::EPSILON);
    }
}
