//! Plataforma Windows: `DirectComposition` y Direct2D/DirectWrite sobre lotes de capas.
mod bucle;
mod captura;
mod dpi;
mod glifos;
mod limites;
mod medicion;
mod ordenar;
pub use ordenar::MotivoOrden;
mod pintar;
pub use bucle::{Avisador, Bucle, Suceso};
pub use medicion::{Distribucion, Medicion};
mod texto;
mod tiempo;
mod validar;
mod ventana;

use crate::escena::capas::{CapaId, Curva, Dibujo, Instante, Lote, Operacion, Propiedad, Rect};
use std::{
    collections::{BTreeMap, HashMap},
    path::Path,
    time::Instant,
};
pub use texto::Texto;
use windows::{
    Win32::{
        Foundation::{HMODULE, HWND, POINT, RECT},
        Graphics::{
            Direct2D::{
                Common::D2D1_COLOR_F, D2D1_LAYER_PARAMETERS1, D2D1CreateDevice, ID2D1Device,
                ID2D1DeviceContext,
            },
            Direct3D::D3D_DRIVER_TYPE_HARDWARE,
            Direct3D11::{D3D11_CREATE_DEVICE_BGRA_SUPPORT, D3D11_SDK_VERSION, D3D11CreateDevice},
            DirectComposition::{
                DCOMPOSITION_OPACITY_MODE_LAYER, DCompositionCreateDevice3,
                IDCompositionDesktopDevice, IDCompositionRotateTransform,
                IDCompositionScaleTransform, IDCompositionSurface, IDCompositionTarget,
                IDCompositionVisual, IDCompositionVisual2, IDCompositionVisual3,
            },
            Dxgi::{
                Common::{DXGI_ALPHA_MODE_PREMULTIPLIED, DXGI_FORMAT_B8G8R8A8_UNORM},
                IDXGIDevice,
            },
        },
        System::{
            Com::{COINIT_APARTMENTTHREADED, CoInitializeEx, CoUninitialize},
            Performance::QueryPerformanceCounter,
        },
    },
    core::Interface,
};

#[derive(Debug)]
pub enum Error {
    Windows(windows::core::Error),
    Archivo(std::io::Error),
    Json(serde_json::Error),
    Entrada(&'static str),
    PlataformaInvalida,
    DispositivoPerdido,
    CurvaInvalida,
    RectInvalido,
    PropiedadInvalida,
    TextoInvalido,
    CapaDuplicada(CapaId),
    Capa(CapaId),
    FuenteNoDisponible {
        familia: String,
        peso: u16,
    },
    OrdenInvalido {
        padre: Option<CapaId>,
        motivo: MotivoOrden,
    },
}
impl std::fmt::Display for Error {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::Windows(e) => write!(f, "Windows: {e}"),
            Self::Archivo(e) => write!(f, "Archivo: {e}"),
            Self::Json(e) => write!(f, "JSON: {e}"),
            Self::Entrada(e) => f.write_str(e),
            Self::PlataformaInvalida => {
                f.write_str("Plataforma invalidada: reconstruir tras el fallo nativo")
            }
            Self::DispositivoPerdido => {
                f.write_str("Dispositivo gráfico perdido: reconstruir la plataforma")
            }
            Self::CurvaInvalida => f.write_str("Curva o reloj QPC inválido"),
            Self::RectInvalido => f.write_str("Rectángulo no finito o fuera de límites"),
            Self::PropiedadInvalida => f.write_str("Propiedad no finita o fuera de límites"),
            Self::TextoInvalido => f.write_str("Parámetros de texto inválidos"),
            Self::CapaDuplicada(id) => write!(f, "Capa duplicada: {}", id.0),
            Self::OrdenInvalido { padre, motivo } => {
                write!(f, "Orden z inválido para {padre:?}: {motivo:?}")
            }
            Self::FuenteNoDisponible { familia, peso } => write!(
                f,
                "No existe la fuente «{familia}» con peso {peso} en los TTF configurados"
            ),
            Self::Capa(id) => write!(f, "Capa inexistente: {}", id.0),
        }
    }
}
impl std::error::Error for Error {}
impl From<windows::core::Error> for Error {
    fn from(e: windows::core::Error) -> Self {
        if matches!(
            e.code(),
            windows::Win32::Foundation::D2DERR_RECREATE_TARGET
                | windows::Win32::Graphics::Dxgi::DXGI_ERROR_DEVICE_REMOVED
                | windows::Win32::Graphics::Dxgi::DXGI_ERROR_DEVICE_RESET
        ) {
            Self::DispositivoPerdido
        } else {
            Self::Windows(e)
        }
    }
}
impl From<std::io::Error> for Error {
    fn from(e: std::io::Error) -> Self {
        Self::Archivo(e)
    }
}
impl From<serde_json::Error> for Error {
    fn from(e: serde_json::Error) -> Self {
        Self::Json(e)
    }
}
pub type Resultado<T> = Result<T, Error>;

