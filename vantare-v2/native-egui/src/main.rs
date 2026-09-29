mod projection;

use eframe::egui::{
    self, Align2, Color32, FontData, FontDefinitions, FontFamily, FontId, Pos2, Rect, Stroke,
    StrokeKind, Vec2,
};
use projection::{LatestProjection, Projection, connect_loop};
use std::{
    net::SocketAddr,
    sync::{
        Arc, Mutex,
        atomic::{AtomicBool, Ordering},
    },
    thread,
    time::{Duration, Instant},
};

const CANVAS: Color32 = Color32::from_rgb(8, 9, 11);
const PANEL: Color32 = Color32::from_rgb(20, 20, 24);
const INK: Color32 = Color32::from_rgb(245, 243, 242);
const MUTED: Color32 = Color32::from_rgb(138, 133, 139);
const RED: Color32 = Color32::from_rgb(240, 71, 85);

#[derive(Clone, Copy, PartialEq, Eq)]
enum Mode {
    Hub,
    Standings,
}

struct Options {
    mode: Mode,
    address: Option<SocketAddr>,
}

fn options() -> Result<Options, String> {
    let mut mode = Mode::Hub;
    let mut address = None;
    let mut args = std::env::args().skip(1);
    while let Some(arg) = args.next() {
        match arg.as_str() {
            "--mode" => match args.next().as_deref() {
                Some("hub") => mode = Mode::Hub,
                Some("standings") => mode = Mode::Standings,
                _ => return Err("--mode must be hub or standings".into()),
            },
            "--endpoint" => {
                let value = args.next().ok_or("missing --endpoint value")?;
                let host = value
                    .strip_prefix("http://")
                    .and_then(|v| v.strip_suffix(projection::ROUTE))
                    .ok_or("endpoint must be the local Overlay V2 route")?;
                let parsed: SocketAddr = host.parse().map_err(|_| "invalid endpoint address")?;
                if !parsed.ip().is_loopback() {
                    return Err("endpoint must use loopback".into());
                }
                address = Some(parsed);
            }
            _ => return Err(format!("unknown argument: {arg}")),
        }
    }
    if mode == Mode::Standings && address.is_none() {
        return Err("standings mode requires --endpoint".into());
    }
    Ok(Options { mode, address })
}

struct NativeApp {
    mode: Mode,
    latest: LatestProjection,
    projection: Option<Projection>,
    received: Option<Instant>,
    stopped: Arc<AtomicBool>,
    palette_open: bool,
    search: String,
}

impl NativeApp {
    fn new(cc: &eframe::CreationContext<'_>, options: Options) -> Self {
        cc.egui_ctx.set_visuals(egui::Visuals::dark());
        let mut fonts = FontDefinitions::default();
        fonts.font_data.insert(
            "Inter".into(),
            Arc::new(FontData::from_static(include_bytes!(
                "../assets/Inter-Variable.ttf"
            ))),
        );
        fonts.font_data.insert(
            "Cascadia".into(),
            Arc::new(FontData::from_static(include_bytes!(
                "../assets/CascadiaCode.ttf"
            ))),
        );
        fonts
            .families
            .get_mut(&FontFamily::Proportional)
            .expect("default proportional family")
            .insert(0, "Inter".into());
        fonts
            .families
            .get_mut(&FontFamily::Monospace)
            .expect("default monospace family")
            .insert(0, "Cascadia".into());
        cc.egui_ctx.set_fonts(fonts);
        let latest = Arc::new(Mutex::new(None));
        let stopped = Arc::new(AtomicBool::new(false));
        if let Some(address) = options.address {
            let worker_latest = Arc::clone(&latest);
            let worker_stopped = Arc::clone(&stopped);
            let context = cc.egui_ctx.clone();
            thread::spawn(move || connect_loop(address, worker_latest, worker_stopped, context));
        }
        Self {
            mode: options.mode,
            latest,
            projection: None,
            received: None,
            stopped,
            palette_open: false,
            search: String::new(),
        }
    }

