//! Pintado de Standings Eficiencia sobre el API de bajo nivel de GPUI.
//!
//! Todo se dibuja en un unico lienzo a partir de la geometria CSS del producto
//! (`parity/SPEC.md`): la tabla, los pies y el rail PIT se posicionan con las
//! mismas cifras que mide el widget Wails, sin depender del layout flex de GPUI.

use super::model::{self, Align, Config, Labels, Metric, Plan, Row, Status, Vm};
use super::motion::{Frame, RowVis};
use super::style::Style;
use crate::efficiency::preview::PaintWindow as Window;
use crate::efficiency::text;
use crate::efficiency::{self, paint_rect, rect};
use gpui::{
    App, BorderStyle, BoxShadow, ContentMask, Corners, Edges, Hsla, PathBuilder, Pixels, Point,
    fill, linear_color_stop, linear_gradient, point, px, quad,
};
use std::{
    cell::{Cell, RefCell},
    sync::{Arc, OnceLock},
};
use vantare_domain::{FlagKind, format::Language};

const LOGO: &[u8] = include_bytes!("../../assets/vantare-mark.png");

pub struct Scene {
    pub config: Config,
    pub vm: Vm,
    pub plan: Plan,
    pub frame: Frame,
    pub language: Language,
    pub height: f32,
}

thread_local! {
    /// Opacidad de grupo (fundidos de fila): GPUI no expone `with_element_opacity`.
    static OPACITY: Cell<f32> = const { Cell::new(1.0) };
}

fn opacity() -> f32 {
    OPACITY.with(Cell::get)
}

fn with_opacity<R>(value: f32, f: impl FnOnce() -> R) -> R {
    let previous = OPACITY.with(|o| o.replace(opacity() * value));
    let result = f();
    OPACITY.with(|o| o.set(previous));
    result
}

fn col(hex: u32, alpha: f32) -> Hsla {
    efficiency::col(hex, alpha * opacity())
}

fn transparent() -> Hsla {
    col(0x000000, 0.0)
}

fn pt(x: f32, y: f32) -> Point<Pixels> {
    let (ox, oy) = text::origin();
    point(px(x + ox), px(y + oy))
}

fn flag_rgb(style: &Style, flag: Option<&FlagKind>) -> u32 {
    match flag {
        None | Some(FlagKind::Other(_)) => style.colors.flag_unknown.0,
        Some(FlagKind::Green) => style.colors.flag_green.0,
        Some(FlagKind::Yellow) => style.colors.flag_yellow.0,
        Some(FlagKind::Blue) => style.colors.flag_blue.0,
        Some(FlagKind::Red) => style.colors.flag_red.0,
        Some(FlagKind::White) => style.colors.white.0,
        Some(FlagKind::Black) => style.colors.flag_black.0,
        Some(FlagKind::Checkered) => style.colors.flag_checkered.0,
    }
}

// ---------------------------------------------------------------------------
// Primitivas
// ---------------------------------------------------------------------------

/// Recorta un poligono convexo por el semiplano `nx*x + ny*y >= d`.
fn clip_half_plane(poly: &[(f32, f32)], nx: f32, ny: f32, d: f32) -> Vec<(f32, f32)> {
    let mut out = Vec::new();
    for i in 0..poly.len() {
        let (a, b) = (poly[i], poly[(i + 1) % poly.len()]);
        let (da, db) = (nx * a.0 + ny * a.1 - d, nx * b.0 + ny * b.1 - d);
        if da >= 0.0 {
            out.push(a);
        }
        if (da >= 0.0) != (db >= 0.0) {
            let t = da / (da - db);
            out.push((a.0 + (b.0 - a.0) * t, a.1 + (b.1 - a.1) * t));
        }
    }
    out
}

fn paint_polygon(window: &mut Window, poly: &[(f32, f32)], color: Hsla) {
    if poly.len() < 3 {
        return;
    }
    let mut builder = PathBuilder::fill();
    builder.move_to(pt(poly[0].0, poly[0].1));
    for p in &poly[1..] {
        builder.line_to(pt(p.0, p.1));
    }
    builder.close();
    if let Ok(path) = builder.build() {
        window.paint_path(path, color);
    }
}

/// Cola de la sombra en el hueco del rail: alfa = 0,48 * borde gaussiano en x
/// (sigma 12,5 = blur/2) * ventana gaussiana en y del rectangulo reducido
/// (`spread -12`, desplazado 14 px hacia abajo).
fn shadow_strip(style: &Style, width: f32, height: u32) -> Vec<u8> {
    fn phi(x: f32) -> f32 {
        // Abramowitz-Stegun 7.1.26 (error < 1,5e-7).
        let z = x.abs() / std::f32::consts::SQRT_2;
        let t = 1.0 / (1.0 + 0.327_591_1 * z);
        let poly = t
            * (0.254_829_6
                + t * (-0.284_496_74 + t * (1.421_413_8 + t * (-1.453_152_1 + t * 1.061_405_4))));
        let erf = 1.0 - poly * (-z * z).exp();
        0.5 * (1.0 + erf.copysign(x))
    }
    let (sigma, edge_x, top, bottom) = (
        style.shadow.sigma,
        width + style.shadow.spread,
        -style.shadow.spread + style.shadow.offset_y,
        height as f32 + style.shadow.spread + style.shadow.offset_y,
    );
    let mut pixels =
        Vec::with_capacity((style.geometry.pit_rail_width as u32 * height * 4) as usize);
    for y in 0..height {
        let gy = phi((y as f32 + 0.5 - top) / sigma) - phi((y as f32 + 0.5 - bottom) / sigma);
        for x in 0..style.geometry.pit_rail_width as u32 {
            let gx = phi((edge_x - (width + x as f32 + 0.5)) / sigma);
            let alpha = (style.shadow.alpha * gx * gy * 255.0)
                .round()
                .clamp(0.0, 255.0) as u8;
            pixels.extend_from_slice(&[0, 0, 0, alpha]);
        }
    }
    pixels
}

fn paint_shadow_strip(style: &Style, window: &mut Window, cx: &mut App, width: f32, height: f32) {
    type ShadowKey = (u32, u32, u32, super::style::Shadow);
    thread_local! {
        static STRIP: RefCell<Option<(ShadowKey, Arc<gpui::RenderImage>)>> = const { RefCell::new(None) };
    }
    let h = height as u32;
    let key = (
        h,
        width.to_bits(),
        style.geometry.pit_rail_width.to_bits(),
        style.shadow.clone(),
    );
    let cached = STRIP.with(|s| {
        s.borrow()
            .as_ref()
            .filter(|(cached, _)| *cached == key)
            .map(|(_, i)| i.clone())
    });
    let image = cached.or_else(|| {
        let mut png_bytes = Vec::new();
        {
            let mut encoder =
                png::Encoder::new(&mut png_bytes, style.geometry.pit_rail_width as u32, h);
            encoder.set_color(png::ColorType::Rgba);
            encoder.set_depth(png::BitDepth::Eight);
            let mut writer = encoder.write_header().ok()?;
            writer
                .write_image_data(&shadow_strip(style, width, h))
                .ok()?;
        }
        let image = gpui::Image::from_bytes(gpui::ImageFormat::Png, png_bytes)
            .to_image_data(cx.svg_renderer())
            .ok()?;
        STRIP.with(|s| *s.borrow_mut() = Some((key, image.clone())));
        Some(image)
    });
    if let Some(image) = image {
        let bounds = rect(width, 0.0, style.geometry.pit_rail_width, height);
        let _ = window.paint_image(bounds, bounds, Corners::all(px(0.0)), image, 0, false);
    }
}

