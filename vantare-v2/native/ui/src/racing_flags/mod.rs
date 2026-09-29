//! Banner Eficiencia, geometría congelada 280 × 88. Sin reglas de simulador.

use crate::{
    app::{Paint, Wake, replace_if_changed},
    efficiency::{
        col, rect,
        text::{self, ink},
        tokens,
    },
};
use gpui::{App, BorderStyle, Corners, Edges, Window, px, quad};
use std::{
    cell::RefCell,
    collections::HashMap,
    sync::Arc,
    time::{Duration, Instant},
};
use vantare_domain::{
    FlagKind, Snapshot,
    format::Preferences,
    racing_flags::{self, ViewModel},
};

pub const SIZE: (f32, f32) = (280.0, 88.0);
const PULSE: Duration = Duration::from_millis(920);

/// Start, mid (54 %), end y RGB del borde, de tokens.css.
fn palette(flag: Option<&FlagKind>) -> [u32; 4] {
    match flag {
        Some(FlagKind::Green) => [0x62e38e, 0x3dcc75, 0x219b5a, 0x31d778],
        Some(FlagKind::Yellow) => [0xf5d66a, 0xedc34e, 0xd29b2b, 0xf2c94c],
        Some(FlagKind::Red) => [0xff6b72, 0xf04452, 0xc92d3a, 0xff4050],
        Some(FlagKind::Blue) => [0x81a7e8, 0x5c88d3, 0x3f5ea8, 0x5b8bd6],
        Some(FlagKind::White) => [0xf7f7f9, 0xe7e7ed, 0xc6c8d0, 0xf5f5f5],
        Some(FlagKind::Black) => [0x686a72, 0x3f4148, 0x24262b, 0x6e7076],
        Some(FlagKind::Checkered) => [0xf2f2f5, 0xd6d6db, 0xabadb5, 0xd1d1d6],
        _ => [0xb7bac2, 0x979aa4, 0x737782, 0xb1b4bc],
    }
}

/// GPUI admite dos stops. Rasterizamos los tres stops sRGB y el brillo
/// diagonal una vez por paleta (ocho como máximo), sin leer la referencia.
fn background(colors: [u32; 4], cx: &App) -> Result<Arc<gpui::RenderImage>, String> {
    thread_local! {
        static CACHE: RefCell<HashMap<[u32; 4], Arc<gpui::RenderImage>>> = RefCell::new(HashMap::new());
    }
    if let Some(image) = CACHE.with(|cache| cache.borrow().get(&colors).cloned()) {
        return Ok(image);
    }
    let mut pixels = Vec::with_capacity(280 * 88 * 4);
    let gradient = |x: f32, y: f32, angle: f32, width: f32, height: f32| {
        let (dx, dy) = (angle.to_radians().sin(), -angle.to_radians().cos());
        ((x - width / 2.0) * dx + (y - height / 2.0) * dy) / (width * dx.abs() + height * dy.abs())
            + 0.5
    };
    for y in 0..88 {
        for x in 0..280 {
            let t = gradient(x as f32 + 0.5, y as f32 + 0.5, 108.0, SIZE.0, SIZE.1);
            let (from, to, mix) = if t < 0.54 {
                (colors[0], colors[1], t / 0.54)
            } else {
                (colors[1], colors[2], (t - 0.54) / 0.46)
            };
            let shine = 0.08
                * (1.0 - gradient(x as f32 - 0.5, y as f32 - 0.5, 110.0, 278.0, 86.0) / 0.42)
                    .clamp(0.0, 1.0);
            for shift in [16, 8, 0] {
                let a = ((from >> shift) & 255) as f32;
                let b = ((to >> shift) & 255) as f32;
                pixels.push(((a + (b - a) * mix) * (1.0 - shine) + 255.0 * shine).round() as u8);
            }
            pixels.push(255);
        }
    }
    let mut bytes = Vec::new();
    {
        let mut encoder = png::Encoder::new(&mut bytes, 280, 88);
        encoder.set_color(png::ColorType::Rgba);
        encoder.set_depth(png::BitDepth::Eight);
        let mut writer = encoder
            .write_header()
            .map_err(|e| format!("cabecera PNG: {e}"))?;
        writer
            .write_image_data(&pixels)
            .map_err(|e| format!("degradado PNG: {e}"))?;
    }
    let image = gpui::Image::from_bytes(gpui::ImageFormat::Png, bytes)
        .to_image_data(cx.svg_renderer())
        .map_err(|e| format!("imagen del degradado: {e}"))?;
    CACHE.with(|cache| cache.borrow_mut().insert(colors, image.clone()));
    Ok(image)
}

