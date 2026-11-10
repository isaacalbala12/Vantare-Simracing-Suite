//! Plataforma Windows: `DirectComposition` y Direct2D/DirectWrite sobre lotes de capas.
mod bucle;
mod captura;
mod medicion;
mod pintar;
pub use bucle::{Avisador, Bucle, Suceso};
pub use medicion::{Distribucion, Medicion};
mod texto;
mod tiempo;
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
                IDCompositionScaleTransform, IDCompositionTarget, IDCompositionVisual,
                IDCompositionVisual2, IDCompositionVisual3,
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
    Capa(CapaId),
    Reloj(u32),
}
impl std::fmt::Display for Error {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::Windows(e) => write!(f, "Windows: {e}"),
            Self::Archivo(e) => write!(f, "Archivo: {e}"),
            Self::Json(e) => write!(f, "JSON: {e}"),
            Self::Entrada(e) => f.write_str(e),
            Self::Reloj(estado) => write!(f, "Reloj del compositor: estado 0x{estado:08x}"),
            Self::Capa(id) => write!(f, "Capa inexistente: {}", id.0),
        }
    }
}
impl std::error::Error for Error {}
impl From<windows::core::Error> for Error {
    fn from(e: windows::core::Error) -> Self {
        Self::Windows(e)
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
}
struct Salida {
    ventana: ventana::Ventana,
    _target: IDCompositionTarget,
    raiz: IDCompositionVisual2,
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
    midiendo: bool,
    _hilo: std::marker::PhantomData<std::rc::Rc<()>>,
    _com: Com,
}

impl Plataforma {
    pub fn nueva(modo: Modo, region: RECT, fuentes: &Path) -> Resultado<Self> {
        unsafe {
            CoInitializeEx(None, COINIT_APARTMENTTHREADED).ok()?;
            let com = Com;
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
                midiendo: false,
                _hilo: std::marker::PhantomData,
                _com: com,
            };
            if modo == Modo::Monitor {
                plataforma.salida(None, region)?;
            }
            Ok(plataforma)
        }
    }

    fn salida(&mut self, id: Option<CapaId>, region: RECT) -> Resultado<()> {
        let ventana = ventana::Ventana::nueva(
            region.left,
            region.top,
            region.right - region.left,
            region.bottom - region.top,
        )?;
        unsafe {
            let target = self.dispositivo.CreateTargetForHwnd(ventana.hwnd, true)?;
            let raiz = self.dispositivo.CreateVisual()?;
            let escala = self.dispositivo.CreateScaleTransform()?;
            escala.SetScaleX2(ventana.dpi / 96.0)?;
            escala.SetScaleY2(ventana.dpi / 96.0)?;
            raiz.SetTransform(&escala)?;
            target.SetRoot(&raiz)?;
            self.salidas.insert(
                id,
                Salida {
                    ventana,
                    _target: target,
                    raiz,
                },
            );
        }
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
        let estadisticas = unsafe { self.dispositivo.GetFrameStatistics()? };
        let mut contador = 0;
        unsafe {
            QueryPerformanceCounter(&raw mut contador)?;
        }
        Ok(Instante(tiempo_qpc(contador, estadisticas.timeFrequency)?))
    }
    pub fn proximo_fotograma(&self) -> Resultado<Instante> {
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
        self.midiendo = true;
    }
    pub fn trabajos_ms(&self) -> &[f64] {
        &self.trabajos_ms
    }

