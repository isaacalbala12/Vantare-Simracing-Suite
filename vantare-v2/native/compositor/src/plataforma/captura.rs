use super::{Error, Plataforma, Resultado, pintar, tiempo, ventana::ancho};
use crate::escena::capas::{CapaId, Instante, Propiedad};
use std::path::Path;
use windows::Win32::{
    Foundation::GENERIC_WRITE,
    Graphics::{
        Direct2D::{
            Common::{
                D2D_RECT_F, D2D_SIZE_U, D2D1_ALPHA_MODE_PREMULTIPLIED, D2D1_COLOR_F,
                D2D1_PIXEL_FORMAT,
            },
            D2D1_BITMAP_OPTIONS_CANNOT_DRAW, D2D1_BITMAP_OPTIONS_CPU_READ,
            D2D1_BITMAP_OPTIONS_TARGET, D2D1_BITMAP_PROPERTIES1, D2D1_DEVICE_CONTEXT_OPTIONS_NONE,
            D2D1_LAYER_PARAMETERS1, D2D1_MAP_OPTIONS_READ, ID2D1DeviceContext,
        },
        Dxgi::Common::DXGI_FORMAT_B8G8R8A8_UNORM,
        Imaging::{
            CLSID_WICImagingFactory, GUID_ContainerFormatPng, GUID_WICPixelFormat32bppRGBA,
            IWICImagingFactory, WICBitmapEncoderNoCache,
        },
    },
    System::Com::{CLSCTX_INPROC_SERVER, CoCreateInstance},
};
use windows::core::PCWSTR;

impl Plataforma {
    /// PNG RGBA con valores RGB premultiplicados (convención de diff.py).
    /// `raiz=None` captura Monitor; una raíz captura `PorOverlay`, incluido su margen.
    pub fn capturar(&self, raiz: Option<CapaId>, instante: Instante, ruta: &Path) -> Resultado<()> {
        let salida = self
            .salidas
            .get(&raiz)
            .ok_or(Error::Entrada("Salida de captura inexistente"))?;
        let mut cliente = windows::Win32::Foundation::RECT::default();
        unsafe {
            windows::Win32::UI::WindowsAndMessaging::GetClientRect(
                salida.ventana.hwnd,
                &raw mut cliente,
            )?;
        }
        let ancho_px =
            u32::try_from(cliente.right).map_err(|_| Error::Entrada("Ancho de captura"))?;
        let alto_px =
            u32::try_from(cliente.bottom).map_err(|_| Error::Entrada("Alto de captura"))?;
        unsafe {
            let ctx = self
                .d2d
                .CreateDeviceContext(D2D1_DEVICE_CONTEXT_OPTIONS_NONE)?;
            let props = D2D1_BITMAP_PROPERTIES1 {
                pixelFormat: D2D1_PIXEL_FORMAT {
                    format: DXGI_FORMAT_B8G8R8A8_UNORM,
                    alphaMode: D2D1_ALPHA_MODE_PREMULTIPLIED,
                },
                dpiX: salida.ventana.dpi,
                dpiY: salida.ventana.dpi,
                bitmapOptions: D2D1_BITMAP_OPTIONS_TARGET,
                ..Default::default()
            };
            let bitmap = ctx.CreateBitmap(
                D2D_SIZE_U {
                    width: ancho_px,
                    height: alto_px,
                },
                None,
                0,
                &raw const props,
            )?;
            ctx.SetTarget(&bitmap);
            ctx.SetDpi(salida.ventana.dpi, salida.ventana.dpi);
            ctx.BeginDraw();
            ctx.Clear(Some(&D2D1_COLOR_F::default()));
            let mut origen = D2D1_LAYER_PARAMETERS1::default().maskTransform;
            origen.M11 = 1.0;
            origen.M22 = 1.0;
            if let Some(id) = raiz {
                let r = self.capa(id)?.rect;
                origen.M31 = self.margen - r.x;
                origen.M32 = self.margen - r.y;
            }
            let dibujo = self.dibujar_arbol(
                &ctx,
                None,
                raiz,
                instante,
                [
                    origen.M11, origen.M12, origen.M21, origen.M22, origen.M31, origen.M32,
                ],
            );
            let fin = ctx.EndDraw(None, None);
            dibujo?;
            fin?;
            ctx.SetTarget(None);
            let lectura = ctx.CreateBitmap(
                D2D_SIZE_U {
                    width: ancho_px,
                    height: alto_px,
                },
                None,
                0,
                &D2D1_BITMAP_PROPERTIES1 {
                    bitmapOptions: D2D1_BITMAP_OPTIONS_CPU_READ | D2D1_BITMAP_OPTIONS_CANNOT_DRAW,
                    ..props
                },
            )?;
            lectura.CopyFromBitmap(None, &bitmap, None)?;
            let mapa = lectura.Map(D2D1_MAP_OPTIONS_READ)?;
            let cantidad = usize::try_from(mapa.pitch)
                .map_err(|_| Error::Entrada("Stride de captura"))?
                .checked_mul(
                    usize::try_from(alto_px).map_err(|_| Error::Entrada("Alto de captura"))?,
                )
                .ok_or(Error::Entrada("Captura demasiado grande"))?;
            // SAFETY: Map mantiene bits válidos para pitch*alto hasta Unmap.
            let mut bytes = std::slice::from_raw_parts(mapa.bits, cantidad).to_vec();
            lectura.Unmap()?;
            for pixel in bytes.chunks_exact_mut(4) {
                pixel.swap(0, 2);
            }
            guardar_png(ruta, ancho_px, alto_px, mapa.pitch, &bytes)?;
        }
        Ok(())
    }