/// Franja de bandera (`.vf-standings::before`): 130 x 50 arriba a la derecha,
/// `linear-gradient(131deg, ... 37%-54% a 28 %, 62%-79% a 17 %)`.
fn paint_flag_ribbon(
    style: &Style,
    window: &mut Window,
    flag: Option<&FlagKind>,
    width: f32,
    broadcast: bool,
) {
    let (bw, bh) = if broadcast {
        ((width - 250.0).clamp(0.0, 180.0), 46.0)
    } else {
        (130.0f32, 50.0f32)
    };
    let (x0, y0) = (width - bw, 0.0f32);
    let angle = 131.0f32.to_radians();
    let (dx, dy) = (angle.sin(), -angle.cos());
    let length = (bw * angle.sin()).abs() + (bh * angle.cos()).abs();
    let (cx, cy) = (x0 + bw / 2.0, y0 + bh / 2.0);
    let base = [(x0, y0), (x0 + bw, y0), (x0 + bw, y0 + bh), (x0, y0 + bh)];
    let rgb = if broadcast {
        style.colors.broadcast_accent.0
    } else {
        flag_rgb(style, flag)
    };
    if broadcast {
        window.paint_quad(fill(
            rect(x0, y0, bw, bh),
            linear_gradient(
                110.0,
                linear_color_stop(col(rgb, 0.0), 0.55),
                linear_color_stop(col(rgb, 0.16), 1.0),
            ),
        ));
    }
    // t = ((p - centro) . dir) / L + 0.5  =>  p . dir = (t - 0.5) L + centro . dir
    let centre = cx * dx + cy * dy;
    let bands = if broadcast {
        [(0.34f32, 0.48f32, 0.30f32), (0.57, 0.76, 0.23)]
    } else {
        [(0.37f32, 0.54f32, 0.28f32), (0.62, 0.79, 0.17)]
    };
    for (from, to, alpha) in bands {
        let low = (from - 0.5) * length + centre;
        let high = (to - 0.5) * length + centre;
        let poly = clip_half_plane(&base, dx, dy, low);
        let poly = clip_half_plane(&poly, -dx, -dy, -high);
        paint_polygon(window, &poly, col(rgb, alpha));
    }
}

// ---------------------------------------------------------------------------
// Texto de celdas
// ---------------------------------------------------------------------------

/// Coloca un texto de una linea `line_height` dentro de una caja alineada en
/// horizontal; devuelve el x del borde izquierdo del texto.
fn aligned_x(align: Align, left: f32, width: f32, text_width: f32) -> f32 {
    match align {
        Align::Left => left,
        Align::Center => left + (width - text_width) / 2.0,
        Align::Right => left + width - text_width,
    }
}

// ---------------------------------------------------------------------------
// Escena
// ---------------------------------------------------------------------------

pub fn paint(scene: &Scene, window: &mut Window, cx: &mut App) {
    let style = &*scene.config.style;
    let Scene {
        config, vm, plan, ..
    } = scene;
    let labels = model::labels(scene.language);
    let width = config.width;
    let height = scene.height;
    // Sombra exterior (`0 14px 25px -12px rgb(0 0 0/48%)`): solo se ve en el hueco
    // derecho del rail. El culling de GPUI descarta las sombras con mascara fuera
    // de su rectangulo y bajo el panel translucido sumaria alfa, asi que se pinta
    // la cola gaussiana ya calculada como imagen (ver `shadow_strip`).
    if plan.pit_enabled {
        paint_shadow_strip(style, window, cx, width, height);
    }

    // Panel: fondo + degradado de 120 grados (solo el primer tramo, el resto
    // suma menos de 1 % de blanco).
    let panel = rect(0.0, 0.0, width, height);
    window.paint_quad(quad(
        panel,
        Corners::all(px(style.geometry.radius)),
        col(style.colors.panel.0, style.opacity.panel),
        Edges::all(px(0.0)),
        transparent(),
        BorderStyle::default(),
    ));
    window.paint_quad(quad(
        panel,
        Corners::all(px(style.geometry.radius)),
        linear_gradient(
            120.0,
            linear_color_stop(col(style.colors.white.0, 0.03), 0.0),
            linear_color_stop(col(style.colors.white.0, 0.0), 0.38),
        ),
        Edges::all(px(0.0)),
        transparent(),
        BorderStyle::default(),
    ));
    if plan.brand_band > 0.0 {
        paint_rect(
            window,
            0.0,
            0.0,
            width,
            style.geometry.brand_band_height,
            col(style.colors.black.0, 0.10),
        );
        paint_rect(
            window,
            0.0,
            style.geometry.brand_band_height - 1.0,
            width,
            1.0,
            col(style.colors.ink.0, 0.10),
        );
        paint_logo_size(window, cx, 10.0, 2.0, style.geometry.brand_logo_size);
        let brand = style.ink(
            style.fonts.brand_size,
            style.fonts.bold_weight,
            0.075,
            col(style.colors.ink.0, 1.0),
        );
        text::draw(window, cx, "VANTARE", 34.0, 15.0, &brand);
    }
    if plan.has_header {
        paint_flag_ribbon(style, window, vm.flag.as_ref(), width, config.broadcast);
    }

    if matches!(vm.status, Status::Ready | Status::Stale) && !vm.rows.is_empty() {
        paint_table(scene, &labels, window, cx);
    } else {
        paint_unavailable(scene, &labels, window, cx);
    }
    paint_footer(scene, &labels, window, cx);

    // Marco interior (::after): 1 px blanco 12 %, arriba 24 %.
    window.paint_quad(quad(
        panel,
        Corners::all(px(style.geometry.radius)),
        transparent(),
        Edges::all(px(1.0)),
        col(style.colors.white.0, style.opacity.frame),
        BorderStyle::default(),
    ));
    window.paint_quad(quad(
        rect(0.0, 0.0, width, style.geometry.radius),
        Corners {
            top_left: px(style.geometry.radius),
            top_right: px(style.geometry.radius),
            bottom_right: px(0.0),
            bottom_left: px(0.0),
        },
        transparent(),
        Edges {
            top: px(1.0),
            right: px(0.0),
            bottom: px(0.0),
            left: px(0.0),
        },
        col(style.colors.white.0, style.opacity.top_frame),
        BorderStyle::default(),
    ));

    if plan.pit_enabled {
        paint_pit_rail(scene, window, cx);
    }
}