#[derive(serde::Serialize)]
pub struct TrabajoLote {
    indice: usize,
    operaciones: Vec<String>,
    duracion_ms: f64,
    repintados: u64,
    superficies_nuevas: u64,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Modo {
    Monitor,
    PorOverlay,
}

struct Capa {
    padre: Option<CapaId>,
    orden: u32,
    rect: Rect,
    dibujos: Vec<Dibujo>,
    posicion: IDCompositionVisual2,
    visual: IDCompositionVisual3,
    contenido: IDCompositionVisual2,
    escala: IDCompositionScaleTransform,
    giro: IDCompositionRotateTransform,
    valores: HashMap<Propiedad, f32>,
    curvas: HashMap<Propiedad, Curva>,
    superficie: Option<(IDCompositionSurface, (u32, u32))>,
}
struct Salida {
    ventana: ventana::Ventana,
    _target: IDCompositionTarget,
    raiz: IDCompositionVisual2,
    origen: (f32, f32),
    region: RECT,
}
struct Com;
impl Drop for Com {
    fn drop(&mut self) {
        unsafe {
            CoUninitialize();
        }
    }
}

/// Un dispositivo compartido para todas las ventanas. No es Send ni Sync (COM STA).
pub struct Plataforma {
    capas: BTreeMap<CapaId, Capa>,
    salidas: BTreeMap<Option<CapaId>, Salida>,
    dispositivo: IDCompositionDesktopDevice,
    d2d: ID2D1Device,
    pub texto: Texto,
    modo: Modo,
    region: RECT,
    margen: f32,
    trabajos_ms: Vec<f64>,
    trabajos_detalle: Vec<TrabajoLote>,
    midiendo: bool,
    invalida: bool,
    pintados: u64,
    superficies_creadas: u64,
    animaciones_programadas: u64,
    _hilo: std::marker::PhantomData<std::rc::Rc<()>>,
    #[cfg(test)]
    repintados: std::cell::Cell<usize>,
    _com: Com,
    _dpi: ventana::ContextoDpi,
}

impl Plataforma {
    pub fn nueva(modo: Modo, region: RECT, fuentes: &Path) -> Resultado<Self> {
        let dpi = ventana::ContextoDpi::nuevo()?;
        // SAFETY: COM STA se inicializa en el hilo creador; Com lo equilibra al cerrar.
        unsafe {
            CoInitializeEx(None, COINIT_APARTMENTTHREADED).ok()?;
        }
        let com = Com;
        // SAFETY: creación de dispositivos COM/D3D, punteros de salida locales válidos.
        let (d2d, dispositivo) = unsafe {
            let mut d3d = None;
            D3D11CreateDevice(
                None,
                D3D_DRIVER_TYPE_HARDWARE,
                HMODULE::default(),
                D3D11_CREATE_DEVICE_BGRA_SUPPORT,
                None,
                D3D11_SDK_VERSION,
                Some(&raw mut d3d),
                None,
                None,
            )?;
            let dxgi: IDXGIDevice = d3d
                .ok_or(Error::Entrada("D3D11 no devolvió dispositivo"))?
                .cast()?;
            let d2d = D2D1CreateDevice(&dxgi, None)?;
            let dispositivo = DCompositionCreateDevice3(&d2d)?;
            (d2d, dispositivo)
        };
        let mut plataforma = Self {
            capas: BTreeMap::new(),
            salidas: BTreeMap::new(),
            dispositivo,
            d2d,
            texto: Texto::nuevo(fuentes)?,
            modo,
            region,
            margen: 64.0,
            trabajos_ms: Vec::new(),
            trabajos_detalle: Vec::new(),
            midiendo: false,
            invalida: false,
            pintados: 0,
            superficies_creadas: 0,
            animaciones_programadas: 0,
            _hilo: std::marker::PhantomData,
            #[cfg(test)]
            repintados: std::cell::Cell::new(0),
            _com: com,
            _dpi: dpi,
        };
        if modo == Modo::Monitor {
            plataforma.salida(None, region)?;
        }
        Ok(plataforma)
    }