    /// Un Commit al terminar el lote. Un error deja la instancia invalidada para ese lote;
    /// el llamador debe reconstruirla, sin presentar una escena parcialmente aplicada.
    pub fn aplicar(&mut self, lote: &Lote) -> Resultado<()> {
        let comienzo = Instant::now();
        for op in &lote.operaciones {
            self.operacion(op)?;
        }
        // El pintado puede tardar más de un fotograma. Rebasar tras prepararlo,
        // inmediatamente antes del Commit, incluidas las curvas que ya estaban vivas.
        let instante = self.proximo_fotograma()?;
        let animaciones: Vec<_> = self
            .capas
            .iter()
            .flat_map(|(id, capa)| {
                capa.curvas
                    .iter()
                    .map(move |(p, curva)| (*id, *p, curva.clone()))
            })
            .collect();
        for (id, p, curva) in animaciones {
            self.animar(id, p, &curva, instante)?;
        }
        unsafe {
            self.dispositivo.Commit()?;
        }
        if self.midiendo {
            self.trabajos_ms
                .push(comienzo.elapsed().as_secs_f64() * 1000.0);
        }
        Ok(())
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
        unsafe {
            if self.capas.contains_key(&id) {
                return Err(Error::Entrada("Capa duplicada"));
            }
            if let Some(padre) = padre {
                self.capa(padre)?;
            }
            let orden = self.insertar_orden(padre, orden)?;
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
            contenedor.AddVisual(&posicion, referencia.is_some(), referencia.as_ref())?;
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
                },
            );
        }
        Ok(())
    }
    fn operacion(&mut self, op: &Operacion) -> Resultado<()> {
        unsafe {
            match op {
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
                    c.posicion.SetOffsetX2(rect.x)?;
                    c.posicion.SetOffsetY2(rect.y)?;
                    c.escala.SetCenterX2(rect.ancho / 2.0)?;
                    c.escala.SetCenterY2(rect.alto / 2.0)?;
                    c.giro.SetCenterX2(rect.ancho / 2.0)?;
                    c.giro.SetCenterY2(rect.alto / 2.0)?;
                    if c.padre.is_none() && self.modo == Modo::PorOverlay {
                        let salida = self
                            .salidas
                            .get(&Some(*id))
                            .ok_or(Error::Entrada("Salida no creada"))?;
                        let escala = salida.ventana.dpi / 96.0;
                        // Margen explícito de 64 DIP; la receta no calcula ventanas.
                        salida.raiz.SetOffsetX2((self.margen - rect.x) * escala)?;
                        salida.raiz.SetOffsetY2((self.margen - rect.y) * escala)?;
                        windows::Win32::UI::WindowsAndMessaging::SetWindowPos(
                            salida.ventana.hwnd,
                            None,
                            self.region.left + entero(rect.x * escala)?
                                - entero(self.margen * escala)?,
                            self.region.top + entero(rect.y * escala)?
                                - entero(self.margen * escala)?,
                            entero(((rect.ancho + 2.0 * self.margen) * escala).ceil())?,
                            entero(((rect.alto + 2.0 * self.margen) * escala).ceil())?,
                            windows::Win32::UI::WindowsAndMessaging::SWP_NOACTIVATE
                                | windows::Win32::UI::WindowsAndMessaging::SWP_NOZORDER,
                        )?;
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
                } => {
                    self.capas
                        .get_mut(id)
                        .ok_or(Error::Capa(*id))?
                        .curvas
                        .insert(*propiedad, curva.clone());
                }
                Operacion::Quitar { id } => self.quitar(*id)?,
            }
        }
        Ok(())
    }

    fn repintar(&self, id: CapaId) -> Resultado<()> {
        unsafe {
            let c = self.capa(id)?;
            let dpi = self
                .salidas
                .values()
                .next()
                .ok_or(Error::Entrada("Sin salidas"))?
                .ventana
                .dpi;
            let margen = c
                .dibujos
                .iter()
                .filter_map(|d| {
                    if let Dibujo::Sombra {
                        desenfoque,
                        desplazamiento,
                        ..
                    } = d
                    {
                        Some(3.0 * desenfoque + desplazamiento.0.abs().max(desplazamiento.1.abs()))
                    } else if let Dibujo::Rect {
                        borde: Some((ancho, _)),
                        ..
                    } = d
                    {
                        Some(ancho / 2.0)
                    } else {
                        None
                    }
                })
                .fold(0.0_f32, f32::max)
                .ceil();
            let superficie = self.dispositivo.CreateSurface(
                u32::try_from(entero(((c.rect.ancho + 2.0 * margen) * dpi / 96.0).ceil())?)
                    .map_err(|_| Error::Entrada("Ancho de superficie"))?,
                u32::try_from(entero(((c.rect.alto + 2.0 * margen) * dpi / 96.0).ceil())?)
                    .map_err(|_| Error::Entrada("Alto de superficie"))?,
                DXGI_FORMAT_B8G8R8A8_UNORM,
                DXGI_ALPHA_MODE_PREMULTIPLIED,
            )?;
            let mut offset = POINT::default();
            let ctx: ID2D1DeviceContext = superficie.BeginDraw(None, &raw mut offset)?;
            ctx.SetDpi(dpi, dpi);
            let mut transform = D2D1_LAYER_PARAMETERS1::default().maskTransform;
            transform.M11 = 1.0;
            transform.M22 = 1.0;
            transform.M31 = margen
                + f32::from(u16::try_from(offset.x).map_err(|_| Error::Entrada("Offset D2D X"))?)
                    * 96.0
                    / dpi;
            transform.M32 = margen
                + f32::from(u16::try_from(offset.y).map_err(|_| Error::Entrada("Offset D2D Y"))?)
                    * 96.0
                    / dpi;
            ctx.SetTransform(&raw const transform);
            ctx.Clear(Some(&D2D1_COLOR_F::default()));
            let dibujo = pintar::dibujar(&ctx, &self.texto, &c.dibujos);
            let fin = superficie.EndDraw();
            dibujo?;
            fin?;
            // DComp interpreta la superficie en píxeles. La raíz ya convierte DIP
            // a píxeles: compensar aquí evita escalar dos veces el contenido D2D.
            let escala_contenido = self.dispositivo.CreateScaleTransform()?;
            escala_contenido.SetScaleX2(96.0 / dpi)?;
            escala_contenido.SetScaleY2(96.0 / dpi)?;
            c.contenido.SetTransform(&escala_contenido)?;
            c.contenido.SetOffsetX2(-margen)?;
            c.contenido.SetOffsetY2(-margen)?;
            c.contenido.SetContent(&superficie)?;
        }
        Ok(())
    }

    fn fijar(&mut self, id: CapaId, p: Propiedad, v: f32) -> Resultado<()> {
        if !v.is_finite() {
            return Err(Error::Entrada("Propiedad no finita"));
        }
        let c = self.capas.get_mut(&id).ok_or(Error::Capa(id))?;
        c.curvas.remove(&p);
        c.valores.insert(p, v);
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

    fn animar(
        &mut self,
        id: CapaId,
        p: Propiedad,
        curva: &Curva,
        instante: Instante,
    ) -> Resultado<()> {
        let programa = tiempo::programar(curva, instante)?;
        if programa.fin <= 0.0 {
            return self.fijar(id, p, curva.final_);
        }
        unsafe {
            let animacion = self.dispositivo.CreateAnimation()?;
            for (offset, [a, b, c, d]) in programa.cubicos {
                animacion.AddCubic(offset, a, b, c, d)?;
            }
            if let Some((desde, duracion)) = programa.repetir {
                animacion.AddRepeat(desde, duracion)?;
            }
            animacion.End(programa.fin, curva.final_)?;
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
    // SAFETY: el rango anterior está estrictamente dentro de i32 y excluye NaN.
    Ok(unsafe { valor.to_int_unchecked::<i32>() })
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