fn paint_table(scene: &Scene, labels: &Labels, window: &mut Window, cx: &mut App) {
    let style = &*scene.config.style;
    let Scene {
        config, vm, plan, ..
    } = scene;
    let width = config.width;
    if plan.loose_header > 0.0 {
        paint_session_header(scene, labels, 0.0, plan.brand_band, window, cx);
    }
    // Fila de cabecera (thead).
    let head_top = plan.table_top;
    let integrated = !config.broadcast && plan.identity_span > 0 && !plan.external_header;
    let head_height = plan.head_row;
    // Fondo y borde de cada th.
    let mut x = 0.0;
    let mut th = Vec::new();
    let mut index = 0;
    while index < plan.columns.len() {
        if integrated && index == 0 {
            let span_w: f32 = plan.widths[..plan.identity_span].iter().sum();
            th.push((0, plan.identity_span, x, span_w));
            x += span_w;
            index = plan.identity_span;
            continue;
        }
        th.push((index, 1, x, plan.widths[index]));
        x += plan.widths[index];
        index += 1;
    }
    for &(_, _, tx, tw) in &th {
        window.paint_quad(fill(
            rect(tx, head_top, tw, head_height),
            linear_gradient(
                180.0,
                linear_color_stop(col(style.colors.white.0, 0.02), 0.0),
                linear_color_stop(col(style.colors.white.0, 0.0), 1.0),
            ),
        ));
        paint_rect(
            window,
            tx,
            head_top + head_height - 1.0,
            tw,
            1.0,
            col(style.colors.ink.0, 0.10),
        );
    }
    for &(first, span, tx, tw) in &th {
        if integrated && first == 0 && span == plan.identity_span {
            if plan.has_header {
                paint_session_header(scene, labels, tx, head_top, window, cx);
            } else {
                let font = style.ink(
                    style.fonts.column_label_size,
                    style.fonts.semibold_weight,
                    0.025,
                    col(style.colors.muted.0, 1.0),
                );
                text::draw(
                    window,
                    cx,
                    labels.driver_name,
                    tx + 8.0,
                    head_top + 18.0,
                    &font,
                );
            }
            continue;
        }
        let column = plan.columns[first];
        paint_column_label(
            scene,
            labels,
            column,
            tx,
            tw,
            head_top,
            head_height,
            window,
            cx,
        );
    }

    // Bandas del modo multiclase, fuera de las filas de pilotos.
    let body_top = head_top + head_height;
    for (top, class) in &plan.class_bands {
        let y = body_top + top;
        let id = class.trim().to_uppercase();
        let color = if id.contains("HYPER") || ["HYP", "DP"].contains(&id.as_str()) {
            style.colors.hypercar.0
        } else if id.contains("LMP") || id == "P2" {
            style.colors.lmp.0
        } else if id.contains("GTE") || id.contains("GT3") {
            style.colors.gold.0
        } else {
            style.colors.muted.0
        };
        let alpha = if color == style.colors.muted.0 {
            0.05
        } else {
            0.11
        };
        window.paint_quad(fill(
            rect(0.0, y, width, style.geometry.class_band_height),
            linear_gradient(
                180.0,
                linear_color_stop(col(color, alpha), 0.0),
                linear_color_stop(col(color, 0.0), 1.0),
            ),
        ));
        paint_rect(window, 0.0, y, width, 1.0, col(style.colors.ink.0, 0.10));
        paint_rect(
            window,
            0.0,
            y + (style.geometry.class_band_height - 1.0),
            width,
            1.0,
            col(style.colors.ink.0, 0.10),
        );
        paint_rect(window, 10.0, y + 7.0, 2.0, 14.0, col(color, 1.0));
        let font = style.ink(
            style.fonts.badge_size,
            style.fonts.bold_weight,
            0.14,
            col(color, 1.0),
        );
        text::draw(window, cx, &id, 20.0, y + 18.0, &font);
    }
    for ghost in &scene.frame.ghosts {
        // Los fantasmas guardan el top relativo al cuerpo de la tabla.
        paint_row(
            scene,
            &ghost.row,
            body_top + ghost.top * style.geometry.row_height / model::ROW_HEIGHT,
            &ghost.vis,
            true,
            body_top,
            window,
            cx,
        );
    }
    for (index, row) in vm.rows.iter().take(plan.visible_rows).enumerate() {
        let vis = scene.frame.row(&row.id);
        let last = index + 1 == plan.visible_rows;
        let top = body_top + plan.row_tops[index];
        paint_row(scene, row, top, &vis, last, body_top, window, cx);
    }
    let _ = width;
}

fn paint_session_header(
    scene: &Scene,
    labels: &Labels,
    left: f32,
    top: f32,
    window: &mut Window,
    cx: &mut App,
) {
    let style = &*scene.config.style;
    let Scene { vm, plan, .. } = scene;
    let mut x = left + 10.0;
    let mid = top
        + if scene.config.broadcast {
            style.geometry.broadcast_header_height
        } else {
            style.geometry.session_header_height
        } / 2.0;
    if plan.brand_visible {
        paint_logo_size(
            window,
            cx,
            x,
            mid - style.geometry.logo_size / 2.0,
            style.geometry.logo_size,
        );
        let brand = style.ink(
            style.fonts.brand_size,
            style.fonts.bold_weight,
            0.075,
            col(style.colors.ink.0, 1.0),
        );
        let base = text::baseline(
            mid - style.fonts.brand_size / 2.0,
            style.fonts.brand_size,
            style.fonts.brand_size,
        )
        .round();
        text::draw(
            window,
            cx,
            "VANTARE",
            x + style.geometry.logo_size + 6.0,
            base,
            &brand,
        );
        x += style.geometry.logo_size + 6.0 + text::width(window, "VANTARE", &brand) + 8.0;
    }
    // Contexto de sesion: filete + tipo (7px) + reloj (15px).
    let session_label = if vm.status == Status::Stale {
        labels.stale.to_string()
    } else {
        vm.session_label.clone()
    };
    let type_ink = style.ink(
        style.fonts.session_label_size,
        style.fonts.semibold_weight,
        0.16,
        if vm.status == Status::Stale {
            col(style.colors.gold.0, 1.0)
        } else {
            col(style.colors.session.0, 1.0)
        },
    );
    let clock_ink = style.ink(
        style.fonts.clock_size,
        style.fonts.metric_weight,
        -0.025,
        col(
            if vm.status == Status::Stale {
                style.colors.muted.0
            } else {
                style.colors.ink.0
            },
            1.0,
        ),
    );
    if plan.brand_visible {
        let type_text = text::fit(window, &session_label, &type_ink, 68.0);
        let clock_w = text::width(window, &vm.remaining_text, &clock_ink);
        let type_w = text::width(window, &type_text, &type_ink);
        let context_w = 10.0 + type_w.max(clock_w);
        let context_h =
            style.fonts.session_label_size + 4.0 + text::css_normal_line(style.fonts.clock_size);
        let context_top = mid - context_h / 2.0;
        paint_rect(
            window,
            x,
            context_top,
            1.0,
            context_h,
            col(style.colors.ink.0, 0.23),
        );
        let text_x = x + 1.0 + 10.0;
        text::draw(
            window,
            cx,
            &type_text,
            text_x,
            text::baseline(
                context_top,
                style.fonts.session_label_size,
                style.fonts.session_label_size,
            )
            .round(),
            &type_ink,
        );
        let clock_top = context_top + style.fonts.session_label_size + 4.0;
        text::draw(
            window,
            cx,
            &vm.remaining_text,
            text_x,
            text::baseline(
                clock_top,
                text::css_normal_line(style.fonts.clock_size),
                style.fonts.clock_size,
            )
            .round(),
            &clock_ink,
        );
        x += 1.0 + context_w + 8.0;
    } else {
        let kind = style.ink(
            style.fonts.footer_value_size,
            style.fonts.semibold_weight,
            0.09,
            type_ink.color,
        );
        let clock = style.ink(
            style.fonts.plain_clock_size,
            style.fonts.bold_weight,
            -0.025,
            clock_ink.color,
        );
        let line = text::css_normal_line(style.fonts.plain_clock_size);
        let base = text::baseline(mid - line / 2.0, line, style.fonts.plain_clock_size).round();
        text::draw(window, cx, &session_label, x, base, &kind);
        x += text::width(window, &session_label, &kind) + 7.0;
        text::draw(window, cx, &vm.remaining_text, x, base, &clock);
        x += text::width(window, &vm.remaining_text, &clock) + 8.0;
    }
    // Chip de clase.
    let class_text: String = vm
        .active_class
        .chars()
        .take(3)
        .collect::<String>()
        .to_uppercase();
    let class_ink = style.ink(
        style.fonts.badge_size,
        style.fonts.bold_weight,
        0.02,
        col(style.colors.white.0, 1.0),
    );
    let chip_text_w = text::width(window, &class_text, &class_ink);
    let chip_w = chip_text_w + 12.0;
    let chip_h = 5.0 + text::css_normal_line(style.fonts.badge_size) + 5.0;
    let chip_top = mid - chip_h / 2.0;
    window.paint_quad(quad(
        rect(x, chip_top, chip_w, chip_h),
        Corners {
            top_left: px(style.geometry.chip_radius),
            top_right: px(style.geometry.chip_cut_radius),
            bottom_right: px(style.geometry.chip_radius),
            bottom_left: px(style.geometry.chip_radius),
        },
        linear_gradient(
            145.0,
            linear_color_stop(col(style.colors.class_start.0, 1.0), 0.0),
            linear_color_stop(col(style.colors.class_end.0, 1.0), 1.0),
        ),
        Edges::all(px(0.0)),
        transparent(),
        BorderStyle::default(),
    ));
    text::draw(
        window,
        cx,
        &class_text,
        x + 6.0,
        text::baseline(
            chip_top + 5.0,
            text::css_normal_line(style.fonts.badge_size),
            style.fonts.badge_size,
        )
        .round(),
        &class_ink,
    );
}

