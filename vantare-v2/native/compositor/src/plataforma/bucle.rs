use super::{Instante, Plataforma, Resultado, ventana::ancho};
use std::{
    path::{Path, PathBuf},
    sync::Arc,
};
use windows::{
    Win32::{
        Foundation::{CloseHandle, FreeLibrary, HANDLE, HMODULE, WAIT_FAILED, WAIT_TIMEOUT},
        Graphics::Dwm::DwmFlush,
        Storage::FileSystem::{
            FILE_NOTIFY_CHANGE_FILE_NAME, FILE_NOTIFY_CHANGE_LAST_WRITE,
            FindCloseChangeNotification, FindFirstChangeNotificationW, FindNextChangeNotification,
        },
        System::{
            LibraryLoader::{GetProcAddress, LoadLibraryW},
            Threading::{CreateEventW, INFINITE, ResetEvent, SetEvent},
        },
        UI::WindowsAndMessaging::{
            DispatchMessageW, MSG, MWMO_INPUTAVAILABLE, MsgWaitForMultipleObjectsEx, PM_REMOVE,
            PeekMessageW, QS_ALLINPUT, TranslateMessage, WM_DPICHANGED, WM_QUIT,
        },
    },
    core::{PCWSTR, s},
};

struct Evento(HANDLE);
// HANDLE de evento kernel: SetEvent es seguro desde el lector del pipe.
unsafe impl Send for Evento {}
unsafe impl Sync for Evento {}
impl Drop for Evento {
    fn drop(&mut self) {
        if let Err(e) = unsafe { CloseHandle(self.0) } {
            eprintln!("Cerrar evento: {e}");
        }
    }
}
#[derive(Clone)]
pub struct Avisador(Arc<Evento>);
impl Avisador {
    pub fn avisar(&self) -> Resultado<()> {
        unsafe {
            SetEvent(self.0.0)?;
        }
        Ok(())
    }
}
struct Vigilancia {
    handle: HANDLE,
    ruta: PathBuf,
}
impl Drop for Vigilancia {
    fn drop(&mut self) {
        if let Err(e) = unsafe { FindCloseChangeNotification(self.handle) } {
            eprintln!("Cerrar vigilancia: {e}");
        }
    }
}

#[derive(Debug)]
pub enum Suceso {
    ModeloNuevo,
    FicheroCambiado(PathBuf),
    Fotograma(Instante),
    Cerrar,
    PantallasCambiadas,
}