    fn poll(&mut self) {
        if let Ok(mut slot) = self.latest.lock()
            && let Some(projection) = slot.take()
        {
            self.projection = Some(projection);
            self.received = Some(Instant::now());
        }
    }

    fn text(p: &egui::Painter, x: f32, y: f32, text: &str, size: f32, color: Color32) {
        p.text(
            Pos2::new(x, y),
            Align2::LEFT_TOP,
            text,
            FontId::proportional(size),
            color,
        );
    }

    fn card(p: &egui::Painter, rect: Rect, radius: f32, fill: Color32) {
        p.rect_filled(rect, radius, fill);
        p.rect_stroke(
            rect,
            radius,
            Stroke::new(1.0, Color32::from_rgb(54, 38, 43)),
            StrokeKind::Inside,
        );
    }

    fn hub(&mut self, ui: &mut egui::Ui) {
        let ctx = ui.ctx().clone();
        egui::CentralPanel::default()
            .frame(egui::Frame::NONE.fill(CANVAS))
            .show(ui, |ui| {
                let screen = ui.max_rect();
                let p = ui.painter();
                let rail = Rect::from_min_size(screen.min, Vec2::new(81.0, screen.height()));
                let side = Rect::from_min_size(
                    Pos2::new(rail.right(), screen.top()),
                    Vec2::new(296.0, screen.height()),
                );
                let content_left = side.right() + 31.0;
                let content_right = screen.right() - 31.0;
                p.rect_filled(rail, 0.0, Color32::from_rgb(11, 12, 14));
                p.rect_filled(side, 0.0, Color32::from_rgb(15, 16, 19));
                p.rect_filled(
                    Rect::from_min_max(
                        Pos2::new(side.right(), screen.top()),
                        Pos2::new(screen.right(), screen.top() + 70.0),
                    ),
                    0.0,
                    Color32::from_rgb(9, 9, 12),
                );
                Self::card(
                    p,
                    Rect::from_min_size(screen.min + Vec2::new(14.0, 10.0), Vec2::splat(52.0)),
                    15.0,
                    Color32::from_rgb(42, 17, 24),
                );
                Self::text(p, rail.left() + 30.0, rail.top() + 19.0, "Λ", 27.0, INK);
                for (i, glyph) in ["⌂", "▣", "ϟ", "▦", "⌁", "◉", "⌕", "⚙"].iter().enumerate()
                {
                    let y = screen.top() + 96.0 + i as f32 * 60.0;
                    if i == 0 {
                        p.rect_filled(
                            Rect::from_min_size(
                                Pos2::new(rail.left() + 14.0, y - 6.0),
                                Vec2::new(52.0, 52.0),
                            ),
                            14.0,
                            Color32::from_rgb(47, 20, 27),
                        );
                    }
                    Self::text(
                        p,
                        rail.left() + 30.0,
                        y,
                        glyph,
                        23.0,
                        if i == 0 { INK } else { MUTED },
                    );
                }
                Self::text(
                    p,
                    side.left() + 23.0,
                    screen.top() + 29.0,
                    "Centro operativo",
                    15.0,
                    INK,
                );
                Self::text(
                    p,
                    side.left() + 23.0,
                    screen.top() + 90.0,
                    "PRÓXIMAS CARRERAS",
                    11.0,
                    MUTED,
                );
                for (i, (name, track, time)) in [
                    ("LMGT3 Fixed", "Sebring (School)", "20:15"),
                    ("Logitech McLaren G", "Monza (WEC)", "20:30"),
                    ("LMP3 Fixed", "Fuji (Classic)", "20:45"),
                ]
                .iter()
                .enumerate()
                {
                    let y = screen.top() + 125.0 + i as f32 * 52.0;
                    p.circle_filled(
                        Pos2::new(side.left() + 27.0, y + 12.0),
                        3.0,
                        Color32::from_rgb(210, 154, 108),
                    );
                    Self::text(p, side.left() + 41.0, y, name, 13.0, INK);
                    Self::text(p, side.left() + 41.0, y + 20.0, track, 11.0, MUTED);
                    Self::text(p, side.right() - 62.0, y, time, 12.0, RED);
                }
                Self::text(
                    p,
                    side.left() + 23.0,
                    screen.top() + 302.0,
                    "PERFIL DE OVERLAY",
                    11.0,
                    MUTED,
                );
                Self::text(
                    p,
                    side.left() + 23.0,
                    screen.top() + 344.0,
                    "Clean Overlay",
                    13.0,
                    INK,
                );
                Self::text(
                    p,
                    side.left() + 23.0,
                    screen.top() + 367.0,
                    "3 widgets · activo",
                    11.0,
                    MUTED,
                );
                Self::text(
                    p,
                    side.left() + 23.0,
                    screen.top() + 407.0,
                    "LAUNCHER",
                    11.0,
                    MUTED,
                );
                Self::text(
                    p,
                    side.left() + 23.0,
                    screen.top() + 447.0,
                    "Creador de Contenido",
                    13.0,
                    INK,
                );
                Self::text(
                    p,
                    side.left() + 23.0,
                    screen.top() + 496.0,
                    "Pro",
                    13.0,
                    INK,
                );
                Self::text(
                    p,
                    side.right() + 26.0,
                    screen.top() + 30.0,
                    "CENTRO OPERATIVO    /    Inicio",
                    15.0,
                    INK,
                );
                Self::text(
                    p,
                    content_left + 24.0,
                    screen.top() + 93.0,
                    "Buenas noches, test.",
                    39.0,
                    INK,
                );
                let command = Rect::from_min_max(
                    Pos2::new(content_left, screen.top() + 157.0),
                    Pos2::new(content_right - 340.0, screen.top() + 243.0),
                );
                Self::card(p, command, 25.0, PANEL);
                let icon =
                    Rect::from_min_size(command.min + Vec2::new(24.0, 21.0), Vec2::splat(44.0));
                p.rect_filled(icon, 12.0, RED);
                Self::text(p, icon.left() + 12.0, icon.top() + 8.0, "✧", 25.0, INK);
                Self::text(
                    p,
                    command.left() + 85.0,
                    command.top() + 27.0,
                    "Busca, abre o lanza algo en Vantare…",
                    15.0,
                    INK,
                );
                Self::text(
                    p,
                    command.left() + 85.0,
                    command.top() + 52.0,
                    "\"Abre el Studio con el perfil Clean Overlay\"",
                    11.0,
                    MUTED,
                );
                if ui
                    .interact(command, egui::Id::new("command"), egui::Sense::click())
                    .clicked()
                {
                    self.palette_open = true;
                }
                let next = Rect::from_min_max(
                    Pos2::new(content_right - 300.0, screen.top() + 123.0),
                    Pos2::new(content_right, screen.top() + 272.0),
                );
                Self::card(p, next, 25.0, Color32::from_rgb(53, 22, 29));
                Self::text(
                    p,
                    next.left() + 20.0,
                    next.top() + 22.0,
                    "● PRÓXIMA SERIE",
                    12.0,
                    RED,
                );
                Self::text(
                    p,
                    next.left() + 20.0,
                    next.top() + 50.0,
                    "LMGT3 Fixed · Sebring (School)",
                    15.0,
                    INK,
                );
                Self::text(
                    p,
                    next.left() + 20.0,
                    next.top() + 89.0,
                    "en 07:25",
                    20.0,
                    RED,
                );
                for (i, label) in [
                    "Abrir Studio",
                    "Abrir overlay",
                    "Crear plan",
                    "Lanzar perfil",
                ]
                .iter()
                .enumerate()
                {
                    let chip = Rect::from_min_size(
                        Pos2::new(content_left + i as f32 * 110.0, screen.top() + 265.0),
                        Vec2::new(101.0, 35.0),
                    );
                    p.rect_filled(chip, 10.0, Color32::from_rgb(15, 15, 18));
                    Self::text(p, chip.left() + 12.0, chip.top() + 10.0, label, 11.0, MUTED);
                }
                let focal = Rect::from_min_max(
                    Pos2::new(content_left, screen.top() + 313.0),
                    Pos2::new(content_right, screen.top() + 623.0),
                );
                Self::card(p, focal, 25.0, PANEL);
                Self::text(
                    p,
                    focal.left() + 28.0,
                    focal.top() + 31.0,
                    "PERFIL ACTIVO",
                    11.0,
                    MUTED,
                );
                Self::text(
                    p,
                    focal.left() + 28.0,
                    focal.top() + 65.0,
                    "Clean Overlay",
                    28.0,
                    INK,
                );
                Self::text(
                    p,
                    focal.left() + 28.0,
                    focal.top() + 112.0,
                    "delta, relative, standings en el lienzo · Overlays Studio",
                    14.0,
                    MUTED,
                );
                Self::text(
                    p,
                    focal.left() + 28.0,
                    focal.top() + 166.0,
                    "1920 × 1080    3 widgets visibles    ● Overlay detenido",
                    11.0,
                    MUTED,
                );
                let stage = Rect::from_min_max(
                    Pos2::new(focal.right() - 493.0, focal.top() + 23.0),
                    Pos2::new(focal.right() - 23.0, focal.bottom() - 23.0),
                );
                Self::card(p, stage, 12.0, CANVAS);
                Self::text(
                    p,
                    stage.left() + 16.0,
                    stage.top() + 18.0,
                    "VANTARE",
                    9.0,
                    INK,
                );
                let bottom_top = focal.bottom() + 22.0;
                let races_w = (content_right - content_left - 21.0) * 0.585;
                let races = Rect::from_min_max(
                    Pos2::new(content_left, bottom_top),
                    Pos2::new(content_left + races_w, screen.bottom() - 20.0),
                );
                let profiles = Rect::from_min_max(
                    Pos2::new(races.right() + 21.0, bottom_top),
                    Pos2::new(content_right, screen.bottom() - 20.0),
                );
                Self::card(p, races, 18.0, Color32::from_rgb(15, 15, 18));
                Self::card(p, profiles, 18.0, Color32::from_rgb(15, 15, 18));
                Self::text(
                    p,
                    races.left() + 21.0,
                    races.top() + 24.0,
                    "Próximas carreras",
                    15.0,
                    INK,
                );
                Self::text(
                    p,
                    profiles.left() + 21.0,
                    profiles.top() + 24.0,
                    "Perfiles",
                    15.0,
                    INK,
                );
                for (i, (time, name, track)) in [
                    ("20:15", "LMGT3 Fixed", "Sebring (School)"),
                    ("20:30", "Logitech McLaren Challenge", "Monza (WEC)"),
                    ("20:45", "LMP3 Fixed", "Fuji (Classic)"),
                    ("21:15", "LMGT3 Sprint Cup", "COTA"),
                ]
                .iter()
                .enumerate()
                {
                    let y = races.top() + 94.0 + i as f32 * 58.0;
                    Self::text(
                        p,
                        races.left() + 24.0,
                        y,
                        time,
                        12.0,
                        if i == 0 { RED } else { INK },
                    );
                    Self::text(p, races.left() + 112.0, y, name, 13.0, INK);
                    Self::text(p, races.left() + 112.0, y + 20.0, track, 11.0, MUTED);
                }
                Self::text(
                    p,
                    profiles.left() + 24.0,
                    profiles.top() + 94.0,
                    "Clean Overlay",
                    13.0,
                    INK,
                );
                Self::text(
                    p,
                    profiles.left() + 24.0,
                    profiles.top() + 117.0,
                    "3 widgets · configuración local",
                    11.0,
                    MUTED,
                );
                Self::text(
                    p,
                    profiles.right() - 75.0,
                    profiles.top() + 101.0,
                    "✓ Activo",
                    12.0,
                    Color32::from_rgb(120, 214, 139),
                );
            });
        if ctx.input(|i| i.modifiers.ctrl && i.key_pressed(egui::Key::K)) {
            self.palette_open = true;
        }
        if self.palette_open {
            egui::Window::new("Comando Vantare")
                .collapsible(false)
                .resizable(false)
                .anchor(Align2::CENTER_TOP, Vec2::new(0.0, 90.0))
                .show(&ctx, |ui| {
                    ui.add(
                        egui::TextEdit::singleline(&mut self.search)
                            .hint_text("Busca, abre o lanza algo en Vantare…"),
                    );
                    for item in [
                        "Inicio",
                        "Overlays Studio",
                        "Launcher",
                        "Carreras",
                        "Estrategia",
                        "Ingeniero",
                        "Telemetría",
                    ] {
                        if item.to_lowercase().contains(&self.search.to_lowercase())
                            && ui.button(item).clicked()
                        {
                            self.palette_open = false;
                        }
                    }
                });
            if ctx.input(|i| i.key_pressed(egui::Key::Escape)) {
                self.palette_open = false;
            }
        }
    }