/// El logo de produccion es 128 x 128 y se pinta a 24 x 24: Chrome lo reduce con
/// filtrado suave. GPUI muestrea la textura sin promediar, asi que se reduce
/// antes por area (alfa premultiplicado) y se pinta 1:1.
fn logo_24() -> Option<Vec<u8>> {
    let decoder = png::Decoder::new(std::io::Cursor::new(LOGO));
    let mut reader = decoder.read_info().ok()?;
    let mut buffer = vec![0u8; reader.output_buffer_size()?];
    let info = reader.next_frame(&mut buffer).ok()?;
    if info.color_type != png::ColorType::Rgba || info.bit_depth != png::BitDepth::Eight {
        return None;
    }
    let (sw, sh) = (info.width as usize, info.height as usize);
    let scale = sw as f32 / 24.0;
    let mut out = Vec::with_capacity(24 * 24 * 4);
    for oy in 0..24usize {
        for ox in 0..24usize {
            let (x0, x1) = (ox as f32 * scale, (ox + 1) as f32 * scale);
            let (y0, y1) = (oy as f32 * scale, (oy + 1) as f32 * scale);
            let (mut r, mut g, mut b, mut a, mut total) = (0.0f32, 0.0f32, 0.0f32, 0.0f32, 0.0f32);
            for sy in y0.floor() as usize..(y1.ceil() as usize).min(sh) {
                let wy = (y1.min(sy as f32 + 1.0) - y0.max(sy as f32)).max(0.0);
                for sx in x0.floor() as usize..(x1.ceil() as usize).min(sw) {
                    let wx = (x1.min(sx as f32 + 1.0) - x0.max(sx as f32)).max(0.0);
                    let weight = wx * wy;
                    let p = &buffer[(sy * sw + sx) * 4..][..4];
                    let alpha = f32::from(p[3]) / 255.0;
                    r += f32::from(p[0]) * alpha * weight;
                    g += f32::from(p[1]) * alpha * weight;
                    b += f32::from(p[2]) * alpha * weight;
                    a += alpha * weight;
                    total += weight;
                }
            }
            let alpha = a / total.max(f32::EPSILON);
            let straight = |c: f32| {
                if a > 0.0 {
                    (c / a).round().clamp(0.0, 255.0) as u8
                } else {
                    0
                }
            };
            out.extend_from_slice(&[
                straight(r),
                straight(g),
                straight(b),
                (alpha * 255.0).round() as u8,
            ]);
        }
    }
    let mut encoded = Vec::new();
    {
        let mut encoder = png::Encoder::new(&mut encoded, 24, 24);
        encoder.set_color(png::ColorType::Rgba);
        encoder.set_depth(png::BitDepth::Eight);
        encoder.write_header().ok()?.write_image_data(&out).ok()?;
    }
    Some(encoded)
}

fn paint_logo_size(window: &mut Window, cx: &mut App, x: f32, y: f32, size: f32) {
    static IMAGE: OnceLock<Option<Arc<gpui::RenderImage>>> = OnceLock::new();
    let image = IMAGE.get_or_init(|| {
        gpui::Image::from_bytes(gpui::ImageFormat::Png, logo_24()?)
            .to_image_data(cx.svg_renderer())
            .ok()
    });
    if let Some(image) = image {
        let bounds = rect(x, y, size, size);
        let _ = window.paint_image(
            bounds,
            bounds,
            Corners::all(px(0.0)),
            image.clone(),
            0,
            false,
        );
    }
}

#[allow(clippy::too_many_arguments)]
fn paint_column_label(
    scene: &Scene,
    labels: &Labels,
    column: model::Column,
    tx: f32,
    tw: f32,
    head_top: f32,
    head_height: f32,
    window: &mut Window,
    cx: &mut App,
) {
    let style = &*scene.config.style;
    let vm = &scene.vm;
    let label = labels.metric(column.metric, vm.pace_session);
    if scene.config.broadcast {
        paint_rect(window, tx, head_top, tw, head_height, col(0, 0.13));
        let font = style.ink(
            style.fonts.column_label_size,
            style.fonts.semibold_weight,
            0.025,
            col(style.colors.column_label.0, 1.0),
        );
        let align = match column.metric {
            Metric::Position | Metric::DriverNumber | Metric::Gap => Align::Center,
            Metric::DriverName => Align::Left,
            _ => Align::Right,
        };
        let pad = if column.metric == Metric::DriverName {
            style.geometry.broadcast_name_padding
        } else {
            style.geometry.cell_padding
        };
        let x = aligned_x(
            align,
            tx + pad,
            tw - pad - style.geometry.cell_padding,
            text::width(window, label, &font),
        );
        let line = text::css_normal_line(style.fonts.column_label_size);
        text::draw(
            window,
            cx,
            label,
            x,
            text::baseline(
                head_top + (head_height - line) / 2.0,
                line,
                style.fonts.column_label_size,
            )
            .round(),
            &font,
        );
        return;
    }
    let color = if vm.pace_session && column.metric == Metric::BestLap {
        col(style.colors.ink.0, 1.0)
    } else {
        col(style.colors.column_label.0, 1.0)
    };
    let label_ink = style.ink(
        style.fonts.column_label_size,
        style.fonts.semibold_weight,
        0.14,
        color,
    );
    let label_w = text::width(window, label, &label_ink);
    let align = match column.metric {
        Metric::Gap => Align::Center,
        Metric::DriverName => Align::Left,
        _ => column.align.unwrap_or(Align::Right),
    };
    let content_h = head_height - 1.0;
    let label_h = text::css_normal_line(style.fonts.column_label_size) + 4.0;
    let label_top = (content_h - label_h) / 2.0 + 2.0 + head_top;
    let inner = tw - (2.0 * style.geometry.cell_padding);
    let lx = aligned_x(align, tx + style.geometry.cell_padding, inner, label_w);
    // th con overflow hidden y elipsis: aqui basta recortar por el th.
    window.with_content_mask(
        Some(ContentMask {
            bounds: rect(tx, head_top, tw, head_height),
        }),
        |window| {
            text::draw(
                window,
                cx,
                label,
                lx,
                text::baseline(
                    label_top,
                    text::css_normal_line(style.fonts.column_label_size),
                    style.fonts.column_label_size,
                )
                .round(),
                &label_ink,
            );
            // Subrayado de 17 x 1 (centrado bajo la etiqueta en gap).
            let ux = if column.metric == Metric::Gap {
                lx + label_w / 2.0 - 8.5
            } else {
                lx
            };
            paint_rect(
                window,
                ux,
                label_top + label_h - 1.0,
                17.0,
                1.0,
                col(style.colors.ink.0, 0.35),
            );
        },
    );
}