    fn salida(&mut self, id: Option<CapaId>, region: RECT) -> Resultado<()> {
        let ventana = ventana::Ventana::nueva(
            region.left,
            region.top,
            region.right - region.left,
            region.bottom - region.top,
        )?;
        // SAFETY: HWND vivo, visuales y dispositivo pertenecen al hilo creador.
        let (target, raiz) = unsafe {
            let target = self.dispositivo.CreateTargetForHwnd(ventana.hwnd, true)?;
            let raiz = self.dispositivo.CreateVisual()?;
            let escala = self.dispositivo.CreateScaleTransform()?;
            escala.SetScaleX2(ventana.dpi / 96.0)?;
            escala.SetScaleY2(ventana.dpi / 96.0)?;
            raiz.SetTransform(&escala)?;
            target.SetRoot(&raiz)?;
            (target, raiz)
        };
        self.salidas.insert(
            id,
            Salida {
                ventana,
                _target: target,
                raiz,
                origen: (0.0, 0.0),
                region,
            },
        );
        Ok(())
    }

    /// Configura el margen DIP antes de crear las capas raíz.
    pub fn margen_animacion(&mut self, margen: u16) -> Resultado<()> {
        if !self.capas.is_empty() {
            return Err(Error::Entrada("Configura el margen antes de crear capas"));
        }
        self.margen = f32::from(margen);
        Ok(())
    }
    pub fn ahora(&self) -> Resultado<Instante> {
        // SAFETY: dispositivo COM vivo en este mismo hilo.
        let estadisticas = unsafe { self.dispositivo.GetFrameStatistics()? };
        let mut contador = 0;
        // SAFETY: contador es una variable de salida local válida.
        unsafe {
            QueryPerformanceCounter(&raw mut contador)?;
        }
        Ok(Instante(tiempo_qpc(contador, estadisticas.timeFrequency)?))
    }
    pub fn proximo_fotograma(&self) -> Resultado<Instante> {
        // SAFETY: dispositivo COM vivo en este mismo hilo.
        let s = unsafe { self.dispositivo.GetFrameStatistics()? };
        Ok(Instante(tiempo_qpc(
            s.nextEstimatedFrameTime,
            s.timeFrequency,
        )?))
    }
    pub fn ventanas(&self) -> Vec<HWND> {
        self.salidas.values().map(|s| s.ventana.hwnd).collect()
    }
    pub fn iniciar_medicion(&mut self) {
        self.trabajos_ms.clear();
        self.trabajos_detalle.clear();
        self.midiendo = true;
    }
    pub fn trabajos_ms(&self) -> &[f64] {
        &self.trabajos_ms
    }