/// Espera sin crear hilos. El lector conserva un Avisador y debe cerrarse antes del bucle.
pub struct Bucle {
    evento: Avisador,
    vigilancias: Vec<Vigilancia>,
    reloj: Option<unsafe extern "system" fn(u32, *const HANDLE, u32) -> u32>,
    biblioteca: HMODULE,
    reloj_fallido: std::cell::Cell<bool>,
    estado_reloj: std::cell::Cell<Option<u32>>,
}
impl Bucle {
    pub fn nuevo() -> Resultado<Self> {
        unsafe {
            let evento = Avisador(Arc::new(Evento(CreateEventW(None, true, false, None)?)));
            let biblioteca = LoadLibraryW(windows::core::w!("dcomp.dll"))?;
            let reloj =
                GetProcAddress(biblioteca, s!("DCompositionWaitForCompositorClock")).map(|p| {
                    std::mem::transmute::<
                        unsafe extern "system" fn() -> isize,
                        unsafe extern "system" fn(u32, *const HANDLE, u32) -> u32,
                    >(p)
                });
            Ok(Self {
                evento,
                vigilancias: Vec::new(),
                reloj,
                biblioteca,
                reloj_fallido: std::cell::Cell::new(false),
                estado_reloj: std::cell::Cell::new(None),
            })
        }
    }
    /// Estado nativo observado; None indica que se usa la alternativa DWM.
    pub fn estado_reloj(&self) -> Option<u32> {
        self.estado_reloj.get()
    }
    pub fn avisador(&self) -> Avisador {
        self.evento.clone()
    }
    pub fn vigilar(&mut self, ruta: &Path) -> Resultado<()> {
        if self.vigilancias.len() >= 30 {
            return Err(super::Error::Entrada("Máximo 30 carpetas vigiladas"));
        }
        let texto = ancho(ruta.as_os_str());
        let handle = unsafe {
            FindFirstChangeNotificationW(
                PCWSTR(texto.as_ptr()),
                true,
                FILE_NOTIFY_CHANGE_LAST_WRITE | FILE_NOTIFY_CHANGE_FILE_NAME,
            )?
        };
        self.vigilancias.push(Vigilancia {
            handle,
            ruta: ruta.to_owned(),
        });
        Ok(())
    }
    fn suceso_handle(
        &self,
        resultado: windows::Win32::Foundation::WAIT_EVENT,
    ) -> Resultado<Option<Suceso>> {
        if resultado == WAIT_FAILED {
            return Err(windows::core::Error::from_thread().into());
        }
        if resultado.0 == 0 {
            // SAFETY: evento manual vivo; consumimos el aviso después de cualquier espera.
            unsafe {
                ResetEvent(self.evento.0.0)?;
            }
            return Ok(Some(Suceso::ModeloNuevo));
        }
        if let Some(v) = resultado
            .0
            .checked_sub(1)
            .and_then(|i| usize::try_from(i).ok())
            .and_then(|i| self.vigilancias.get(i))
        {
            unsafe {
                FindNextChangeNotification(v.handle)?;
            }
            return Ok(Some(Suceso::FicheroCambiado(v.ruta.clone())));
        }
        Ok(None)
    }
    fn pendiente(&self, handles: &[HANDLE]) -> Resultado<Option<Suceso>> {
        let resultado =
            unsafe { windows::Win32::System::Threading::WaitForMultipleObjects(handles, false, 0) };
        self.suceso_handle(resultado)
    }
    pub fn esperar(
        &self,
        plataforma: &Plataforma,
        transiciones_pintadas: bool,
    ) -> Resultado<Suceso> {
        self.esperar_hasta(plataforma, transiciones_pintadas, None)
    }
    /// `limite` es un despertar puntual explícito del guion, no un reloj periódico.
    pub fn esperar_hasta(
        &self,
        plataforma: &Plataforma,
        transiciones_pintadas: bool,
        limite: Option<Instante>,
    ) -> Resultado<Suceso> {
        let handles: Vec<_> = std::iter::once(self.evento.0.0)
            .chain(self.vigilancias.iter().map(|v| v.handle))
            .collect();
        loop {
            let espera = if let Some(limite) = limite {
                let restante = (limite.0 - plataforma.ahora()?.0).max(0.0);
                u32::try_from(
                    std::time::Duration::try_from_secs_f64(restante)
                        .map_err(|_| super::Error::Entrada("Plazo inválido"))?
                        .as_millis(),
                )
                .unwrap_or(INFINITE - 1)
            } else {
                INFINITE
            };
            unsafe {
                let resultado = MsgWaitForMultipleObjectsEx(
                    Some(&handles),
                    if transiciones_pintadas {
                        if self.estado_reloj.get() == Some(0xc01e_0006) || self.reloj_fallido.get()
                        {
                            16
                        } else {
                            0
                        }
                    } else {
                        espera
                    },
                    QS_ALLINPUT,
                    MWMO_INPUTAVAILABLE,
                );
                if resultado == WAIT_TIMEOUT && !transiciones_pintadas {
                    return Ok(Suceso::Fotograma(plataforma.ahora()?));
                }
                if let Some(suceso) = self.suceso_handle(resultado)? {
                    return Ok(suceso);
                }
                let mut mensaje = MSG::default();
                let mut cambio_dpi = false;
                while PeekMessageW(&raw mut mensaje, None, 0, 0, PM_REMOVE).as_bool() {
                    if mensaje.message == WM_QUIT {
                        return Ok(Suceso::Cerrar);
                    }
                    // FALSE significa que el mensaje no generó WM_CHAR; no es un error.
                    let _traducido = TranslateMessage(&raw const mensaje);
                    cambio_dpi |= mensaje.message == WM_DPICHANGED;
                    DispatchMessageW(&raw const mensaje);
                }
                if cambio_dpi {
                    return Ok(Suceso::PantallasCambiadas);
                }
                // Un despertar de mensajes puede adelantarse a un handle señalado.
                // Priorizar los datos pendientes antes de producir un fotograma.
                if let Some(suceso) = self.pendiente(&handles)? {
                    return Ok(suceso);
                }
                if transiciones_pintadas {
                    if let Some(reloj) = self.reloj.filter(|_| !self.reloj_fallido.get()) {
                        // SAFETY: handles vivos, el modelo es manual-reset para que el
                        // reloj no consuma un aviso antes de identificarlo en pendiente.
                        let cantidad = u32::try_from(handles.len())
                            .map_err(|_| super::Error::Entrada("Demasiados handles"))?;
                        let estado = reloj(cantidad, handles.as_ptr(), 16);
                        self.estado_reloj.set(Some(estado));
                        if let Some(suceso) = self.pendiente(&handles)? {
                            return Ok(suceso);
                        }
                        match estado {
                            258 => continue,
                            0xc01e_0006 => DwmFlush()?,
                            otro if otro <= cantidad => {}
                            otro => {
                                self.reloj_fallido.set(true);
                                eprintln!("Reloj DComp 0x{otro:08x}; se usa DwmFlush");
                                DwmFlush()?;
                            }
                        }
                    } else {
                        DwmFlush()?;
                    }
                    if let Some(suceso) = self.pendiente(&handles)? {
                        return Ok(suceso);
                    }
                    return Ok(Suceso::Fotograma(plataforma.ahora()?));
                }
            }
        }
    }
}
impl Drop for Bucle {
    fn drop(&mut self) {
        if let Err(e) = unsafe { FreeLibrary(self.biblioteca) } {
            eprintln!("Liberar dcomp.dll: {e}");
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    unsafe extern "system" fn fotograma(
        _cantidad: u32,
        _handles: *const HANDLE,
        _plazo: u32,
    ) -> u32 {
        0
    }
    unsafe extern "system" fn avisar_durante_reloj(
        cantidad: u32,
        handles: *const HANDLE,
        _plazo: u32,
    ) -> u32 {
        if cantidad == 0 || handles.is_null() {
            return u32::MAX;
        }
        // SAFETY: el bucle suministra un array vivo con cantidad>0.
        let handle = unsafe { *handles };
        // SAFETY: es el evento manual válido del modelo, primero del array.
        if unsafe { SetEvent(handle) }.is_ok() {
            0
        } else {
            u32::MAX
        }
    }
    unsafe extern "system" fn reloj_desconocido(
        _cantidad: u32,
        _handles: *const HANDLE,
        _plazo: u32,
    ) -> u32 {
        u32::MAX
    }
    #[test]
    fn reloj_recibe_handles_y_no_pierde_un_modelo_que_llega_durante_la_espera() -> Resultado<()> {
        let p = Plataforma::nueva(
            super::super::Modo::Monitor,
            windows::Win32::Foundation::RECT {
                left: 0,
                top: 0,
                right: 20,
                bottom: 20,
            },
            Path::new(concat!(env!("CARGO_MANIFEST_DIR"), "/../ui/assets/fonts")),
        )?;
        let mut bucle = Bucle::nuevo()?;
        bucle.reloj = Some(avisar_durante_reloj);
        assert!(matches!(bucle.esperar(&p, true)?, Suceso::ModeloNuevo));
        assert_eq!(bucle.estado_reloj(), Some(0));
        bucle.reloj = Some(reloj_desconocido);
        assert!(matches!(bucle.esperar(&p, true)?, Suceso::Fotograma(_)));
        assert_eq!(bucle.estado_reloj(), Some(u32::MAX));
        assert!(bucle.reloj_fallido.get());
        Ok(())
    }
    #[test]
    fn modelo_reloj_y_vigilancia_entregan_sucesos_distintos() -> Resultado<()> {
        let plataforma = Plataforma::nueva(
            super::super::Modo::Monitor,
            windows::Win32::Foundation::RECT {
                left: 0,
                top: 0,
                right: 20,
                bottom: 20,
            },
            Path::new(concat!(env!("CARGO_MANIFEST_DIR"), "/../ui/assets/fonts")),
        )?;
        let mut bucle = Bucle::nuevo()?;
        bucle.reloj = Some(fotograma);
        bucle.avisador().avisar()?;
        let modelo = bucle.esperar(&plataforma, true)?;
        assert!(
            matches!(modelo, Suceso::ModeloNuevo),
            "suceso obtenido: {modelo:?}"
        );
        assert!(matches!(
            bucle.esperar(&plataforma, true)?,
            Suceso::Fotograma(_)
        ));
        let carpeta = std::env::var_os("VANTARE_COMPOSITOR_TEST_TMP")
            .map_or_else(std::env::temp_dir, PathBuf::from)
            .join(format!("compositor-vigilancia-{}", std::process::id()));
        std::fs::create_dir(&carpeta)?;
        let archivo = carpeta.join("sistema.json");
        let cambio: Resultado<Suceso> = (|| {
            bucle.vigilar(&carpeta)?;
            std::fs::write(&archivo, b"{}")?;
            // Sin sleeps: espera de sincronización del kernel. El plazo solo evita
            // colgar la suite si falla una notificación real del sistema de ficheros.
            let limite = Instante(plataforma.ahora()?.0 + 3.0);
            bucle.esperar_hasta(&plataforma, false, Some(limite))
        })();
        drop(bucle);
        if archivo.try_exists()? {
            std::fs::remove_file(&archivo)?;
        }
        std::fs::remove_dir(&carpeta)?;
        assert!(matches!(cambio?,Suceso::FicheroCambiado(ruta) if ruta==carpeta));
        Ok(())
    }
}