#[allow(clippy::too_many_arguments)]
fn paint_row(
    scene: &Scene,
    row: &Row,
    top: f32,
    vis: &RowVis,
    last: bool,
    _body_top: f32,
    window: &mut Window,
    cx: &mut App,
) {
    let style = &*scene.config.style;
    let Scene {
        config, vm, plan, ..
    } = scene;
    let top = top + vis.dy * style.geometry.row_height / model::ROW_HEIGHT;
    let width = config.width;
    let pace = vm.pace_session;
    let opacity = vis.alpha;
    let paint = |window: &mut Window, cx: &mut App| {
        // Fondo de fila (jugador) y flash de subida/bajada.
        if row.is_player {
            if config.broadcast {
                window.paint_quad(quad(
                    rect(0.0, top, width, style.geometry.row_height),
                    Corners::all(px(style.geometry.radius)),
                    col(style.colors.player.0, style.opacity.broadcast_player),
                    Edges::all(px(0.0)),
                    transparent(),
                    BorderStyle::default(),
                ));
            } else {
                paint_rect(
                    window,
                    0.0,
                    top,
                    width,
                    style.geometry.row_height,
                    col(style.colors.player.0, style.opacity.player),
                );
            }
            window.paint_quad(fill(
                rect(0.0, top, width, style.geometry.row_height),
                linear_gradient(
                    180.0,
                    linear_color_stop(col(style.colors.white.0, 0.04), 0.0),
                    linear_color_stop(col(style.colors.white.0, 0.0), 0.6),
                ),
            ));
        }
        if vis.flash > 0.0 {
            let base = if vis.flash_up {
                style.colors.gain.0
            } else {
                style.colors.loss.0
            };
            paint_rect(
                window,
                0.0,
                top,
                width,
                style.geometry.row_height,
                col(base, 0.12 * vis.flash),
            );
        }
        // Separadores (inset box-shadow). `tr:last-child td { box-shadow: none }`
        // gana al resalte del jugador: la ultima fila no lleva ninguno.
        if !last {
            if row.is_player {
                paint_rect(
                    window,
                    0.0,
                    top,
                    width,
                    1.0,
                    col(style.colors.white.0, 0.13),
                );
                paint_rect(
                    window,
                    0.0,
                    top + style.geometry.row_height - 1.0,
                    width,
                    1.0,
                    col(style.colors.white.0, 0.08),
                );
            } else {
                paint_rect(
                    window,
                    0.0,
                    top + style.geometry.row_height - 1.0,
                    width,
                    1.0,
                    col(style.colors.ink.0, 0.10),
                );
            }
        }
        // Celdas.
        let mut x = 0.0;
        for (index, column) in plan.columns.iter().enumerate() {
            let cw = plan.widths[index];
            paint_cell(scene, row, *column, x, cw, top, vis, pace, window, cx);
            x += cw;
        }
        if row.is_player && !config.broadcast {
            // Barra roja de 2 x 20 en la primera celda.
            paint_rect(
                window,
                3.0,
                top + (style.geometry.row_height - style.geometry.player_marker_height) / 2.0,
                style.geometry.player_marker_width,
                style.geometry.player_marker_height,
                col(style.colors.player_marker.0, 1.0),
            );
        }
    };
    if opacity < 0.999 {
        with_opacity(opacity.max(0.0), || paint(window, cx));
    } else {
        paint(window, cx);
    }
}

