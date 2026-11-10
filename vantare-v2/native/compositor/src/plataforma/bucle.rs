use super::{Instante, Plataforma, Resultado, ventana::ancho};
use std::{
    path::{Path, PathBuf},
    sync::Arc,
};
use windows::{
    Win32::{
        Foundation::*,
        Graphics::Dwm::DwmFlush,
        Storage::FileSystem::*,
        System::{LibraryLoader::*, Threading::*},
        UI::WindowsAndMessaging::*,
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
}

/// Espera sin crear hilos. El lector conserva un Avisador y debe cerrarse antes del bucle.
pub struct Bucle {
    evento: Avisador,
    vigilancias: Vec<Vigilancia>,
    reloj: Option<unsafe extern "system" fn(u32, *const HANDLE, u32) -> u32>,
    biblioteca: HMODULE,
}
impl Bucle {
    pub fn nuevo() -> Resultado<Self> {
        unsafe {
            let evento = Avisador(Arc::new(Evento(CreateEventW(None, false, false, None)?)));
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
            })
        }
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
                    if transiciones_pintadas { 0 } else { espera },
                    QS_ALLINPUT,
                    MWMO_INPUTAVAILABLE,
                );
                if resultado == WAIT_FAILED {
                    return Err(windows::core::Error::from_thread().into());
                }
                if resultado == WAIT_TIMEOUT && !transiciones_pintadas {
                    return Ok(Suceso::Fotograma(plataforma.ahora()?));
                }
                if resultado.0 == 0 {
                    return Ok(Suceso::ModeloNuevo);
                }
                if let Some(v) = resultado
                    .0
                    .checked_sub(1)
                    .and_then(|i| usize::try_from(i).ok())
                    .and_then(|i| self.vigilancias.get(i))
                {
                    FindNextChangeNotification(v.handle)?;
                    return Ok(Suceso::FicheroCambiado(v.ruta.clone()));
                }
                let mut mensaje = MSG::default();
                while PeekMessageW(&raw mut mensaje, None, 0, 0, PM_REMOVE).as_bool() {
                    if mensaje.message == WM_QUIT {
                        return Ok(Suceso::Cerrar);
                    }
                    // FALSE significa que el mensaje no generó WM_CHAR; no es un error.
                    let _traducido=TranslateMessage(&raw const mensaje);
                    DispatchMessageW(&raw const mensaje);
                }
                if transiciones_pintadas {
                    if let Some(reloj) = self.reloj {
                        // El límite permite atender también la cola Win32 (que no es HANDLE).
                        let r = reloj(
                            u32::try_from(handles.len())
                                .map_err(|_| super::Error::Entrada("Demasiadas vigilancias"))?,
                            handles.as_ptr(),
                            16,
                        );
                        if r == WAIT_FAILED.0 {
                            return Err(windows::core::Error::from_thread().into());
                        }
                        if r < u32::try_from(handles.len())
                            .map_err(|_| super::Error::Entrada("Demasiadas vigilancias"))?
                        {
                            if r == 0 {
                                return Ok(Suceso::ModeloNuevo);
                            }
                            let v = &self.vigilancias[usize::try_from(r - 1)
                                .map_err(|_| super::Error::Entrada("Índice de vigilancia"))?];
                            FindNextChangeNotification(v.handle)?;
                            return Ok(Suceso::FicheroCambiado(v.ruta.clone()));
                        }
                    } else {
                        DwmFlush()?;
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