    /// La validación no modifica el árbol. Un fallo nativo invalida la instancia.
    pub fn aplicar(&mut self, lote: &Lote) -> Resultado<()> {
        if self.invalida {
            return Err(Error::PlataformaInvalida);
        }
        if let Some(error) = self.texto.tomar_error_medicion() {
            return Err(error);
        }
        self.validar_lote(lote)?;
        let comienzo = Instant::now();
        let antes = self.diagnostico();
        let resultado = self.aplicar_preparado(lote);
        if self.midiendo {
            let duracion_ms = comienzo.elapsed().as_secs_f64() * 1000.0;
            self.trabajos_ms.push(duracion_ms);
            self.trabajos_detalle.push(TrabajoLote {
                indice: self.trabajos_detalle.len(),
                operaciones: lote
                    .operaciones
                    .iter()
                    .map(|op| match op {
                        Operacion::Crear { id, .. } => format!("Crear {}", id.0),
                        Operacion::Colocar { id, .. } => format!("Colocar {}", id.0),
                        Operacion::Pintar { id, .. } => format!("Pintar {}", id.0),
                        Operacion::Fijar { id, .. } => format!("Fijar {}", id.0),
                        Operacion::Animar { id, .. } => format!("Animar {}", id.0),
                        Operacion::Quitar { id } => format!("Quitar {}", id.0),
                        Operacion::Ordenar { padre, .. } => format!("Ordenar {padre:?}"),
                    })
                    .collect(),
                duracion_ms,
                repintados: self.pintados - antes.0,
                superficies_nuevas: self.superficies_creadas - antes.1,
            });
        }
        self.finalizar_lote(resultado)
    }
    fn finalizar_lote(&mut self, resultado: Resultado<()>) -> Resultado<()> {
        if resultado.is_err() {
            self.invalida = true;
        }
        resultado
    }
    fn aplicar_preparado(&mut self, lote: &Lote) -> Resultado<()> {
        let ahora = self.ahora()?;
        for c in self.capas.values_mut() {
            c.curvas.retain(|p, curva| {
                let viva = curva.repetir.is_some() || ahora.0 < curva.inicio.0 + curva.fin;
                if !viva {
                    c.valores.insert(*p, curva.final_);
                }
                viva
            });
        }
        self.actualizar_dpi()?;
        for op in &lote.operaciones {
            self.operacion(op)?;
        }
        let salidas = self.preparar_salidas()?;
        self.ajustar_salidas(salidas)?;
        // SAFETY: dispositivo y árbol pertenecen al hilo COM creador.
        unsafe {
            self.dispositivo.Commit()?;
        }
        self.comprobar_dispositivo()
    }
    fn comprobar_dispositivo(&self) -> Resultado<()> {
        // SAFETY: interfaz COM viva del dispositivo creador.
        if !unsafe {
            self.dispositivo
                .cast::<windows::Win32::Graphics::DirectComposition::IDCompositionDevice>()?
                .CheckDeviceState()?
        }
        .as_bool()
        {
            return Err(Error::DispositivoPerdido);
        }
        Ok(())
    }
    pub fn diagnostico(&self) -> (u64, u64, u64) {
        (
            self.pintados,
            self.superficies_creadas,
            self.animaciones_programadas,
        )
    }

    fn capa(&self, id: CapaId) -> Resultado<&Capa> {
        self.capas.get(&id).ok_or(Error::Capa(id))
    }