    fn dibujar_arbol(
        &self,
        ctx: &ID2D1DeviceContext,
        padre: Option<CapaId>,
        solo: Option<CapaId>,
        instante: Instante,
        matriz: [f32; 6],
    ) -> Resultado<()> {
        let mut hijos: Vec<_> = self
            .capas
            .iter()
            .filter(|(id, c)| {
                c.padre == padre && (padre.is_some() || solo.is_none_or(|solo| solo == **id))
            })
            .collect();
        hijos.sort_by_key(|(_, c)| c.orden);
        for (id, c) in hijos {
            let valor = |p, defecto| -> Resultado<f32> {
                c.curvas.get(&p).map_or_else(
                    || Ok(c.valores.get(&p).copied().unwrap_or(defecto)),
                    |curva| tiempo::evaluar(curva, instante),
                )
            };
            let escala = valor(Propiedad::Escala, 1.0)?;
            let angulo = valor(Propiedad::Giro, 0.0)?.to_radians();
            let (seno, coseno) = angulo.sin_cos();
            let coseno_escalado = escala * coseno;
            let seno_escalado = escala * seno;
            let centro = (c.rect.ancho / 2.0, c.rect.alto / 2.0);
            let traslacion_x = c.rect.x + valor(Propiedad::X, 0.0)? + centro.0
                - coseno_escalado * centro.0
                + seno_escalado * centro.1;
            let traslacion_y = c.rect.y + valor(Propiedad::Y, 0.0)? + centro.1
                - seno_escalado * centro.0
                - coseno_escalado * centro.1;
            let local = [
                coseno_escalado * matriz[0] + seno_escalado * matriz[2],
                coseno_escalado * matriz[1] + seno_escalado * matriz[3],
                -seno_escalado * matriz[0] + coseno_escalado * matriz[2],
                -seno_escalado * matriz[1] + coseno_escalado * matriz[3],
                traslacion_x * matriz[0] + traslacion_y * matriz[2] + matriz[4],
                traslacion_x * matriz[1] + traslacion_y * matriz[3] + matriz[5],
            ];
            let mut transform = D2D1_LAYER_PARAMETERS1::default().maskTransform;
            transform.M11 = local[0];
            transform.M12 = local[1];
            transform.M21 = local[2];
            transform.M22 = local[3];
            transform.M31 = local[4];
            transform.M32 = local[5];
            unsafe {
                ctx.SetTransform(&raw const transform);
                let mut layer = D2D1_LAYER_PARAMETERS1 {
                    contentBounds: D2D_RECT_F {
                        left: -1e8,
                        top: -1e8,
                        right: 1e8,
                        bottom: 1e8,
                    },
                    opacity: valor(Propiedad::Opacidad, 1.0)?,
                    ..Default::default()
                };
                layer.maskTransform.M11 = 1.0;
                layer.maskTransform.M22 = 1.0;
                ctx.PushLayer(&raw const layer, None);
                let resultado = pintar::dibujar(ctx, &self.texto, &c.dibujos)
                    .and_then(|()| self.dibujar_arbol(ctx, Some(*id), None, instante, local));
                ctx.PopLayer();
                resultado?;
            }
        }
        Ok(())
    }
}

unsafe fn guardar_png(
    ruta: &Path,
    ancho_px: u32,
    alto: u32,
    stride: u32,
    bytes: &[u8],
) -> Resultado<()> {
    unsafe {
        let wic: IWICImagingFactory =
            CoCreateInstance(&CLSID_WICImagingFactory, None, CLSCTX_INPROC_SERVER)?;
        let stream = wic.CreateStream()?;
        let ruta = ancho(ruta.as_os_str());
        stream.InitializeFromFilename(PCWSTR(ruta.as_ptr()), GENERIC_WRITE.0)?;
        let encoder = wic.CreateEncoder(&GUID_ContainerFormatPng, std::ptr::null())?;
        encoder.Initialize(&stream, WICBitmapEncoderNoCache)?;
        let mut frame = None;
        let mut opciones = None;
        encoder.CreateNewFrame(&raw mut frame, &raw mut opciones)?;
        let frame = frame.ok_or(Error::Entrada("WIC no devolvió frame"))?;
        frame.Initialize(opciones.as_ref())?;
        frame.SetSize(ancho_px, alto)?;
        let mut formato = GUID_WICPixelFormat32bppRGBA;
        frame.SetPixelFormat(&raw mut formato)?;
        if formato != GUID_WICPixelFormat32bppRGBA {
            return Err(Error::Entrada("WIC no admite PNG RGBA"));
        }
        frame.WritePixels(alto, stride, bytes)?;
        frame.Commit()?;
        encoder.Commit()?;
    }
    Ok(())
}
