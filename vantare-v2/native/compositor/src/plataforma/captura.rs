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
            CLSID_WICImagingFactory, GUID_ContainerFormatPng, GUID_WICPixelFormat32bppBGRA,
            IWICImagingFactory, WICBitmapEncoderNoCache,
        },
    },
    System::Com::{CLSCTX_INPROC_SERVER, CoCreateInstance},
};
use windows::core::PCWSTR;

struct CapturaBgra {
    ancho: u32,
    alto: u32,
    stride: u32,
    bytes: Vec<u8>,
}

impl Plataforma {
    /// PNG RGBA con valores RGB premultiplicados (convención de diff.py).
    /// `raiz=None` captura Monitor; una raíz captura `PorOverlay`, incluido su margen.
    pub fn capturar(&self, raiz: Option<CapaId>, instante: Instante, ruta: &Path) -> Resultado<()> {
        let imagen = self.capturar_bitmap(raiz, instante)?;
        unsafe {
            guardar_png(
                ruta,
                imagen.ancho,
                imagen.alto,
                imagen.stride,
                &imagen.bytes,
            )?;
        }
        Ok(())
    }

    fn capturar_bitmap(&self, raiz: Option<CapaId>, instante: Instante) -> Resultado<CapturaBgra> {
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
            origen.M31 = salida.origen.0;
            origen.M32 = salida.origen.1;
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
            let bytes = std::slice::from_raw_parts(mapa.bits, cantidad).to_vec();
            lectura.Unmap()?;
            Ok(CapturaBgra {
                ancho: ancho_px,
                alto: alto_px,
                stride: mapa.pitch,
                bytes,
            })
        }
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
        let mut formato = GUID_WICPixelFormat32bppBGRA;
        frame.SetPixelFormat(&raw mut formato)?;
        if formato != GUID_WICPixelFormat32bppBGRA {
            return Err(Error::Entrada("WIC no admite PNG BGRA de 32 bits"));
        }
        frame.WritePixels(alto, stride, bytes)?;
        frame.Commit()?;
        encoder.Commit()?;
    }
    Ok(())
}
#[cfg(test)]
mod tests {
    use super::*;
    use crate::escena::capas::{Alineacion, Color, Dibujo, Fuente, Lote, Operacion, Pintura, Rect};
    use crate::plataforma::{Modo, MotivoOrden};
    use windows::core::Interface;
    fn rect() -> Rect {
        Rect {
            x: 0.0,
            y: 0.0,
            ancho: 8.0,
            alto: 8.0,
        }
    }
    fn escenario(modo: Modo) -> Resultado<Plataforma> {
        let mut p = Plataforma::nueva(
            modo,
            windows::Win32::Foundation::RECT {
                left: 0,
                top: 0,
                right: 8,
                bottom: 8,
            },
            Path::new(concat!(env!("CARGO_MANIFEST_DIR"), "/../ui/assets/fonts")),
        )?;
        let mut ops = vec![
            Operacion::Crear {
                id: CapaId(1),
                padre: None,
                orden: 0,
            },
            Operacion::Colocar {
                id: CapaId(1),
                rect: rect(),
            },
            Operacion::Crear {
                id: CapaId(5),
                padre: None,
                orden: 1,
            },
        ];
        for (id, color) in [
            (
                2,
                Color {
                    r: 1.0,
                    g: 0.0,
                    b: 0.0,
                    a: 1.0,
                },
            ),
            (
                3,
                Color {
                    r: 0.0,
                    g: 0.0,
                    b: 1.0,
                    a: 1.0,
                },
            ),
            (
                4,
                Color {
                    r: 0.0,
                    g: 1.0,
                    b: 0.0,
                    a: 1.0,
                },
            ),
        ] {
            ops.extend([
                Operacion::Crear {
                    id: CapaId(id),
                    padre: Some(CapaId(1)),
                    orden: id - 2,
                },
                Operacion::Colocar {
                    id: CapaId(id),
                    rect: rect(),
                },
                Operacion::Pintar {
                    id: CapaId(id),
                    dibujos: vec![Dibujo::Rect {
                        rect: rect(),
                        radios: [0.0; 4],
                        relleno: Some(Pintura::Solido(color)),
                        borde: None,
                    }],
                },
            ]);
        }
        ops.push(Operacion::Fijar {
            id: CapaId(4),
            propiedad: Propiedad::Opacidad,
            valor: 0.0,
        });
        p.aplicar(&Lote { operaciones: ops })?;
        Ok(p)
    }
    fn pixel_central(p: &Plataforma) -> Resultado<[u8; 4]> {
        let clave = if p.modo == Modo::Monitor {
            None
        } else {
            Some(CapaId(1))
        };
        let salida = p
            .salidas
            .get(&clave)
            .ok_or(Error::Entrada("Sin salida de prueba"))?;
        let x = usize::try_from(super::super::entero(
            (salida.origen.0 + 4.0) * salida.ventana.dpi / 96.0,
        )?)
        .map_err(|_| Error::Entrada("Pixel X"))?;
        let y = usize::try_from(super::super::entero(
            (salida.origen.1 + 4.0) * salida.ventana.dpi / 96.0,
        )?)
        .map_err(|_| Error::Entrada("Pixel Y"))?;
        let imagen = p.capturar_bitmap(clave, p.ahora()?)?;
        let offset = y * usize::try_from(imagen.stride)
            .map_err(|_| Error::Entrada("Stride de prueba"))?
            + x * 4;
        imagen
            .bytes
            .get(offset..offset + 4)
            .ok_or(Error::Entrada("Pixel fuera de captura"))?
            .try_into()
            .map_err(|_| Error::Entrada("Pixel BGRA incompleto"))
    }
    #[test]
    fn ordenar_cambia_el_pixel_frontal_sin_repintar_y_conserva_las_fantasmas() -> Resultado<()> {
        for modo in [Modo::Monitor, Modo::PorOverlay] {
            let mut p = escenario(modo)?;
            assert_eq!(pixel_central(&p)?, [255, 0, 0, 255]); // Azul en BGRA.
            let pintados = p.repintados.get();
            let identidades: Vec<_> = p
                .capas
                .iter()
                .map(|(id, c)| (*id, c.posicion.as_raw()))
                .collect();
            p.aplicar(&Lote {
                operaciones: vec![
                    Operacion::Ordenar {
                        padre: Some(CapaId(1)),
                        hijos: vec![CapaId(3), CapaId(4), CapaId(2)],
                    },
                    Operacion::Ordenar {
                        padre: None,
                        hijos: vec![CapaId(5), CapaId(1)],
                    },
                ],
            })?;
            assert_eq!(pixel_central(&p)?, [0, 0, 255, 255]); // Rojo en BGRA.
            assert_eq!(p.repintados.get(), pintados);
            assert_eq!(
                p.capas
                    .iter()
                    .map(|(id, c)| (*id, c.posicion.as_raw()))
                    .collect::<Vec<_>>(),
                identidades
            );
            assert!(matches!(
                p.ordenar(Some(CapaId(1)), &[CapaId(2), CapaId(3)]),
                Err(Error::OrdenInvalido {
                    motivo: MotivoOrden::Cantidad {
                        esperada: 3,
                        recibida: 2
                    },
                    ..
                })
            ));
            assert!(matches!(
                p.ordenar(Some(CapaId(1)), &[CapaId(2), CapaId(2), CapaId(4)]),
                Err(Error::OrdenInvalido {
                    motivo: MotivoOrden::Duplicada(CapaId(2)),
                    ..
                })
            ));
            assert!(matches!(
                p.ordenar(Some(CapaId(1)), &[CapaId(2), CapaId(3), CapaId(5)]),
                Err(Error::OrdenInvalido {
                    motivo: MotivoOrden::PadreDistinto(CapaId(5)),
                    ..
                })
            ));
            assert!(matches!(
                p.ordenar(Some(CapaId(1)), &[CapaId(2), CapaId(3), CapaId(99)]),
                Err(Error::Capa(CapaId(99)))
            ));
            assert!(matches!(
                p.ordenar(Some(CapaId(99)), &[]),
                Err(Error::Capa(CapaId(99)))
            ));
        }
        Ok(())
    }
    #[test]
    fn salida_cubre_sombra_y_extremo_interior_sin_mover_la_maquetacion() -> Resultado<()> {
        use crate::escena::capas::{Curva, Tramo};
        let mut p = escenario(Modo::PorOverlay)?;
        let rect = Rect {
            x: 300.0,
            y: 200.0,
            ancho: 100.0,
            alto: 50.0,
        };
        let inicio = p.ahora()?;
        p.aplicar(&Lote {
            operaciones: vec![
                Operacion::Colocar {
                    id: CapaId(1),
                    rect,
                },
                Operacion::Pintar {
                    id: CapaId(1),
                    dibujos: vec![Dibujo::Sombra {
                        rect: Rect {
                            x: 0.0,
                            y: 0.0,
                            ..rect
                        },
                        radios: [0.0; 4],
                        color: Color {
                            r: 0.0,
                            g: 0.0,
                            b: 0.0,
                            a: 1.0,
                        },
                        desenfoque: 26.0,
                        desplazamiento: (0.0, 10.0),
                    }],
                },
                Operacion::Animar {
                    id: CapaId(1),
                    propiedad: Propiedad::X,
                    curva: Curva {
                        inicio,
                        tramos: vec![Tramo {
                            desde: 0.0,
                            a: 0.0,
                            b: 400.0,
                            c: -400.0,
                            d: 0.0,
                        }],
                        fin: 1.0,
                        final_: 0.0,
                        repetir: None,
                    },
                },
            ],
        })?;
        let salida = p
            .salidas
            .get(&Some(CapaId(1)))
            .ok_or(Error::Entrada("Sin salida"))?;
        let escala = salida.ventana.dpi / 96.0;
        let mut ventana = windows::Win32::Foundation::RECT::default();
        unsafe {
            windows::Win32::UI::WindowsAndMessaging::GetWindowRect(
                salida.ventana.hwnd,
                &raw mut ventana,
            )?;
        }
        assert!(f64::from(ventana.left) <= f64::from((222.0 - 64.0) * escala));
        assert!(f64::from(ventana.right) >= f64::from((578.0 + 64.0) * escala));
        assert!(f64::from(ventana.top) <= f64::from((132.0 - 64.0) * escala));
        assert!(f64::from(ventana.bottom) >= f64::from((338.0 + 64.0) * escala));
        assert!((p.capa(CapaId(1))?.rect.x - 300.0).abs() < f32::EPSILON);
        let imagen = p.capturar_bitmap(Some(CapaId(1)), inicio)?;
        // Tinta de sombra a 10 DIP a la izquierda de la caja de maquetación.
        let x = usize::try_from(super::super::entero((salida.origen.0 + 290.0) * escala)?)
            .map_err(|_| Error::Entrada("Pixel X"))?;
        let y = usize::try_from(super::super::entero((salida.origen.1 + 225.0) * escala)?)
            .map_err(|_| Error::Entrada("Pixel Y"))?;
        let stride = usize::try_from(imagen.stride).map_err(|_| Error::Entrada("Stride"))?;
        assert!(imagen.bytes[y * stride + x * 4 + 3] > 0);
        Ok(())
    }
    #[test]
    fn pintar_con_un_peso_inexistente_devuelve_error_tipado() -> Resultado<()> {
        let mut p = escenario(Modo::Monitor)?;
        let resultado = p.aplicar(&Lote {
            operaciones: vec![Operacion::Pintar {
                id: CapaId(2),
                dibujos: vec![Dibujo::Texto {
                    caja: rect(),
                    texto: "abc".into(),
                    fuente: Fuente {
                        familia: "Inter".into(),
                        peso: 900,
                        tamano: 12.0,
                        interletra: 0.0,
                        interlinea: 16.0,
                        tabulares: true,
                        mayusculas: false,
                    },
                    color: Color {
                        r: 1.0,
                        g: 1.0,
                        b: 1.0,
                        a: 1.0,
                    },
                    alineacion: Alineacion::Inicio,
                }],
            }],
        });
        assert!(matches!(
            resultado,
            Err(Error::FuenteNoDisponible { peso: 900, .. })
        ));
        Ok(())
    }
}