    fn insertar_orden(&mut self, padre: Option<CapaId>, orden: u32) -> Resultado<u32> {
        let hermanas = u32::try_from(self.capas.values().filter(|c| c.padre == padre).count())
            .map_err(|_| Error::Entrada("Demasiadas capas hermanas"))?;
        let orden = orden.min(hermanas);
        for capa in self
            .capas
            .values_mut()
            .filter(|c| c.padre == padre && c.orden >= orden)
        {
            capa.orden = capa
                .orden
                .checked_add(1)
                .ok_or(Error::Entrada("Orden de capa fuera de rango"))?;
        }
        Ok(orden)
    }
    fn ordenar_ventana(&self, id: CapaId, orden: u32) -> Resultado<()> {
        use windows::Win32::UI::WindowsAndMessaging::{
            SWP_NOACTIVATE, SWP_NOMOVE, SWP_NOSIZE, SetWindowPos,
        };
        let superior = self
            .capas
            .iter()
            .filter(|(_, c)| c.padre.is_none() && c.orden > orden)
            .min_by_key(|(_, c)| c.orden);
        if let Some((superior, _)) = superior {
            let ventana = self
                .salidas
                .get(&Some(id))
                .ok_or(Error::Entrada("Salida nueva ausente"))?;
            let encima = self
                .salidas
                .get(&Some(*superior))
                .ok_or(Error::Entrada("Salida superior ausente"))?;
            // SAFETY: ventanas vivas de las salidas del mismo hilo; sin activación ni cambio de tamaño.
            unsafe {
                SetWindowPos(
                    ventana.ventana.hwnd,
                    Some(encima.ventana.hwnd),
                    0,
                    0,
                    0,
                    0,
                    SWP_NOMOVE | SWP_NOSIZE | SWP_NOACTIVATE,
                )?;
            }
        }
        Ok(())
    }
    fn crear(&mut self, id: CapaId, padre: Option<CapaId>, orden: u32) -> Resultado<()> {
        if self.capas.contains_key(&id) {
            return Err(Error::CapaDuplicada(id));
        }
        if let Some(padre) = padre {
            self.capa(padre)?;
        }
        let orden = self.insertar_orden(padre, orden)?;
        // SAFETY: el dispositivo COM pertenece al hilo creador; referencias vivas.
        let (posicion, visual, contenido, escala, giro) = unsafe {
            let posicion = self.dispositivo.CreateVisual()?;
            let visual: IDCompositionVisual3 = self.dispositivo.CreateVisual()?.cast()?;
            let contenido = self.dispositivo.CreateVisual()?;
            visual.AddVisual(&contenido, false, None)?;
            let escala = self.dispositivo.CreateScaleTransform()?;
            escala.SetScaleX2(1.0)?;
            escala.SetScaleY2(1.0)?;
            let giro = self.dispositivo.CreateRotateTransform()?;
            visual.SetOpacityMode(DCOMPOSITION_OPACITY_MODE_LAYER)?;
            visual.cast::<IDCompositionVisual>()?.SetTransform(
                &self
                    .dispositivo
                    .CreateTransformGroup(&[Some(escala.cast()?), Some(giro.cast()?)])?,
            )?;
            posicion.AddVisual(&visual, false, None)?;
            (posicion, visual, contenido, escala, giro)
        };
        if padre.is_none() && self.modo == Modo::PorOverlay {
            self.salida(
                Some(id),
                RECT {
                    left: self.region.left,
                    top: self.region.top,
                    right: self.region.left + 1,
                    bottom: self.region.top + 1,
                },
            )?;
        }
        let contenedor: IDCompositionVisual = if let Some(padre) = padre {
            self.capa(padre)?.visual.cast()?
        } else {
            self.salidas
                .get(&if self.modo == Modo::Monitor {
                    None
                } else {
                    Some(id)
                })
                .ok_or(Error::Entrada("Salida no creada"))?
                .raiz
                .cast()?
        };
        let anterior = self
            .capas
            .values()
            .filter(|c| {
                c.padre == padre
                    && c.orden < orden
                    && (padre.is_some() || self.modo == Modo::Monitor)
            })
            .max_by_key(|c| c.orden);
        let mut referencia = anterior
            .map(|c| c.posicion.cast::<IDCompositionVisual>())
            .transpose()?;
        if referencia.is_none()
            && let Some(padre) = padre
        {
            referencia = Some(self.capa(padre)?.contenido.cast()?);
        }
        // SAFETY: contenedor, visual y referencia son del mismo dispositivo.
        unsafe {
            contenedor.AddVisual(&posicion, true, referencia.as_ref())?;
        }
        if padre.is_none() && self.modo == Modo::PorOverlay {
            self.ordenar_ventana(id, orden)?;
        }
        self.capas.insert(
            id,
            Capa {
                padre,
                orden,
                rect: Rect {
                    x: 0.0,
                    y: 0.0,
                    ancho: 1.0,
                    alto: 1.0,
                },
                dibujos: Vec::new(),
                posicion,
                visual,
                contenido,
                escala,
                giro,
                valores: HashMap::new(),
                curvas: HashMap::new(),
                superficie: None,
            },
        );
        Ok(())
    }
    fn operacion(&mut self, op: &Operacion) -> Resultado<()> {
        match op {
            Operacion::Ordenar { padre, hijos } => self.ordenar(*padre, hijos)?,
            Operacion::Crear { id, padre, orden } => self.crear(*id, *padre, *orden)?,
            Operacion::Colocar { id, rect } => {
                if ![rect.x, rect.y, rect.ancho, rect.alto]
                    .iter()
                    .all(|n| n.is_finite())
                    || rect.ancho <= 0.0
                    || rect.alto <= 0.0
                    || rect.ancho > 16384.0
                    || rect.alto > 16384.0
                {
                    return Err(Error::Entrada("Rectángulo de capa inválido"));
                }
                let c = self.capas.get_mut(id).ok_or(Error::Capa(*id))?;
                // El tamaño DIP exacto decide si cambia la superficie; moverla
                // conserva su contenido y solo actualiza el visual de posición.
                let cambia_tamano = c.rect.ancho.to_bits() != rect.ancho.to_bits()
                    || c.rect.alto.to_bits() != rect.alto.to_bits();
                c.rect = *rect;
                // SAFETY: visuales y transforms vivos de la capa, en su hilo creador.
                unsafe {
                    c.posicion.SetOffsetX2(rect.x)?;
                    c.posicion.SetOffsetY2(rect.y)?;
                    c.escala.SetCenterX2(rect.ancho / 2.0)?;
                    c.escala.SetCenterY2(rect.alto / 2.0)?;
                    c.giro.SetCenterX2(rect.ancho / 2.0)?;
                    c.giro.SetCenterY2(rect.alto / 2.0)?;
                }
                if cambia_tamano {
                    self.repintar(*id)?;
                }
            }
            Operacion::Pintar { id, dibujos } => {
                self.capas
                    .get_mut(id)
                    .ok_or(Error::Capa(*id))?
                    .dibujos
                    .clone_from(dibujos);
                self.repintar(*id)?;
            }
            Operacion::Fijar {
                id,
                propiedad,
                valor,
            } => self.fijar(*id, *propiedad, *valor)?,
            Operacion::Animar {
                id,
                propiedad,
                curva,
            } => self.animar(*id, *propiedad, curva)?,
            Operacion::Quitar { id } => self.quitar(*id)?,
        }
        Ok(())
    }