#[allow(clippy::too_many_arguments)]
fn paint_cell(
    scene: &Scene,
    row: &Row,
    column: model::Column,
    x: f32,
    cw: f32,
    top: f32,
    vis: &RowVis,
    pace: bool,
    window: &mut Window,
    cx: &mut App,
) {
    let style = &*scene.config.style;
    let vm = &scene.vm;
    let line = |size: f32| text::css_normal_line(size);
    // td: contenido centrado en vertical dentro de 30 px.
    let base_for = |size: f32| {
        text::baseline(
            top + (style.geometry.row_height - line(size)) / 2.0,
            line(size),
            size,
        )
        .round()
    };
    let is_best = vm
        .session_best
        .as_ref()
        .is_some_and(|(id, _)| *id == row.id);
    match column.metric {
        Metric::Position => {
            let value = if row.position > 0 {
                row.position.to_string()
            } else {
                "—".into()
            };
            let color = if row.is_player {
                col(style.colors.white.0, 1.0)
            } else {
                col(style.colors.position.0, 1.0)
            };
            let i = style.ink(
                style.fonts.body_size,
                style.fonts.semibold_weight,
                -0.02,
                color,
            );
            let w = text::width(window, &value, &i);
            let tx = aligned_x(
                column.align.unwrap_or(Align::Center),
                x + style.geometry.position_padding,
                cw - style.geometry.cell_padding,
                w,
            );
            text::draw(window, cx, &value, tx, base_for(style.fonts.body_size), &i);
        }
        Metric::DriverNumber => {
            let i = style.ink(
                style.fonts.number_size,
                style.fonts.semibold_weight,
                -0.025,
                col(style.colors.number.0, 1.0),
            );
            let w = text::width(window, &row.driver_number, &i);
            let tx = aligned_x(
                column.align.unwrap_or(Align::Center),
                x + style.geometry.cell_padding,
                cw - (2.0 * style.geometry.cell_padding),
                w,
            );
            text::draw(
                window,
                cx,
                &row.driver_number,
                tx,
                base_for(style.fonts.number_size),
                &i,
            );
        }
        Metric::DriverName => {
            let i = style.ink(
                style.fonts.body_size,
                style.fonts.bold_weight,
                -0.025,
                col(style.colors.ink.0, 1.0),
            );
            let name = vantare_domain::standings::driver_name(
                &row.driver_name,
                column.name_mode.as_str(),
                column.max_chars,
            )
            .to_uppercase();
            let pad = if scene.config.broadcast {
                style.geometry.broadcast_name_padding
            } else {
                style.geometry.cell_padding
            };
            let avail = cw - pad - style.geometry.cell_padding - 19.0 - 7.0;
            let shown = text::fit(window, &name, &i, avail);
            let name_x = aligned_x(
                column.align.unwrap_or(Align::Left),
                x + pad,
                avail,
                text::width(window, &shown, &i),
            );
            text::draw(
                window,
                cx,
                &shown,
                name_x,
                base_for(style.fonts.body_size),
                &i,
            );
            // Chip de cambio de posicion (+n / -n).
            if let Some((chip, alpha)) = &vis.chip {
                let ci = style.ink(
                    style.fonts.badge_size,
                    style.fonts.bold_weight,
                    -0.039,
                    col(style.colors.ink.0, *alpha),
                );
                let w = text::width(window, chip, &ci);
                let cx0 = x + style.geometry.cell_padding + avail + 7.0 + 19.0 - w;
                text::draw(window, cx, chip, cx0, base_for(style.fonts.badge_size), &ci);
            }
            if vis.battle > 0.0 {
                let bx = x + style.geometry.cell_padding;
                let bw = cw - (2.0 * style.geometry.cell_padding);
                window.paint_quad(fill(
                    rect(bx, top + style.geometry.row_height - 3.0, bw, 2.0),
                    linear_gradient(
                        90.0,
                        linear_color_stop(col(style.colors.gold.0, 0.55 * vis.battle), 0.0),
                        linear_color_stop(col(style.colors.gold.0, 0.10 * vis.battle), 0.8),
                    ),
                ));
            }
        }
        Metric::Gap => {
            let value = row.gap_text.clone();
            let (weight, color) = if pace {
                (style.fonts.medium_weight, col(style.colors.pace_gap.0, 1.0))
            } else {
                (style.fonts.metric_weight, col(style.colors.ink.0, 1.0))
            };
            let i = style.ink(style.fonts.body_size, weight, -0.025, color);
            if let Some((number, unit)) = split_seconds(&value) {
                let unit_ink = style.ink(
                    style.fonts.badge_size,
                    style.fonts.medium_weight,
                    0.0,
                    col(style.colors.unit.0, 1.0),
                );
                let nw = text::width(window, number, &i);
                let uw = text::width(window, unit, &unit_ink);
                let total = nw + 2.0 + uw;
                let tx = aligned_x(
                    Align::Center,
                    x + style.geometry.cell_padding,
                    cw - (2.0 * style.geometry.cell_padding),
                    total,
                );
                let base = base_for(style.fonts.body_size);
                text::draw(window, cx, number, tx, base, &i);
                text::draw(window, cx, unit, tx + nw + 2.0, base, &unit_ink);
            } else {
                let w = text::width(window, &value, &i);
                let tx = aligned_x(
                    Align::Center,
                    x + style.geometry.cell_padding,
                    cw - (2.0 * style.geometry.cell_padding),
                    w,
                );
                text::draw(window, cx, &value, tx, base_for(style.fonts.body_size), &i);
            }
        }
        Metric::BestLap
        | Metric::LastLap
        | Metric::CurrentLap
        | Metric::Interval
        | Metric::VehicleClass => {
            let (value, is_lap) = match column.metric {
                Metric::BestLap => (row.best_lap_text.clone(), true),
                Metric::LastLap => (row.last_lap_text.clone(), true),
                Metric::CurrentLap => (row.current_lap_text.clone(), false),
                Metric::Interval => (row.interval_text.clone(), false),
                _ => (row.vehicle_class.clone(), false),
            };
            let (weight, color) = if is_lap && pace && column.metric == Metric::BestLap {
                (style.fonts.metric_weight, col(style.colors.ink.0, 1.0))
            } else if is_lap {
                (style.fonts.semibold_weight, col(style.colors.lap.0, 1.0))
            } else {
                (style.fonts.metric_weight, col(style.colors.ink.0, 1.0))
            };
            let color = if column.metric == Metric::BestLap && is_best {
                col(style.colors.best_lap.0, 1.0)
            } else {
                color
            };
            let i = style.ink(style.fonts.body_size, weight, -0.025, color);
            let w = text::width(window, &value, &i);
            let align = column
                .align
                .unwrap_or(if column.metric == Metric::VehicleClass {
                    Align::Center
                } else {
                    Align::Right
                });
            let pad = if scene.config.broadcast && is_lap {
                11.0
            } else {
                style.geometry.cell_padding
            };
            let tx = aligned_x(align, x + pad, cw - 2.0 * pad, w);
            if column.metric == Metric::BestLap {
                // Barrido de mejora de vuelta bajo el texto y rombo de mejor de sesion.
                if let Some((session, alpha, frac)) = vis.sweep {
                    let base = if session {
                        col(style.colors.best_sweep.0, 0.45)
                    } else {
                        col(style.colors.gain.0, 0.35)
                    };
                    paint_sweep(style, window, x, cw, top, base, alpha, frac);
                }
            }
            if scene.config.broadcast && is_lap {
                window.paint_quad(quad(
                    rect(x + 6.0, top + 2.0, cw - 12.0, 26.0),
                    Corners::all(px(style.geometry.radius)),
                    linear_gradient(
                        145.0,
                        linear_color_stop(col(style.colors.white.0, 0.09), 0.0),
                        linear_color_stop(col(style.colors.white.0, 0.03), 0.65),
                    ),
                    Edges::all(px(0.0)),
                    transparent(),
                    BorderStyle::default(),
                ));
            }
            text::draw(window, cx, &value, tx, base_for(style.fonts.body_size), &i);
            if column.metric == Metric::BestLap && vis.best_marker > 0.0 {
                let mi = style.ink(
                    style.fonts.marker_size,
                    style.fonts.regular_weight,
                    0.0,
                    col(style.colors.best_marker.0, vis.best_marker),
                );
                let mw = text::width(window, "◆", &mi);
                text::draw(
                    window,
                    cx,
                    "◆",
                    x + cw - 3.0 - mw,
                    top + 3.0 + text::css_ascent(style.fonts.marker_size),
                    &mi,
                );
            }
        }
        Metric::Pit => {}
    }
}

/// `^([+-]?\d+(?:\.\d+)?)(s)$` -> (numero, "s").
fn split_seconds(value: &str) -> Option<(&str, &str)> {
    let body = value.strip_suffix('s')?;
    let digits = body.strip_prefix(['+', '-']).unwrap_or(body);
    let mut parts = digits.splitn(2, '.');
    let int = parts.next()?;
    let frac = parts.next();
    let ok = !int.is_empty()
        && int.bytes().all(|b| b.is_ascii_digit())
        && frac.is_none_or(|f| !f.is_empty() && f.bytes().all(|b| b.is_ascii_digit()));
    ok.then_some((body, "s"))
}

fn paint_sweep(
    style: &Style,
    window: &mut Window,
    x: f32,
    cw: f32,
    top: f32,
    base: Hsla,
    alpha: f32,
    frac: f32,
) {
    // El barrido ocupa toda la celda (inset 1px 0) y se desplaza frac * ancho.
    let (y, h) = (top + 1.0, style.geometry.row_height - 2.0);
    window.with_content_mask(
        Some(ContentMask {
            bounds: rect(x, y, cw, h),
        }),
        |window| {
            window.paint_quad(fill(
                rect(x + frac * cw, y, cw, h),
                linear_gradient(
                    100.0,
                    linear_color_stop(Hsla { a: 0.0, ..base }, 0.0),
                    linear_color_stop(
                        Hsla {
                            a: base.a * alpha,
                            ..base
                        },
                        0.5,
                    ),
                ),
            ));
            window.paint_quad(fill(
                rect(x + frac * cw + cw / 2.0, y, cw / 2.0, h),
                linear_gradient(
                    100.0,
                    linear_color_stop(
                        Hsla {
                            a: base.a * alpha,
                            ..base
                        },
                        0.0,
                    ),
                    linear_color_stop(Hsla { a: 0.0, ..base }, 1.0),
                ),
            ));
        },
    );
}