pub fn paint(vm: &ViewModel, pulse: f32, window: &mut Window, cx: &mut App) {
    if vm.hidden {
        return;
    }
    let colors = palette(vm.flag.as_ref());
    let bounds = rect(0.0, 0.0, SIZE.0, SIZE.1);
    let corners = Corners::all(px(tokens::RADIUS));
    let painted = background(colors, cx).and_then(|image| {
        window
            .paint_image(bounds, bounds, corners, image, 0, false)
            .map_err(|e| e.to_string())
    });
    if let Err(error) = painted {
        eprintln!("racing-flags: pintar degradado: {error}");
    }
    window.paint_quad(quad(
        bounds,
        corners,
        col(0, 0.0),
        Edges::all(px(1.0)),
        col(
            colors[3],
            if vm.flag == Some(FlagKind::Yellow) {
                0.48 + pulse * 0.52
            } else {
                0.62
            },
        ),
        BorderStyle::default(),
    ));
    let has_sectors = !vm.sectors.is_empty();
    let top = if has_sectors { 7.73 } else { 25.23 };
    let heading_ink = ink(7.0, 800.0, 0.18, col(vm.text_color, 0.82));
    // CSS pide 850, pero fonts.css declara Inter 400–800: Chrome usa 800.
    let message_ink = ink(26.8847, 800.0, -0.045, col(vm.text_color, 1.0));
    for (value, top, line, style) in [
        (vm.heading, top, 7.0, heading_ink),
        (vm.message, top + 12.0, 25.5405, message_ink),
    ] {
        let x = (SIZE.0 - text::width(window, value, &style)) / 2.0;
        let base = text::baseline(top, line, style.size);
        paint_text_shadow(window, cx, value, x, base, style);
        text::draw(window, cx, value, x, base, &style);
    }
    if has_sectors {
        let left = (SIZE.0 - (vm.sectors.len() as f32 * 22.0 - 4.0)) / 2.0;
        crate::efficiency::paint_rect(window, 17.8, 53.77, 244.4, 1.0, col(0xffffff, 0.12));
        let style = ink(9.0, 700.0, 0.0, col(vm.text_color, 1.0));
        for (index, flag) in vm.sectors.iter().enumerate() {
            let x = left + index as f32 * 22.0;
            let alpha = if matches!(
                flag,
                Some(FlagKind::Green | FlagKind::Yellow | FlagKind::Red)
            ) {
                0.18
            } else {
                0.14
            };
            window.paint_quad(quad(
                rect(x, 62.77, 18.0, 18.0),
                Corners::all(px(3.0)),
                col(0, alpha),
                Edges::all(px(0.0)),
                col(0, 0.0),
                BorderStyle::default(),
            ));
            let label = racing_flags::sector_label(flag.as_ref());
            let label_x = x + (18.0 - text::width(window, &label, &style)) / 2.0;
            text::draw(
                window,
                cx,
                &label,
                label_x,
                text::baseline(67.27, 9.0, 9.0),
                &style,
            );
        }
    }
}

/// Convolución gaussiana del mismo texto: GPUI no ofrece text-shadow.
/// El CSS desplaza 1 px y usa blur 8/10. El kit cachea las runs modeladas.
fn paint_text_shadow(
    window: &mut Window,
    cx: &mut App,
    value: &str,
    x: f32,
    base: f32,
    style: text::Ink,
) {
    let sigma = if style.size < 10.0 { 4.0 } else { 5.0 };
    let weight = |dx: i32, dy: i32| (-((dx * dx + dy * dy) as f32) / (2.0 * sigma * sigma)).exp();
    let sum: f32 = (-5..=5)
        .flat_map(|dy| (-5..=5).map(move |dx| weight(dx * 2, dy * 2)))
        .sum();
    for dy in -5..=5 {
        for dx in -5..=5 {
            let mut shadow = style;
            shadow.color = col(0, 0.18 * style.color.a * weight(dx * 2, dy * 2) / sum);
            text::draw(
                window,
                cx,
                value,
                x + (dx * 2) as f32,
                base + 1.0 + (dy * 2) as f32,
                &shadow,
            );
        }
    }
}