    fn standings(&self, ui: &mut egui::Ui) {
        let ctx = ui.ctx().clone();
        egui::CentralPanel::default()
            .frame(egui::Frame::NONE.fill(Color32::TRANSPARENT))
            .show(ui, |ui| {
                let screen = ui.max_rect();
                let p = ui.painter();
                let table = Rect::from_min_size(
                    screen.min + Vec2::splat(8.0),
                    Vec2::new((screen.width() - 16.0).min(432.0), 368.0),
                );
                p.rect_filled(table, 5.0, Color32::from_black_alpha(230));
                p.rect_filled(
                    Rect::from_min_size(table.min, Vec2::new(table.width(), 43.0)),
                    5.0,
                    Color32::from_rgb(25, 25, 27),
                );
                Self::text(
                    p,
                    table.left() + 11.0,
                    table.top() + 12.0,
                    "Λ VANTARE",
                    13.0,
                    INK,
                );
                Self::text(
                    p,
                    table.left() + 122.0,
                    table.top() + 9.0,
                    "CARRERA",
                    9.0,
                    MUTED,
                );
                Self::text(
                    p,
                    table.left() + 122.0,
                    table.top() + 23.0,
                    self.projection
                        .as_ref()
                        .map_or("—", |p| p.session_clock.as_str()),
                    12.0,
                    INK,
                );
                Self::text(
                    p,
                    table.right() - 157.0,
                    table.top() + 14.0,
                    "AL LÍDER",
                    10.0,
                    MUTED,
                );
                Self::text(
                    p,
                    table.right() - 75.0,
                    table.top() + 14.0,
                    "MEJOR V.",
                    10.0,
                    MUTED,
                );
                match &self.projection {
                    Some(projection) => {
                        for (i, row) in projection.rows.iter().take(10).enumerate() {
                            let y = table.top() + 43.0 + i as f32 * 32.0;
                            p.rect_filled(
                                Rect::from_min_size(
                                    Pos2::new(table.left(), y),
                                    Vec2::new(table.width(), 32.0),
                                ),
                                0.0,
                                if row.player {
                                    Color32::from_rgb(65, 65, 68)
                                } else if i % 2 == 0 {
                                    Color32::from_rgb(29, 29, 31)
                                } else {
                                    Color32::from_rgb(24, 24, 26)
                                },
                            );
                            Self::text(
                                p,
                                table.left() + 12.0,
                                y + 8.0,
                                &row.position.to_string(),
                                13.0,
                                MUTED,
                            );
                            Self::text(p, table.left() + 44.0, y + 7.0, &row.driver, 14.0, INK);
                            Self::text(p, table.right() - 142.0, y + 7.0, &row.gap, 13.0, INK);
                            Self::text(p, table.right() - 73.0, y + 7.0, &row.best_lap, 12.0, INK);
                        }
                        let stale = self
                            .received
                            .is_some_and(|at| at.elapsed() > Duration::from_secs(3));
                        if stale || projection.source != "live" {
                            Self::text(
                                p,
                                table.left() + 8.0,
                                table.bottom() + 4.0,
                                "DATOS OBSOLETOS",
                                11.0,
                                RED,
                            );
                        }
                    }
                    None => Self::text(
                        p,
                        table.left() + 15.0,
                        table.top() + 75.0,
                        "Esperando proyección Go…",
                        15.0,
                        INK,
                    ),
                }
            });
        ctx.request_repaint_after(Duration::from_secs(1));
    }
}