    fn repintar(&mut self, id: CapaId) -> Resultado<()> {
        let dpi = self.dpi_capa(id)?;
        let c = self.capa(id)?;
        let mut tinta = limites::tinta(c.rect, &c.dibujos)?;
        // El origen del atlas debe corresponder a un píxel físico entero.
        tinta.izquierda = (tinta.izquierda * dpi / 96.0).floor() * 96.0 / dpi;
        tinta.arriba = (tinta.arriba * dpi / 96.0).floor() * 96.0 / dpi;
        let tamano = (
            u32::try_from(entero((tinta.ancho() * dpi / 96.0).ceil())?)
                .map_err(|_| Error::RectInvalido)?,
            u32::try_from(entero((tinta.alto() * dpi / 96.0).ceil())?)
                .map_err(|_| Error::RectInvalido)?,
        );
        let nueva = c.superficie.as_ref().is_none_or(|(_, t)| *t != tamano);
        let superficie =
            if let Some((superficie, _)) = c.superficie.as_ref().filter(|(_, t)| *t == tamano) {
                superficie.clone()
            } else {
                // SAFETY: dimensiones validadas y dispositivo COM vivo.
                unsafe {
                    self.dispositivo.CreateSurface(
                        tamano.0,
                        tamano.1,
                        DXGI_FORMAT_B8G8R8A8_UNORM,
                        DXGI_ALPHA_MODE_PREMULTIPLIED,
                    )?
                }
            };
        let mut offset = POINT::default();
        // SAFETY: superficie viva, parámetro offset válido; EndDraw se ejecuta debajo.
        let ctx: ID2D1DeviceContext = unsafe { superficie.BeginDraw(None, &raw mut offset)? };
        let mut transform = D2D1_LAYER_PARAMETERS1::default().maskTransform;
        transform.M11 = 1.0;
        transform.M22 = 1.0;
        transform.M31 = -tinta.izquierda
            + f32::from(u16::try_from(offset.x).map_err(|_| Error::Entrada("Offset D2D X"))?)
                * 96.0
                / dpi;
        transform.M32 = -tinta.arriba
            + f32::from(u16::try_from(offset.y).map_err(|_| Error::Entrada("Offset D2D Y"))?)
                * 96.0
                / dpi;
        // SAFETY: contexto en BeginDraw; matriz y color válidos durante las llamadas.
        unsafe {
            ctx.SetDpi(dpi, dpi);
            ctx.SetTransform(&raw const transform);
            ctx.Clear(Some(&D2D1_COLOR_F::default()));
        }
        let dibujo = pintar::dibujar(&ctx, &self.texto, &c.dibujos);
        // SAFETY: cierra el BeginDraw anterior aun si dibujar devolvió error.
        let fin = unsafe { superficie.EndDraw() };
        dibujo?;
        fin?;
        // DComp interpreta la superficie en píxeles. La raíz ya convierte DIP
        // a píxeles: compensar aquí evita escalar dos veces el contenido D2D.
        // SAFETY: interfaces de contenido del mismo dispositivo y del mismo hilo.
        unsafe {
            let escala_contenido = self.dispositivo.CreateScaleTransform()?;
            escala_contenido.SetScaleX2(96.0 / dpi)?;
            escala_contenido.SetScaleY2(96.0 / dpi)?;
            c.contenido.SetTransform(&escala_contenido)?;
            c.contenido.SetOffsetX2(tinta.izquierda)?;
            c.contenido.SetOffsetY2(tinta.arriba)?;
            c.contenido.SetContent(&superficie)?;
        }
        self.capas.get_mut(&id).ok_or(Error::Capa(id))?.superficie = Some((superficie, tamano));
        self.pintados += 1;
        self.superficies_creadas += u64::from(nueva);
        #[cfg(test)]
        self.repintados.set(self.repintados.get().saturating_add(1));
        Ok(())
    }