fn paint_footer(scene: &Scene, labels: &Labels, window: &mut Window, cx: &mut App) {
    let style = &*scene.config.style;
    let Scene { config, vm, .. } = scene;
    if !config.show_session_footer {
        return;
    }
    let width = config.width;
    let height = scene.height;
    if !config.footer_slots.is_empty()
        || config
            .footer_ids
            .iter()
            .any(|id| !["none", "track", "estimatedLaps"].contains(&id.as_str()))
    {
        paint_styled_info_cells(
            &config.style,
            &vm.footer_cells,
            width,
            height,
            config.footer_height(),
            !config.footer_slots.is_empty(),
            1.0,
            width,
            window,
            cx,
        );
        return;
    }
    // El flex del producto deja el pie en 342,06 (0,94 px solapado con la tabla).
    let top = height - (style.geometry.footer_height - 0.06);
    paint_rect(
        window,
        0.0,
        top,
        width,
        style.geometry.footer_height - 0.06,
        col(style.colors.black.0, style.opacity.footer),
    );
    paint_rect(window, 0.0, top, width, 1.0, col(style.colors.ink.0, 0.10));
    let label_ink = style.ink(
        style.fonts.session_label_size,
        style.fonts.semibold_weight,
        0.055,
        col(style.colors.footer_label.0, 1.0),
    );
    let value_ink = style.ink(
        style.fonts.footer_value_size,
        style.fonts.semibold_weight,
        -0.015,
        col(style.colors.footer_value.0, 1.0),
    );
    let mut items = Vec::new();
    for metric in [config.footer_first, config.footer_second] {
        if metric == model::InfoMetric::None {
            continue;
        }
        let label = labels.info(metric).to_string();
        let value = if matches!(vm.status, Status::Ready | Status::Stale) {
            vm.info(metric).to_string()
        } else {
            "—".into()
        };
        let lw = text::width(window, &label, &label_ink);
        let vw = text::width(window, &value, &value_ink);
        items.push((label, value, lw, vw));
    }
    let total: f32 = items
        .iter()
        .map(|(_, _, lw, vw)| lw + style.geometry.footer_pair_gap + vw)
        .sum::<f32>()
        + style.geometry.footer_gap * items.len().saturating_sub(1) as f32;
    let mut x = 10.0 + (width - 20.0 - total) / 2.0;
    let info_top = top + 1.0 + ((style.geometry.footer_height - 1.06) - 12.0) / 2.0;
    let base = (info_top + 10.0).round();
    for (label, value, lw, _) in &items {
        text::draw(window, cx, label, x, base, &label_ink);
        text::draw(
            window,
            cx,
            value,
            x + lw + style.geometry.footer_pair_gap,
            base,
            &value_ink,
        );
        x += lw
            + style.geometry.footer_pair_gap
            + text::width(window, value, &value_ink)
            + style.geometry.footer_gap;
    }
}

/// El mismo pie recibe celdas puras; no lee señales ni persistencia al pintar.
fn paint_styled_info_cells(
    style: &Style,
    cells: &[vantare_domain::standings::InfoCell],
    width: f32,
    height: f32,
    reserve: f32,
    slots: bool,
    unit: f32,
    layout_width: f32,
    window: &mut Window,
    cx: &mut App,
) {
    let estimated = cells
        .iter()
        .map(|cell| {
            cell.label.chars().count() as f32 * 5.5 + cell.value.chars().count() as f32 * 7.5 + 12.0
        })
        .sum::<f32>()
        + 14.0 * cells.len().saturating_sub(1) as f32;
    let factor = if slots && cells.len() <= 5 {
        ((layout_width - 24.0).max(80.0) * 0.97 / estimated.max(1.0)).min(1.0)
    } else {
        1.0
    };
    let label_size = if slots {
        (width / unit * 0.02).clamp(7.0, 9.0)
    } else {
        style.fonts.session_label_size
    } * factor
        * unit;
    let value_size = if slots {
        (width / unit * 0.029).clamp(9.0, 11.0)
    } else {
        style.fonts.footer_value_size
    } * factor
        * unit;
    let pair_gap = if slots {
        6.0
    } else {
        style.geometry.footer_pair_gap
    } * unit;
    let gap = if slots {
        14.0
    } else {
        style.geometry.footer_gap
    } * unit;
    let mut lines: Vec<Vec<(&vantare_domain::standings::InfoCell, f32)>> = vec![Vec::new()];
    let mut used = 0.0;
    for cell in cells {
        let w = text::width(
            window,
            &cell.label,
            &style.ink(
                label_size,
                style.fonts.semibold_weight,
                if slots { 0.1 } else { 0.055 },
                col(style.colors.muted.0, 1.0),
            ),
        ) + pair_gap
            + text::width(
                window,
                &cell.value,
                &style.ink(
                    value_size,
                    style.fonts.metric_weight,
                    -0.01,
                    col(style.colors.ink.0, 1.0),
                ),
            );
        if slots && cells.len() > 5 && used > 0.0 && used + gap + w > width - 24.0 * unit {
            lines.push(Vec::new());
            used = 0.0;
        }
        if let Some(line) = lines.last_mut() {
            line.push((cell, w));
        }
        used += w + if used > 0.0 { gap } else { 0.0 };
    }
    let physical_height = if slots {
        16.0 * unit + value_size + lines.len().saturating_sub(1) as f32 * (value_size + 4.0 * unit)
    } else {
        reserve
    };
    let top = height - physical_height;
    if !slots {
        paint_rect(
            window,
            0.0,
            top,
            width,
            physical_height,
            col(style.colors.black.0, style.opacity.footer),
        );
    }
    paint_rect(window, 0.0, top, width, unit, col(style.colors.ink.0, 0.10));
    let first_baseline = top
        + if slots {
            8.0 * unit + text::css_ascent(value_size)
        } else {
            15.0 * unit
        };
    for (index, line) in lines.iter().enumerate() {
        let total =
            line.iter().map(|(_, w)| w).sum::<f32>() + gap * line.len().saturating_sub(1) as f32;
        let mut x = (width - total) / 2.0;
        let y = first_baseline + index as f32 * (value_size + 4.0 * unit);
        for (cell, w) in line {
            let alpha = if cell.stale { 0.6 } else { 1.0 };
            let label = style.ink(
                label_size,
                style.fonts.semibold_weight,
                if slots { 0.1 } else { 0.055 },
                col(style.colors.muted.0, alpha),
            );
            let value = style.ink(
                value_size,
                style.fonts.metric_weight,
                -0.01,
                col(style.colors.ink.0, alpha),
            );
            text::draw(window, cx, &cell.label, x, y, &label);
            let offset = text::width(window, &cell.label, &label) + pair_gap;
            text::draw(window, cx, &cell.value, x + offset, y, &value);
            x += w + gap;
        }
    }
}

fn paint_unavailable(scene: &Scene, labels: &Labels, window: &mut Window, cx: &mut App) {
    let style = &*scene.config.style;
    let Scene { vm, plan, .. } = scene;
    let message = match vm.status {
        Status::Disconnected => labels.disconnected,
        _ => labels.missing,
    };
    if plan.has_header {
        paint_session_header(scene, labels, 0.0, plan.brand_band, window, cx);
    }
    let status_ink = style.ink(
        style.fonts.brand_size,
        style.fonts.bold_weight,
        0.0,
        col(style.colors.gold.0, 1.0),
    );
    let top = plan.table_top + plan.loose_header + 10.0;
    text::draw(
        window,
        cx,
        message,
        12.0,
        text::baseline(
            top,
            text::css_normal_line(style.fonts.brand_size),
            style.fonts.brand_size,
        )
        .round(),
        &status_ink,
    );
}