pub(crate) struct Widget {
    vm: ViewModel,
    yellow_since: Option<Instant>,
}

impl Widget {
    pub(crate) fn new(prefs: Preferences) -> Self {
        Self {
            vm: racing_flags::project(&Snapshot::default(), prefs),
            yellow_since: None,
        }
    }

    #[allow(clippy::unused_self)]
    pub(crate) fn size(&self) -> (f32, f32) {
        SIZE
    }

    pub(crate) fn ingest(&mut self, snapshot: &Snapshot, prefs: Preferences) -> bool {
        let vm = racing_flags::project(snapshot, prefs);
        if vm.flag != self.vm.flag {
            self.yellow_since = (vm.flag == Some(FlagKind::Yellow)).then(Instant::now);
        }
        replace_if_changed(&mut self.vm, vm)
    }

    pub(crate) fn frame(&mut self, _prefs: Preferences) -> (Paint, Wake) {
        let elapsed = self.yellow_since.map(|start| start.elapsed());
        let (pulse, wake) = pulse(elapsed);
        if matches!(wake, Wake::Idle) {
            self.yellow_since = None;
        }
        let vm = self.vm.clone();
        (
            Box::new(move |window, cx| paint(&vm, pulse, window, cx)),
            wake,
        )
    }

    #[cfg(feature = "parity-capture")]
    pub(crate) fn animating(&self) -> bool {
        self.yellow_since
            .is_some_and(|start| start.elapsed() < PULSE)
    }
}

/// Una sola vuelta del aviso de 920 ms al entrar en amarillo; luego reposo.
fn pulse(elapsed: Option<Duration>) -> (f32, Wake) {
    match elapsed {
        Some(elapsed) if elapsed < PULSE => {
            let t = elapsed.as_secs_f32() / PULSE.as_secs_f32();
            ((1.0 - (t * std::f32::consts::TAU).cos()) / 2.0, Wake::Frame)
        }
        _ => (0.0, Wake::Idle),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use vantare_domain::{Flag, FlagScope, Quality};

    #[test]
    fn default_scene_projects_the_frozen_green_banner() {
        let snapshot = vantare_ipc::snapshot_from_json(include_str!(
            "../../fixtures/racing-flags.snapshot.json"
        ))
        .expect("escena Workshop DTO v3 válida");
        let vm = racing_flags::project(&snapshot, Preferences::default());
        assert_eq!(vm.flag, Some(FlagKind::Green));
        assert_eq!((vm.heading, vm.message), ("BANDERA", "VERDE"));
        assert!(vm.sectors.is_empty());
        assert!(!vm.hidden);
        assert!(snapshot.state.cars.is_empty());
        assert!(snapshot.state.player.is_none());
    }

    #[test]
    fn yellow_pulse_ends_and_identical_snapshots_do_not_restart_it() {
        for elapsed in [None, Some(PULSE), Some(PULSE * 2)] {
            assert!(matches!(pulse(elapsed), (0.0, Wake::Idle)));
        }
        assert!(matches!(pulse(Some(PULSE / 2)), (1.0, Wake::Frame)));
        let mut widget = Widget::new(Preferences::default());
        let mut snapshot = Snapshot::default();
        snapshot.state.flags = Quality::Reliable(vec![Flag {
            kind: FlagKind::Yellow,
            scope: FlagScope::Session,
        }]);
        assert!(widget.ingest(&snapshot, Preferences::default()));
        widget.yellow_since = Instant::now().checked_sub(PULSE * 2);
        let (_, wake) = widget.frame(Preferences::default());
        assert!(matches!(wake, Wake::Idle));
        assert!(!widget.ingest(&snapshot, Preferences::default()));
        assert!(widget.yellow_since.is_none());
        #[cfg(feature = "parity-capture")]
        assert!(!widget.animating());
        snapshot.state.flags = Quality::Unavailable;
        assert!(widget.ingest(&snapshot, Preferences::default()));
        assert!(!widget.ingest(&snapshot, Preferences::default()));
        assert!(widget.ingest(
            &snapshot,
            Preferences {
                language: vantare_domain::format::Language::En,
                ..Preferences::default()
            }
        ));
    }
}