    fn fijar(&mut self, id: CapaId, p: Propiedad, v: f32) -> Resultado<()> {
        if !v.is_finite() {
            return Err(Error::Entrada("Propiedad no finita"));
        }
        let c = self.capas.get_mut(&id).ok_or(Error::Capa(id))?;
        c.curvas.remove(&p);
        c.valores.insert(p, v);
        // SAFETY: la capa posee sus visuales/transforms vivos en el hilo COM creador.
        unsafe {
            match p {
                Propiedad::X => c.visual.SetOffsetX2(v)?,
                Propiedad::Y => c.visual.SetOffsetY2(v)?,
                Propiedad::Opacidad => c.visual.SetOpacity2(v)?,
                Propiedad::Escala => {
                    c.escala.SetScaleX2(v)?;
                    c.escala.SetScaleY2(v)?;
                }
                Propiedad::Giro => c.giro.SetAngle2(v)?,
            }
        }
        Ok(())
    }

    fn animar(&mut self, id: CapaId, p: Propiedad, curva: &Curva) -> Resultado<()> {
        // SAFETY: estadísticas del dispositivo vivo, frecuencia QPC del mismo reloj.
        let frecuencia = unsafe { self.dispositivo.GetFrameStatistics()? }.timeFrequency;
        let programa = tiempo::programar(curva, frecuencia)?;
        // SAFETY: las interfaces son del mismo dispositivo; el programa ya está validado.
        unsafe {
            let animacion = self.dispositivo.CreateAnimation()?;
            animacion.SetAbsoluteBeginTime(programa.comienzo_qpc)?;
            for (offset, [a, b, c, d]) in programa.cubicos {
                animacion.AddCubic(offset, a, b, c, d)?;
            }
            if let Some((desde, duracion)) = programa.repetir {
                animacion.AddRepeat(desde, duracion)?;
            }
            if let Some((fin, valor)) = programa.fin {
                animacion.End(fin, valor)?;
            }
            self.animaciones_programadas += 1;
            let c = self.capas.get_mut(&id).ok_or(Error::Capa(id))?;
            c.curvas.insert(p, curva.clone());
            match p {
                Propiedad::X => c.visual.SetOffsetX(&animacion)?,
                Propiedad::Y => c.visual.SetOffsetY(&animacion)?,
                Propiedad::Opacidad => c.visual.SetOpacity(&animacion)?,
                Propiedad::Escala => {
                    c.escala.SetScaleX(&animacion)?;
                    c.escala.SetScaleY(&animacion)?;
                }
                Propiedad::Giro => c.giro.SetAngle(&animacion)?,
            }
        }
        Ok(())
    }