impl eframe::App for NativeApp {
    fn clear_color(&self, _visuals: &egui::Visuals) -> [f32; 4] {
        if self.mode == Mode::Standings {
            [0.0, 0.0, 0.0, 0.0]
        } else {
            CANVAS.to_normalized_gamma_f32()
        }
    }

    fn ui(&mut self, ui: &mut egui::Ui, frame: &mut eframe::Frame) {
        if self.mode == Mode::Standings {
            set_no_activate(frame);
        }
        self.poll();
        match self.mode {
            Mode::Hub => self.hub(ui),
            Mode::Standings => self.standings(ui),
        }
    }
}

#[cfg(windows)]
fn set_no_activate(frame: &eframe::Frame) {
    use raw_window_handle::{HasWindowHandle, RawWindowHandle};
    use windows_sys::Win32::UI::WindowsAndMessaging::{
        GWL_EXSTYLE, GetWindowLongPtrW, SWP_FRAMECHANGED, SWP_NOACTIVATE, SWP_NOMOVE, SWP_NOSIZE,
        SWP_NOZORDER, SetWindowLongPtrW, SetWindowPos, WS_EX_NOACTIVATE,
    };
    let Some(window) = frame.winit_window() else {
        return;
    };
    let Ok(handle) = window.window_handle() else {
        return;
    };
    let RawWindowHandle::Win32(handle) = handle.as_raw() else {
        return;
    };
    let hwnd = handle.hwnd.get() as *mut core::ffi::c_void;
    // SAFETY: hwnd belongs to this live eframe window on the UI thread. Only
    // the documented extended-style bit is added; dimensions and z-order stay.
    unsafe {
        let style = GetWindowLongPtrW(hwnd, GWL_EXSTYLE);
        if style & WS_EX_NOACTIVATE as isize != 0 {
            return;
        }
        SetWindowLongPtrW(hwnd, GWL_EXSTYLE, style | WS_EX_NOACTIVATE as isize);
        SetWindowPos(
            hwnd,
            std::ptr::null_mut(),
            0,
            0,
            0,
            0,
            SWP_FRAMECHANGED | SWP_NOACTIVATE | SWP_NOMOVE | SWP_NOSIZE | SWP_NOZORDER,
        );
    }
}

#[cfg(not(windows))]
fn set_no_activate(_frame: &eframe::Frame) {}

impl Drop for NativeApp {
    fn drop(&mut self) {
        self.stopped.store(true, Ordering::Relaxed);
    }
}

fn main() -> eframe::Result {
    let opts = options().unwrap_or_else(|error| {
        eprintln!("{error}");
        std::process::exit(2)
    });
    let overlay = opts.mode == Mode::Standings;
    let viewport = egui::ViewportBuilder::default()
        .with_title(if overlay {
            "Vantare · Standings Eficiencia"
        } else {
            "Vantare · Inicio nativo"
        })
        .with_inner_size(if overlay {
            Vec2::new(448.0, 400.0)
        } else {
            Vec2::new(1920.0, 1080.0)
        })
        .with_transparent(overlay)
        .with_decorations(!overlay)
        .with_mouse_passthrough(overlay);
    let viewport = if overlay {
        viewport.with_always_on_top().with_active(false)
    } else {
        viewport
    };
    let native_options = eframe::NativeOptions {
        viewport,
        ..Default::default()
    };
    eframe::run_native(
        "Vantare native",
        native_options,
        Box::new(move |cc| Ok(Box::new(NativeApp::new(cc, opts)))),
    )
}