fn paint_pit_rail(scene: &Scene, window: &mut Window, cx: &mut App) {
    let style = &*scene.config.style;
    let Scene {
        config, vm, plan, ..
    } = scene;
    let x0 = config.width;
    let rail_top = plan.table_top;
    // El hueco parte de la altura de cabecera declarada (42), no de la real (43).
    let origin = rail_top + plan.table_header;
    let label_ink = style.ink(
        style.fonts.column_label_size,
        style.fonts.heavy_weight,
        0.08,
        col(style.colors.pit_ink.0, 1.0),
    );
    let draw_one = |row: &Row, top: f32, vis: &RowVis, window: &mut Window, cx: &mut App| {
        let (alpha, dx) = (vis.pit_alpha * vis.alpha, vis.pit_dx);
        if alpha <= 0.001 {
            return;
        }
        let cy = top + style.geometry.row_height / 2.0;
        let (lx, ly, lw, lh) = (
            x0 + dx,
            cy - (style.geometry.pit_badge_height / 2.0),
            style.geometry.pit_rail_width,
            style.geometry.pit_badge_height,
        );
        with_opacity(alpha, || {
            // Brillo 0 0 8px rgb(226 197 104 / 22 %).
            window.paint_drop_shadows(
                rect(lx, ly, lw, lh),
                Corners {
                    top_left: px(0.0),
                    top_right: px(style.geometry.pit_radius),
                    bottom_right: px(style.geometry.pit_radius),
                    bottom_left: px(0.0),
                },
                &[BoxShadow {
                    color: col(style.colors.gold.0, style.opacity.pit_glow),
                    offset: pt(0.0, 0.0),
                    blur_radius: px(style.geometry.pit_glow_blur),
                    spread_radius: px(0.0),
                    inset: false,
                }],
            );
            window.paint_quad(quad(
                rect(lx, ly, lw, lh),
                Corners {
                    top_left: px(0.0),
                    top_right: px(style.geometry.pit_radius),
                    bottom_right: px(style.geometry.pit_radius),
                    bottom_left: px(0.0),
                },
                col(style.colors.gold.0, 1.0),
                Edges {
                    top: px(2.0),
                    right: px(2.0),
                    bottom: px(2.0),
                    left: px(1.0),
                },
                col(style.colors.pit_ink.0, 1.0),
                BorderStyle::default(),
            ));
            let w = text::width(window, "PIT", &label_ink);
            let inner_left = lx + 1.0;
            let inner_w = lw - style.geometry.pit_radius;
            let tx = inner_left + (inner_w - w) / 2.0;
            let base = text::baseline(
                ly + (lh - style.fonts.column_label_size) / 2.0,
                style.fonts.column_label_size,
                style.fonts.column_label_size,
            )
            .round();
            text::draw(window, cx, "PIT", tx, base, &label_ink);
        });
        let _ = row;
    };
    for ghost in &scene.frame.ghosts {
        if ghost.row.pit_active {
            let top = origin + ghost.top * style.geometry.row_height / model::ROW_HEIGHT;
            draw_one(&ghost.row, top, &ghost.vis, window, cx);
        }
    }
    for (index, row) in vm.rows.iter().take(plan.visible_rows).enumerate() {
        let vis = scene.frame.row(&row.id);
        let top =
            origin + plan.row_tops[index] + vis.dy * style.geometry.row_height / model::ROW_HEIGHT;
        draw_one(row, top, &vis, window, cx);
    }
}

/// Pie compartido con Relative: mantiene su estilo compilado.
#[allow(clippy::too_many_arguments)]
pub(crate) fn paint_info_cells(
    cells: &[vantare_domain::standings::InfoCell],
    width: f32,
    height: f32,
    reserve: f32,
    slots: bool,
    unit: f32,
    layout_width: f32,
    window: &mut Window,
    cx: &mut App,
) {
    paint_styled_info_cells(
        &Style::compiled(),
        cells,
        width,
        height,
        reserve,
        slots,
        unit,
        layout_width,
        window,
        cx,
    );
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::efficiency::tokens;

    #[test]
    fn row_opacity_multiplies_alpha_without_affecting_other_widgets() {
        with_opacity(0.5, || {
            assert_eq!(col(tokens::INK, 0.8).a, 0.4);
            with_opacity(0.5, || {
                assert_eq!(col(tokens::INK, 0.8).a, 0.2);
            });
            assert_eq!(col(tokens::INK, 0.8).a, 0.4);
            assert_eq!(efficiency::col(tokens::INK, 0.8).a, 0.8);
        });
        assert_eq!(col(tokens::INK, 0.8).a, 0.8);
    }

    #[test]
    fn split_seconds_matches_the_production_regex() {
        assert_eq!(
            split_seconds("+1.20s"),
            Some(("+1.20s".trim_end_matches('s'), "s"))
        );
        assert_eq!(split_seconds("-0.05s"), Some(("-0.05", "s")));
        assert_eq!(split_seconds("12s"), Some(("12", "s")));
        assert_eq!(split_seconds("LÍDER"), None);
        assert_eq!(split_seconds("—"), None);
        assert_eq!(split_seconds("+1.s"), None);
        assert_eq!(split_seconds("s"), None);
        assert_eq!(split_seconds("+2 V"), None);
    }

    #[test]
    fn shadow_tail_matches_the_reference_alpha_profile() {
        // Referencia (Wails, y = 100): alfa 19 en x = 440, 17 en 441, 10 en 445 y 0 desde 460.
        let strip = shadow_strip(&Style::default(), 440.0, 364);
        let alpha =
            |x: usize, y: usize| i32::from(strip[(y * model::PIT_RAIL_WIDTH as usize + x) * 4 + 3]);
        assert!((alpha(0, 100) - 19).abs() <= 1);
        assert!((alpha(1, 100) - 17).abs() <= 1);
        assert!((alpha(5, 100) - 10).abs() <= 1);
        assert!(alpha(20, 100) <= 1);
    }

    #[test]
    fn flag_ribbon_bands_stay_inside_the_130_by_50_box() {
        let base = [(0.0, 0.0), (130.0, 0.0), (130.0, 50.0), (0.0, 50.0)];
        let (dx, dy) = (131f32.to_radians().sin(), -131f32.to_radians().cos());
        let clipped = clip_half_plane(&base, dx, dy, 40.0);
        assert!(clipped.len() >= 3);
        assert!(
            clipped
                .iter()
                .all(|&(x, y)| (-0.01..=130.01).contains(&x) && (-0.01..=50.01).contains(&y))
        );
        // Un semiplano que deja fuera todo el rectangulo da un poligono vacio.
        assert!(clip_half_plane(&base, dx, dy, 1000.0).is_empty());
    }

    #[test]
    fn logo_is_reduced_to_24_by_24_with_soft_edges() {
        let png = logo_24().expect("logo decodes");
        let decoder = png::Decoder::new(std::io::Cursor::new(png));
        let mut reader = decoder.read_info().unwrap();
        assert_eq!((reader.info().width, reader.info().height), (24, 24));
        let mut buffer = vec![0u8; reader.output_buffer_size().unwrap()];
        reader.next_frame(&mut buffer).unwrap();
        let partial = buffer
            .chunks_exact(4)
            .filter(|p| p[3] > 0 && p[3] < 255)
            .count();
        assert!(
            partial > 10,
            "el filtrado por area debe producir bordes con alfa parcial"
        );
    }
}
