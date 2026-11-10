use super::{CapaId, Error, Plataforma, Resultado};
use windows::Win32::UI::HiDpi::GetDpiForWindow;

impl Plataforma {
    pub(super) fn dpi_capa(&self, mut id: CapaId) -> Resultado<f32> {
        while let Some(padre) = self.capa(id)?.padre {
            id = padre;
        }
        let clave = if self.modo == super::Modo::Monitor {
            None
        } else {
            Some(id)
        };
        self.salidas
            .get(&clave)
            .map(|s| s.ventana.dpi)
            .ok_or(Error::Entrada("Salida de capa ausente"))
    }
    /// Llamar tras `Suceso::PantallasCambiadas`; repinta a la densidad de cada salida.
    pub fn actualizar_dpi(&mut self) -> Resultado<()> {
        let mut cambios = false;
        for salida in self.salidas.values_mut() {
            // SAFETY: HWND vivo, creado en este hilo PMv2.
            let dpi = unsafe { GetDpiForWindow(salida.ventana.hwnd) };
            let dpi = f32::from(u16::try_from(dpi).map_err(|_| Error::RectInvalido)?);
            if dpi == 0.0 {
                return Err(windows::core::Error::from_thread().into());
            }
            if (dpi - salida.ventana.dpi).abs() > f32::EPSILON {
                salida.ventana.dpi = dpi;
                cambios = true;
                // SAFETY: objetos COM vivos del hilo creador.
                unsafe {
                    let escala = self.dispositivo.CreateScaleTransform()?;
                    escala.SetScaleX2(dpi / 96.0)?;
                    escala.SetScaleY2(dpi / 96.0)?;
                    salida.raiz.SetTransform(&escala)?;
                }
            }
        }
        if cambios {
            let ids: Vec<_> = self.capas.keys().copied().collect();
            for id in ids {
                self.repintar(id)?;
            }
        }
        Ok(())
    }
}
