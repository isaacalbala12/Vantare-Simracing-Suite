use super::{Error, Resultado, texto::Texto};
use crate::escena::capas::{Color, Dibujo, Pintura, Rect};
use windows::{
    Win32::Graphics::{
        Direct2D::{Common::*, *},
        DirectWrite::IDWriteTextLayout,
    },
    core::Interface,
};

pub(super) fn color(c: Color) -> D2D1_COLOR_F {
    D2D1_COLOR_F {
        r: c.r,
        g: c.g,
        b: c.b,
        a: c.a,
    }
}
pub(super) fn rect(r: Rect) -> D2D_RECT_F {
    D2D_RECT_F {
        left: r.x,
        top: r.y,
        right: r.x + r.ancho,
        bottom: r.y + r.alto,
    }
}

fn geometria(ctx: &ID2D1DeviceContext, r: Rect, radios: [f32; 4]) -> Resultado<ID2D1PathGeometry> {
    unsafe {
        let geometria = ctx.GetFactory()?.CreatePathGeometry()?;
        let sink = geometria.Open()?;
        let punto = |x, y| {
            let mut p = D2D1_LINEAR_GRADIENT_BRUSH_PROPERTIES::default().startPoint;
            p.X = x;
            p.Y = y;
            p
        };
        let [superior_izquierda, superior_derecha, inferior_derecha, inferior_izquierda] = radios.map(|radio| radio.max(0.0).min(r.ancho / 2.0).min(r.alto / 2.0));
        let (x, y, ancho, alto) = (r.x, r.y, r.ancho, r.alto);
        sink.BeginFigure(punto(x + superior_izquierda, y), D2D1_FIGURE_BEGIN_FILLED);
        for (linea, esquina, radio) in [
            ((x + ancho - superior_derecha, y), (x + ancho, y + superior_derecha), superior_derecha),
            ((x + ancho, y + alto - inferior_derecha), (x + ancho - inferior_derecha, y + alto), inferior_derecha),
            ((x + inferior_izquierda, y + alto), (x, y + alto - inferior_izquierda), inferior_izquierda),
            ((x, y + superior_izquierda), (x + superior_izquierda, y), superior_izquierda),
        ] {
            sink.AddLine(punto(linea.0, linea.1));
            if radio > 0.0 {
                sink.AddArc(&D2D1_ARC_SEGMENT {
                    point: punto(esquina.0, esquina.1),
                    size: D2D_SIZE_F {
                        width: radio,
                        height: radio,
                    },
                    rotationAngle: 0.0,
                    sweepDirection: D2D1_SWEEP_DIRECTION_CLOCKWISE,
                    arcSize: D2D1_ARC_SIZE_SMALL,
                });
            } else {
                sink.AddLine(punto(esquina.0, esquina.1));
            }
        }
        sink.EndFigure(D2D1_FIGURE_END_CLOSED);
        sink.Close()?;
        Ok(geometria)
    }
}

fn pincel(ctx: &ID2D1DeviceContext, pintura: &Pintura, r: Rect) -> Resultado<ID2D1Brush> {
    unsafe {
        if let Pintura::Solido(c) = pintura {
            return Ok(ctx.CreateSolidColorBrush(&color(*c), None)?.cast()?);
        }
        let paradas = match pintura {
            Pintura::Lineal { paradas, .. } | Pintura::Radial { paradas, .. } => paradas,
            Pintura::Solido(_) => unreachable!(),
        };
        let paradas: Vec<_> = paradas
            .iter()
            .map(|p| D2D1_GRADIENT_STOP {
                position: p.posicion,
                color: color(p.color),
            })
            .collect();
        let base: ID2D1RenderTarget = ctx.cast()?;
        let stops =
            base.CreateGradientStopCollection(&paradas, D2D1_GAMMA_2_2, D2D1_EXTEND_MODE_CLAMP)?;
        let punto = |x, y| {
            let mut p = D2D1_LINEAR_GRADIENT_BRUSH_PROPERTIES::default().startPoint;
            p.X = r.x + x * r.ancho;
            p.Y = r.y + y * r.alto;
            p
        };
        Ok(match pintura {
            Pintura::Lineal { desde, hasta, .. } => ctx
                .CreateLinearGradientBrush(
                    &D2D1_LINEAR_GRADIENT_BRUSH_PROPERTIES {
                        startPoint: punto(desde.0, desde.1),
                        endPoint: punto(hasta.0, hasta.1),
                    },
                    None,
                    &stops,
                )?
                .cast()?,
            Pintura::Radial { centro, radio, .. } => ctx
                .CreateRadialGradientBrush(
                    &D2D1_RADIAL_GRADIENT_BRUSH_PROPERTIES {
                        center: punto(centro.0, centro.1),
                        gradientOriginOffset: D2D1_LINEAR_GRADIENT_BRUSH_PROPERTIES::default().startPoint,
                        radiusX: radio.0 * r.ancho,
                        radiusY: radio.1 * r.alto,
                    },
                    None,
                    &stops,
                )?
                .cast()?,
            Pintura::Solido(_) => unreachable!(),
        })
    }
}