    fn quitar(&mut self, id: CapaId) -> Resultado<()> {
        let hijos: Vec<_> = self
            .capas
            .iter()
            .filter_map(|(id_hijo, c)| (c.padre == Some(id)).then_some(*id_hijo))
            .collect();
        for hijo in hijos {
            self.quitar(hijo)?;
        }
        let c = self.capa(id)?;
        let padre = c.padre;
        let orden = c.orden;
        // SAFETY: el árbol conserva padre, visual y salida hasta terminar la desconexión.
        unsafe {
            if let Some(padre) = c.padre {
                self.capa(padre)?.visual.RemoveVisual(&c.posicion)?;
            } else if self.modo == Modo::Monitor {
                self.salidas
                    .get(&None)
                    .ok_or(Error::Entrada("Sin salida monitor"))?
                    .raiz
                    .RemoveVisual(&c.posicion)?;
            } else {
                self.salidas.remove(&Some(id));
            }
        }
        self.capas.remove(&id);
        for hermana in self
            .capas
            .values_mut()
            .filter(|c| c.padre == padre && c.orden > orden)
        {
            hermana.orden -= 1;
        }
        Ok(())
    }
}

// Conversión explícita de coordenadas después de comprobar el rango de ventanas Win32.
fn entero(valor: f32) -> Resultado<i32> {
    if !valor.is_finite() || !(-1_000_000.0..=1_000_000.0).contains(&valor) {
        return Err(Error::Entrada("Coordenada fuera de rango Win32"));
    }
    // Rango comprobado; la conversión intermedia saturada está dentro de i32.
    #[expect(
        clippy::cast_possible_truncation,
        reason = "Rango finito comprobado antes de redondear a coordenadas Win32"
    )]
    let entero = valor.round() as i64;
    i32::try_from(entero).map_err(|_| Error::RectInvalido)
}
fn tiempo_qpc(ticks: i64, frecuencia: i64) -> Resultado<f64> {
    let ticks = u64::try_from(ticks).map_err(|_| Error::Entrada("QPC negativo"))?;
    let frecuencia =
        u64::try_from(frecuencia).map_err(|_| Error::Entrada("Frecuencia QPC negativa"))?;
    if frecuencia == 0 {
        return Err(Error::Entrada("Frecuencia QPC nula"));
    }
    let nanosegundos =
        u32::try_from(u128::from(ticks % frecuencia) * 1_000_000_000 / u128::from(frecuencia))
            .map_err(|_| Error::Entrada("Resto QPC"))?;
    Ok(std::time::Duration::new(ticks / frecuencia, nanosegundos).as_secs_f64())
}