/// Dibuja en un contexto que ya tiene target, `BeginDraw` y transformación.
pub(super) fn dibujar(
    ctx: &ID2D1DeviceContext,
    texto: &Texto,
    dibujos: &[Dibujo],
) -> Resultado<()> {
    let mut recortes = 0_u32;
    let resultado = (|| {
        unsafe {
            ctx.SetTextRenderingParams(&texto.parametros);
            ctx.SetTextAntialiasMode(D2D1_TEXT_ANTIALIAS_MODE_GRAYSCALE);
            for dibujo in dibujos {
                match dibujo {
                    Dibujo::Rect {
                        rect: r,
                        radios,
                        relleno,
                        borde,
                    } => {
                        let g = geometria(ctx, *r, *radios)?;
                        if let Some(p) = relleno {
                            ctx.FillGeometry(&g, &pincel(ctx, p, *r)?, None);
                        }
                        if let Some((ancho, p)) = borde {
                            ctx.DrawGeometry(&g, &pincel(ctx, p, *r)?, *ancho, None);
                        }
                    }
                    Dibujo::Texto {
                        caja,
                        texto: contenido,
                        fuente,
                        color: c,
                        alineacion,
                    } => {
                        let layout: IDWriteTextLayout = texto
                            .layout(contenido, fuente, caja.ancho, caja.alto, *alineacion)?
                            .cast()?;
                        let mut origen =
                            D2D1_LINEAR_GRADIENT_BRUSH_PROPERTIES::default().startPoint;
                        origen.X = caja.x;
                        origen.Y = caja.y;
                        ctx.DrawTextLayout(
                            origen,
                            &layout,
                            &ctx.CreateSolidColorBrush(&color(*c), None)?,
                            D2D1_DRAW_TEXT_OPTIONS_CLIP,
                        );
                    }
                    Dibujo::Recorte { rect: r, radios } => {
                        let g = geometria(ctx, *r, *radios)?;
                        let mut parametros = D2D1_LAYER_PARAMETERS1 {
                            contentBounds: rect(*r),
                            geometricMask: std::mem::ManuallyDrop::new(Some(g.cast()?)),
                            maskAntialiasMode: D2D1_ANTIALIAS_MODE_PER_PRIMITIVE,
                            opacity: 1.0,
                            ..Default::default()
                        };
                        parametros.maskTransform.M11 = 1.0;
                        parametros.maskTransform.M22 = 1.0;
                        ctx.PushLayer(&raw const parametros, None);
                        // El binding usa ManuallyDrop para el parámetro COM; liberar nuestra referencia.
                        std::mem::ManuallyDrop::drop(&mut parametros.geometricMask);
                        recortes += 1;
                    }
                    Dibujo::FinRecorte => {
                        if recortes == 0 {
                            return Err(Error::Entrada("FinRecorte sin Recorte"));
                        }
                        ctx.PopLayer();
                        recortes -= 1;
                    }
                    Dibujo::Sombra {
                        rect: r,
                        radios,
                        color: c,
                        desenfoque,
                        desplazamiento,
                    } => {
                        let grabador = ctx
                            .GetDevice()?
                            .CreateDeviceContext(D2D1_DEVICE_CONTEXT_OPTIONS_NONE)?;
                        let comando = grabador.CreateCommandList()?;
                        grabador.SetTarget(&comando);
                        grabador.BeginDraw();
                        let g = geometria(&grabador, *r, *radios)?;
                        grabador.FillGeometry(
                            &g,
                            &grabador.CreateSolidColorBrush(&color(*c), None)?,
                            None,
                        );
                        grabador.EndDraw(None, None)?;
                        grabador.SetTarget(None);
                        comando.Close()?;
                        let sombra = ctx.CreateEffect(&CLSID_D2D1GaussianBlur)?;
                        sombra.SetInput(0, &comando, true);
                        sombra.SetValue(
                            D2D1_GAUSSIANBLUR_PROP_STANDARD_DEVIATION
                                .0
                                .try_into()
                                .map_err(|_| Error::Entrada("Índice del efecto"))?,
                            D2D1_PROPERTY_TYPE_FLOAT,
                            &desenfoque.to_ne_bytes(),
                        )?;
                        let mut origen =
                            D2D1_LINEAR_GRADIENT_BRUSH_PROPERTIES::default().startPoint;
                        origen.X = desplazamiento.0;
                        origen.Y = desplazamiento.1;
                        ctx.DrawImage(
                            &sombra.GetOutput()?,
                            Some(&raw const origen),
                            None,
                            D2D1_INTERPOLATION_MODE_LINEAR,
                            D2D1_COMPOSITE_MODE_SOURCE_OVER,
                        );
                    }
                }
            }
        }
        if recortes != 0 {
            return Err(Error::Entrada("Recorte sin FinRecorte"));
        }
        Ok(())
    })();
    for _ in 0..recortes {
        unsafe {
            ctx.PopLayer();
        }
    }
    resultado
}
