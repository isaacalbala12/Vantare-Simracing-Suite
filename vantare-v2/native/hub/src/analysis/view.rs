use super::{
    model::{Charts, Lap, Point, Signal, project_laps},
    reader::{Cancel, Reader, recordings},
};
use crate::demo::DemoData;
#[cfg(feature = "parity-capture")]
use crate::demo::DemoTelemetrySession;
use crate::orbit;
#[cfg(feature = "parity-capture")]
use gpui::relative;
use gpui::{
    Context, FontWeight, IntoElement, PathBuilder, Render, Window, canvas, div, linear_color_stop,
    linear_gradient, point, prelude::*, px, rgb, rgba,
};
use std::{
    path::PathBuf,
    sync::{
        Arc,
        atomic::{AtomicBool, Ordering},
    },
};

#[cfg(feature = "parity-capture")]
const DEMO_CORNERS: [(&str, f64, f64); 8] = [
    ("T1", -0.04, 0.06),
    ("T3", 0.06, 0.19),
    ("T5", 0.02, 0.31),
    ("T7", 0.18, 0.44),
    ("T10", -0.05, 0.58),
    ("T13", 0.11, 0.71),
    ("T15", 0.09, 0.83),
    ("T17", 0.16, 0.93),
];

#[cfg(feature = "parity-capture")]
#[derive(Clone, Copy)]
struct DemoSample {
    speed: f64,
    throttle: f64,
    brake: f64,
    steer: f64,
}

#[cfg(feature = "parity-capture")]
#[derive(Clone)]
struct DemoModel {
    track: Vec<(f64, f64)>,
    mine: Vec<DemoSample>,
    reference: Vec<DemoSample>,
    delta: Vec<f64>,
    sectors: [f64; 3],
}

#[cfg(feature = "parity-capture")]
impl DemoModel {
    fn new() -> Self {
        let anchors = [
            (60.0, 150.0),
            (70.0, 90.0),
            (110.0, 60.0),
            (170.0, 50.0),
            (230.0, 58.0),
            (280.0, 45.0),
            (330.0, 55.0),
            (360.0, 90.0),
            (355.0, 135.0),
            (320.0, 160.0),
            (300.0, 200.0),
            (330.0, 240.0),
            (300.0, 270.0),
            (240.0, 265.0),
            (190.0, 245.0),
            (150.0, 255.0),
            (110.0, 240.0),
            (80.0, 205.0),
            (62.0, 180.0),
        ];
        let mut track = Vec::with_capacity(anchors.len() * 12);
        for index in 0..anchors.len() {
            let p0 = anchors[(index + anchors.len() - 1) % anchors.len()];
            let p1 = anchors[index];
            let p2 = anchors[(index + 1) % anchors.len()];
            let p3 = anchors[(index + 2) % anchors.len()];
            for step in 0..12 {
                let t = f64::from(step) / 12.0;
                let t2 = t * t;
                let t3 = t2 * t;
                track.push((
                    0.5 * (2.0 * p1.0
                        + (-p0.0 + p2.0) * t
                        + (2.0 * p0.0 - 5.0 * p1.0 + 4.0 * p2.0 - p3.0) * t2
                        + (-p0.0 + 3.0 * p1.0 - 3.0 * p2.0 + p3.0) * t3),
                    0.5 * (2.0 * p1.1
                        + (-p0.1 + p2.1) * t
                        + (2.0 * p0.1 - 5.0 * p1.1 + 4.0 * p2.1 - p3.1) * t2
                        + (-p0.1 + 3.0 * p1.1 - 3.0 * p2.1 + p3.1) * t3),
                ));
            }
        }
        let mine = Self::channels(true);
        let reference = Self::channels(false);
        let mut delta = Vec::with_capacity(400);
        let mut accumulated = 0.0;
        let mut seen = [false; 8];
        for index in 0..400 {
            let x = f64::from(index) / 400.0;
            for (position, (_, value, at)) in DEMO_CORNERS.iter().enumerate() {
                if !seen[position] && x >= *at {
                    seen[position] = true;
                    accumulated += value;
                }
            }
            delta.push(accumulated);
        }
        let mut sectors = [0.0; 3];
        for (_, value, position) in DEMO_CORNERS {
            let index = if position < 1.0 / 3.0 {
                0
            } else if position < 2.0 / 3.0 {
                1
            } else {
                2
            };
            sectors[index] += value;
        }
        Self {
            track,
            mine,
            reference,
            delta,
            sectors,
        }
    }

    fn channels(mine: bool) -> Vec<DemoSample> {
        (0..400)
            .map(|index| {
                let x = f64::from(index) / 400.0;
                let (mut speed, mut throttle, mut brake, mut steer) =
                    (250.0_f64, 100.0_f64, 0.0_f64, 0.0_f64);
                for (name, delta, position) in DEMO_CORNERS {
                    let distance = (x - position).abs();
                    let width: f64 = 0.035;
                    if distance >= width * 2.2 {
                        continue;
                    }
                    let g = (-(distance * distance) / (2.0 * width * width)).exp();
                    let digit = match name.as_bytes().get(1) {
                        Some(digit) => *digit,
                        None => b'0',
                    };
                    let depth = 60.0 + (70.0 * f64::from((u32::from(digit) * 7) % 5)) / 4.0;
                    let early = if mine { delta * 0.35 } else { 0.0 };
                    let shift = x - position + early;
                    speed -= depth * g * if mine { 1.0 + delta * 0.6 } else { 1.0 };
                    if shift < 0.0 && shift > -width * 1.6 {
                        let braking = 90.0
                            * (-((shift + width * 0.8).powi(2)) / (2.0 * (width * 0.5).powi(2)))
                                .exp()
                            * if mine { 1.0 - delta * 0.8 } else { 1.0 };
                        brake = brake.max(braking);
                    }
                    if shift < 0.02 && shift > -width * 1.6 {
                        throttle = throttle.min(100.0 - 100.0 * g);
                    }
                    let sign = if digit % 2 == 1 { 1.0 } else { -1.0 };
                    let wiggle = if mine && delta > 0.1 {
                        1.0 + 0.15 * (x * 400.0).sin()
                    } else {
                        1.0
                    };
                    steer = steer.abs().max(40.0 + 60.0 * g) * sign * wiggle;
                }
                DemoSample {
                    speed: speed.max(60.0),
                    throttle: throttle.max(0.0),
                    brake: brake.min(100.0),
                    steer,
                }
            })
            .collect()
    }
}

#[cfg(feature = "parity-capture")]
fn telemetry_demo_capture() -> bool {
    // El harness congeló demo y trazas con la misma escena; no se inventa un desplazamiento.
    let mut args = std::env::args();
    while let Some(arg) = args.next() {
        if arg == "--capture" {
            return args.next().is_some_and(|name| {
                matches!(name.as_str(), "telemetria-demo" | "telemetria-trazas")
            });
        }
    }
    false
}

#[cfg(feature = "parity-capture")]
fn load_demo_session() -> Result<DemoTelemetrySession, String> {
    let data = DemoData::load()?;
    if !data.telemetry.synthetic {
        return Err("la captura de Telemetría requiere la fixture sintética declarada".into());
    }
    let mut sessions = data.telemetry.sessions.into_iter();
    sessions
        .next()
        .ok_or_else(|| "la fixture de Telemetría no contiene sesiones".into())
}

struct Job(Cancel);
impl Drop for Job {
    fn drop(&mut self) {
        self.0.store(true, Ordering::Release);
    }
}

pub struct Analysis {
    root: PathBuf,
    exe: PathBuf,
    files: Vec<PathBuf>,
    selected: Option<PathBuf>,
    laps: Vec<Lap>,
    pair: [Option<usize>; 2],
    watermark: u64,
    charts: Charts,
    status: String,
    recording_status: String,
    busy: bool,
    job: Option<Job>,
    reference: TelemetryReference,
    #[cfg(feature = "parity-capture")]
    demo: Option<Result<DemoTelemetrySession, String>>,
}

fn telemetry_context_row(
    session: &crate::demo::DemoTelemetrySession,
    selected: bool,
) -> gpui::Stateful<gpui::Div> {
    let title = format!("{} · {}", session.track, session.car);
    let subtitle = format!(
        "{} · {} vueltas · {}",
        session.when, session.laps, session.best
    );
    div()
        .id(gpui::SharedString::from(format!(
            "telemetry-session-{}",
            session.id
        )))
        .role(gpui::Role::ListBoxOption)
        .aria_selected(selected)
        .min_h(px(49.0))
        .w_full()
        .relative()
        .flex()
        .items_center()
        .px(px(8.0))
        .py(px(6.0))
        .rounded(px(11.0))
        .when(selected, |row| row.bg(orbit::tint(orbit::CARMINE, 0.08)))
        .child(
            div()
                .flex_1()
                .min_w_0()
                .child(
                    telemetry_text(
                        title,
                        13.0,
                        if selected { 700 } else { 650 },
                        if selected { orbit::INK } else { orbit::INK_2 },
                    )
                    .w_full()
                    .whitespace_nowrap()
                    .text_ellipsis(),
                )
                .child(
                    telemetry_text(subtitle, 11.0, 400, orbit::INK_3)
                        .w_full()
                        .whitespace_nowrap()
                        .text_ellipsis(),
                ),
        )
        .when(selected, |row| {
            row.child(
                div()
                    .absolute()
                    .left(px(-13.0))
                    .w(px(3.0))
                    .h(px(18.0))
                    .rounded(px(4.0))
                    .bg(rgb(orbit::CARMINE)),
            )
        })
}

impl Analysis {
    pub(crate) fn context_sidebar(
        demo: Option<&DemoData>,
        capture_name: Option<&str>,
    ) -> gpui::Div {
        let show_demo_sessions =
            matches!(capture_name, Some("telemetria-demo" | "telemetria-trazas"));
        let sessions = demo
            .filter(|demo| show_demo_sessions && demo.telemetry.synthetic)
            .map(|demo| demo.telemetry.sessions.as_slice())
            .unwrap_or_default();
        let mut rows = div()
            .id("telemetry-context-sessions")
            .role(gpui::Role::ListBox)
            .flex()
            .flex_col()
            .gap(px(2.0))
            .px(px(2.0));
        for (index, session) in sessions.iter().enumerate() {
            rows = rows.child(telemetry_context_row(session, index == 0));
        }
        if sessions.is_empty() {
            rows = rows.child(telemetry_text(
                "Sin sesiones indexadas.",
                12.0,
                400,
                orbit::INK_3,
            ));
        }

        div()
            .flex_1()
            .min_h_0()
            .flex()
            .flex_col()
            .pt(px(19.0))
            .child(
                div()
                    .flex()
                    .items_center()
                    .justify_between()
                    .px(px(9.0))
                    .pb(px(11.0))
                    .child(orbit::eyebrow("Sesiones"))
                    .child(telemetry_mono(sessions.len().to_string(), 11.0, 400, orbit::INK_4)),
            )
            .child(rows)
            .child(
                telemetry_text(
                    "Fuente: archivos locales de LMU indexados en DuckDB (ADR 0005). El puente todavía no publica sesiones.",
                    11.0,
                    400,
                    orbit::INK_MUTED,
                )
                .line_height(px(16.5))
                .mt_auto()
                .pb(px(2.0)),
            )
    }

    pub fn new(root: PathBuf, exe: PathBuf) -> Self {
        Self {
            root,
            exe,
            files: Vec::new(),
            selected: None,
            laps: Vec::new(),
            pair: [None, None],
            watermark: 0,
            charts: Charts::default(),
            status: "Carga el directorio de grabaciones nativas. Sin datos de demostración.".into(),
            recording_status: String::new(),
            busy: false,
            job: None,
            reference: TelemetryReference::Best,
            #[cfg(feature = "parity-capture")]
            demo: telemetry_demo_capture().then(load_demo_session),
        }
    }

    fn begin(&mut self) -> Cancel {
        self.job = None; // Cancela la petición anterior; no deja dos lectores activos.
        let cancel = Arc::new(AtomicBool::new(false));
        self.job = Some(Job(cancel.clone()));
        self.busy = true;
        self.charts = Charts::default();
        cancel
    }

    pub(crate) fn refresh(&mut self, cx: &mut Context<Self>) {
        if self.busy {
            return;
        }
        let root = self.root.clone();
        self.begin();
        self.selected = None;
        self.recording_status.clear();
        self.laps.clear();
        self.pair = [None, None];
        self.status = "Buscando grabaciones…".into();
        let task = cx
            .background_executor()
            .spawn(async move { recordings(&root) });
        cx.spawn(async move |this, cx| {
            let result = task.await;
            if let Err(error) = this.update(cx, |this, cx| {
                this.busy = false;
                this.job = None;
                match result {
                    Ok(files) => {
                        this.status = if files.is_empty() {
                            "Sin grabaciones nativas en este directorio".into()
                        } else {
                            format!("{} grabaciones; selecciona una para leerla", files.len())
                        };
                        this.files = files;
                    }
                    Err(error) => {
                        this.files.clear();
                        this.status = error;
                    }
                }
                cx.notify();
            }) {
                eprintln!("cerrar análisis: {error}");
            }
        })
        .detach();
        cx.notify();
    }

    pub(crate) fn cancel(&mut self) {
        self.job = None;
    }

    fn open(&mut self, path: PathBuf, cx: &mut Context<Self>) {
        if self.busy {
            return;
        }
        let cancel = self.begin();
        self.selected = Some(path.clone());
        self.recording_status.clear();
        self.laps.clear();
        self.pair = [None, None];
        self.status = "Leyendo resúmenes por páginas…".into();
        let exe = self.exe.clone();
        let task = cx.background_executor().spawn(async move {
            let mut reader = Reader::open(&exe, &path, cancel)?;
            let (total, laps) = reader.summaries()?;
            Ok::<_, String>((
                total,
                laps,
                reader.watermark,
                reader.finished,
                reader.attempted,
            ))
        });
        cx.spawn(async move |this, cx| {
            let result = task.await;
            if let Err(error) = this.update(cx, |this, cx| {
                this.busy = false;
                this.job = None;
                match result {
                    Ok((total, laps, watermark, finished, attempted)) => {
                        let retained = laps.len();
                        this.recording_status = format!("Últimos {retained} de {total} segmentos de vuelta · watermark {watermark} · {}",
                            if finished { format!("productor finalizado; {} chunks perdidos en cola final", attempted.saturating_sub(watermark)) }
                            else { "cierre del productor sin confirmar; pérdida final desconocida".into() });
                        this.laps = laps;
                        this.watermark = watermark;
                        this.status = if retained == 0 { "Sin vueltas grabadas".into() } else { "Selecciona vueltas A y B para comparar".into() };
                    }
                    Err(error) => this.status = error,
                }
                cx.notify();
            }) { eprintln!("cerrar análisis: {error}"); }
        }).detach();
        cx.notify();
    }

    fn choose(&mut self, side: usize, index: usize, cx: &mut Context<Self>) {
        if self.busy {
            return;
        }
        self.pair[side] = Some(index);
        self.charts = Charts::default();
        let [Some(a), Some(b)] = self.pair else {
            cx.notify();
            return;
        };
        let Some((a, b)) = self.laps.get(a).zip(self.laps.get(b)) else {
            self.pair = [None, None];
            cx.notify();
            return;
        };
        let (a, b) = (a.clone(), b.clone());
        let Some(path) = self.selected.clone() else {
            return;
        };
        let cancel = self.begin();
        let exe = self.exe.clone();
        let watermark = self.watermark;
        let allow_delta = !a.gap && !b.gap;
        self.status = "Cargando muestras de A y B…".into();
        let task = cx.background_executor().spawn(async move {
            let mut reader = Reader::open(&exe, &path, cancel)?;
            if reader.watermark != watermark {
                return Err("La grabación cambió; recarga sus resúmenes".into());
            }
            let samples_a = reader.samples(&a)?;
            let samples_b = reader.samples(&b)?;
            project_laps(&a, &b, &samples_a, &samples_b)
        });
        cx.spawn(async move |this, cx| {
            let result = task.await;
            if let Err(error) = this.update(cx, |this, cx| {
                this.busy = false;
                this.job = None;
                match result {
                    Ok(charts) => {
                        this.status = if allow_delta { "A carmín · B gris · delta A−B (positivo: A más lento). Solo tramo observado común; no duración total de vuelta.".into() }
                            else { "A carmín · B gris · Delta no disponible: resumen con huecos. Las líneas se cortan donde falta cobertura.".into() };
                        this.charts = charts;
                    }
                    Err(error) => this.status = error,
                }
                cx.notify();
            }) { eprintln!("cerrar análisis: {error}"); }
        }).detach();
        cx.notify();
    }
}

fn stats(name: &str, signal: &Signal, scale: f64) -> String {
    let value =
        |value: Option<f64>| value.map_or_else(|| "—".into(), |v| format!("{:.1}", v * scale));
    format!(
        "{name}: min {} · media {} · max {} · fiable {} / estimado {} / obsoleto {} / ausente {}",
        value(signal.min),
        value(signal.mean),
        value(signal.max),
        signal.reliable,
        signal.estimated,
        signal.stale,
        signal.unavailable
    )
}

fn chart(
    title: &'static str,
    series: [Vec<Point>; 2],
    distance_range: Option<(f64, f64)>,
    fixed: Option<(f64, f64)>,
) -> gpui::Div {
    let points: Vec<_> = series.iter().flatten().collect();
    if points.is_empty() {
        return orbit::card(title)
            .child(orbit::card_body().child(orbit::callout("Sin muestras fiables comparables")));
    }
    let measured_min = points
        .iter()
        .map(|p| p.distance)
        .fold(f64::INFINITY, f64::min);
    let measured_max = points
        .iter()
        .map(|p| p.distance)
        .fold(f64::NEG_INFINITY, f64::max);
    let (x_min, x_max) = match distance_range {
        Some(range) => range,
        None => (measured_min, measured_max),
    };
    let (y_min, y_max) = match fixed {
        Some(range) => range,
        None => (
            points.iter().map(|p| p.value).fold(0.0, f64::min),
            points.iter().map(|p| p.value).fold(0.0, f64::max),
        ),
    };
    orbit::card(title)
        .child(orbit::card_body().child(telemetry_text(
            format!("{x_min:.0}–{x_max:.0} m · {y_min:.2}–{y_max:.2}"),
            12.0,
            400,
            orbit::INK_3,
        )))
        .child(
            canvas(
                |_, _, _| (),
                move |bounds, (), window, _| {
                    let mut axes = PathBuilder::stroke(px(1.0));
                    axes.move_to(bounds.origin);
                    axes.line_to(point(bounds.origin.x, bounds.bottom()));
                    axes.line_to(point(bounds.right(), bounds.bottom()));
                    if let Ok(path) = axes.build() {
                        window.paint_path(path, rgb(orbit::INK_3));
                    }
                    let zero = ((0.0 - y_min) / (y_max - y_min).max(0.001)).clamp(0.0, 1.0);
                    #[allow(clippy::cast_possible_truncation)]
                    let zero_y = bounds.bottom() - bounds.size.height * zero as f32;
                    let mut baseline = PathBuilder::stroke(px(1.0));
                    baseline.move_to(point(bounds.origin.x, zero_y));
                    baseline.line_to(point(bounds.right(), zero_y));
                    if let Ok(path) = baseline.build() {
                        window.paint_path(path, rgb(orbit::INK_MUTED));
                    }
                    for (line, color) in series.iter().zip([orbit::CARMINE, orbit::INK_2]) {
                        let mut path = PathBuilder::stroke(px(1.5));
                        let mut previous = None;
                        for p in line {
                            // Valores normalizados acotados; cast f64→f32 solo para píxeles.
                            let x =
                                ((p.distance - x_min) / (x_max - x_min).max(1.0)).clamp(0.0, 1.0);
                            let y =
                                ((p.value - y_min) / (y_max - y_min).max(0.001)).clamp(0.0, 1.0);
                            #[allow(clippy::cast_possible_truncation)]
                            let position = point(
                                bounds.origin.x + bounds.size.width * x as f32,
                                bounds.bottom() - bounds.size.height * y as f32,
                            );
                            if previous == Some(p.segment) {
                                path.line_to(position);
                            } else {
                                path.move_to(position);
                                window.paint_quad(gpui::fill(
                                    gpui::Bounds::new(position, gpui::size(px(2.0), px(2.0))),
                                    rgb(color),
                                ));
                            }
                            previous = Some(p.segment);
                        }
                        match path.build() {
                            Ok(path) => window.paint_path(path, rgb(color)),
                            Err(error) => eprintln!("gráfica: {error}"),
                        }
                    }
                },
            )
            .w_full()
            .h(px(orbit::CONTROL_H * 3.0)),
        )
}

#[derive(Clone, Copy, PartialEq, Eq)]
enum TelemetryReference {
    Best,
    Session,
    Pro,
}

impl TelemetryReference {
    const ALL: [(Self, &'static str); 3] = [
        (Self::Best, "vs mejor propia"),
        (Self::Session, "vs mejor sesión"),
        (Self::Pro, "vs referencia Vantare"),
    ];

    #[cfg(feature = "parity-capture")]
    fn scale(self) -> f64 {
        match self {
            Self::Best => 1.0,
            Self::Session => 0.85,
            Self::Pro => 1.6,
        }
    }
}

fn telemetry_mono(
    content: impl Into<gpui::SharedString>,
    size: f32,
    weight: u16,
    color: u32,
) -> gpui::Div {
    div()
        .text_size(px(size))
        .font_family("Cascadia Code")
        .font_weight(FontWeight(f32::from(weight)))
        .line_height(px(size * 1.5))
        .text_color(rgb(color))
        .child(content.into())
}

fn telemetry_text(
    content: impl Into<gpui::SharedString>,
    size: f32,
    weight: u16,
    color: u32,
) -> gpui::Div {
    // Solo existen estas siete familias estáticas; W690/W640 caían en Segoe UI.
    let family_weight = match weight {
        0..=449 => 400,
        450..=549 => 500,
        550..=624 => 600,
        625..=674 => 650,
        675..=724 => 700,
        725..=774 => 750,
        _ => 800,
    };
    orbit::text(content, size, family_weight, color)
        .font_weight(FontWeight(400.0))
        .line_height(px(size * 1.5))
}

/// GPUI no expone letter-spacing; conserva el espaciado del contrato CSS.
fn telemetry_tracked(content: &str, size: f32, weight: u16, color: u32, spacing: f32) -> gpui::Div {
    use vantare_ui::efficiency::text;
    let content = content.to_owned();
    let line_height = size * 1.5;
    div().h(px(line_height)).child(
        canvas(
            |_, _, _| (),
            move |bounds, (), window, cx| {
                text::draw(
                    window,
                    cx,
                    &content,
                    f32::from(bounds.origin.x),
                    text::baseline(
                        f32::from(bounds.origin.y),
                        f32::from(bounds.size.height),
                        size,
                    ),
                    &text::ink(size, f32::from(weight), spacing / size, rgb(color).into()),
                );
            },
        )
        .w_full()
        .h_full(),
    )
}

fn telemetry_surface(
    title: &str,
    meta: gpui::Div,
    actions: Option<gpui::Div>,
    body: impl IntoElement,
    fill: bool,
) -> gpui::Div {
    div()
        .flex()
        .flex_col()
        .min_w_0()
        .min_h_0()
        .overflow_hidden()
        .when(fill, gpui::Styled::flex_1)
        .bg(rgba(0x10_11_14_c9))
        .border_1()
        .border_color(rgba(orbit::LINE))
        .rounded(px(orbit::RADIUS))
        .child(
            div()
                .min_h(px(60.0))
                .flex_none()
                .px(px(20.0))
                .py(px(13.0))
                .flex()
                .items_center()
                .gap(px(12.0))
                .border_b_1()
                .border_color(rgba(0xffff_ff0d))
                .child(
                    telemetry_tracked(title, 15.0, 700, orbit::INK, -0.15)
                        .flex_1()
                        .min_w_0()
                        .whitespace_nowrap()
                        .text_ellipsis(),
                )
                .child(meta.flex_none())
                .when_some(actions, |header, actions| header.child(actions.flex_none())),
        )
        .child(
            div()
                .id(gpui::SharedString::from(format!("telemetry-body-{title}")))
                .min_h_0()
                .when(fill, |body| body.flex_1().overflow_y_scroll())
                .pl(px(21.0))
                .pr(px(if fill { 31.0 } else { 21.0 }))
                .py(px(21.0))
                .child(body),
        )
}

fn telemetry_empty(message: &str) -> gpui::Div {
    telemetry_text(message.to_owned(), 12.0, 400, orbit::INK_3).line_height(px(18.6))
}

fn telemetry_note(title: Option<&str>, message: &str) -> gpui::Div {
    use vantare_ui::efficiency::text;
    let title = title.map(str::to_owned);
    let message = message.to_owned();
    let note = canvas(
        |_, _, _| (),
        move |bounds, (), window, cx| {
            let mut x = f32::from(bounds.origin.x);
            let baseline = text::baseline(f32::from(bounds.origin.y), 18.0, 12.0);
            if let Some(title) = title.as_ref() {
                let ink = text::ink(12.0, 750.0, 0.0, rgb(orbit::BRONZE).into());
                text::draw(window, cx, title, x, baseline, &ink);
                x += text::width(window, title, &ink) - 1.0;
            }
            let ink = text::ink(12.0, 400.0, 0.004, rgb(orbit::INK_3).into());
            let message = text::fit(window, &message, &ink, f32::from(bounds.right()) - x);
            text::draw(window, cx, &message, x, baseline, &ink);
        },
    )
    .w_full()
    .h(px(18.0));

    div()
        .flex_none()
        .mr(px(-2.0))
        .mt(px(14.0))
        .px(px(17.0))
        .py(px(13.0))
        .border_1()
        .border_color(rgba(0xff9b_5721))
        .rounded(px(14.0))
        .bg(linear_gradient(
            110.0,
            linear_color_stop(rgba(0xff9b_570f), 0.0),
            linear_color_stop(rgba(0xd52f_4905), 1.0),
        ))
        .child(note)
}

fn telemetry_stat(
    label: &str,
    value: &str,
    unit: Option<&str>,
    sub: &str,
    value_color: u32,
    sectors: bool,
) -> gpui::Div {
    let value_row = if sectors {
        let mut row = div().flex().items_baseline().gap(px(10.0)).mt(px(6.0));
        for (sector, color) in [("S1", orbit::INK_3), ("S2", orbit::RED), ("S3", orbit::RED)] {
            row = row.child(telemetry_mono(sector, 21.0, 700, color));
        }
        row
    } else {
        let mut row = div()
            .flex()
            .items_baseline()
            .gap(px(6.0))
            .mt(px(6.0))
            .whitespace_nowrap()
            .child(telemetry_mono(value.to_owned(), 21.0, 700, value_color).line_height(px(33.0)));
        if let Some(unit) = unit {
            row = row.child(telemetry_text(unit.to_owned(), 12.0, 400, orbit::INK_3));
        }
        row
    };

    div()
        .flex_1()
        .flex_grow(0.998)
        .min_w_0()
        .px(px(18.0))
        .py(px(14.0))
        .pb(px(15.0))
        .border_1()
        .border_color(rgba(orbit::LINE))
        .rounded(px(orbit::RADIUS))
        .bg(rgba(0x10_11_14_c9))
        .child(telemetry_tracked(
            &label.to_uppercase(),
            11.0,
            700,
            orbit::INK_3,
            0.44,
        ))
        .child(value_row)
        .child(
            telemetry_text(sub.to_owned(), 11.5, 400, orbit::INK_4)
                .mt(px(4.0))
                .overflow_hidden()
                .whitespace_nowrap()
                .text_ellipsis(),
        )
}

fn telemetry_segment(
    id: &'static str,
    label: &'static str,
    active: bool,
    disabled: bool,
    click: impl Fn(&mut Analysis, &mut Context<Analysis>) + 'static,
    cx: &Context<Analysis>,
) -> gpui::Stateful<gpui::Div> {
    div()
        .id(id)
        .h(px(29.0))
        .px(px(12.0))
        .flex()
        .items_center()
        .rounded(px(orbit::RADIUS_CHIP))
        .text_size(px(orbit::SECONDARY))
        .font_family("Inter W650")
        .font_weight(FontWeight(400.0))
        .line_height(px(orbit::SECONDARY * 1.5))
        .text_color(rgb(if active { orbit::INK } else { orbit::INK_4 }))
        .when(active, |button| {
            button
                .bg(rgba(0xd52f_4929))
                .border_1()
                .border_color(rgba(0xf047_5538))
        })
        .when(!active, |button| button.text_color(rgb(orbit::INK_4)))
        .when(disabled, |button| button.opacity(0.45))
        .when(!disabled, |button| {
            button
                .cursor_pointer()
                .on_click(cx.listener(move |this, _, _, cx| click(this, cx)))
        })
        .child(label)
}

fn telemetry_segment_group() -> gpui::Div {
    div()
        .flex()
        .items_center()
        .gap(px(2.5))
        .p(px(4.0))
        .border_1()
        .border_color(rgba(0xffff_ff0f))
        .rounded(px(orbit::RADIUS_CONTROL))
        .bg(rgba(0xffff_ff05))
}

#[cfg(feature = "parity-capture")]
fn demo_tone(delta: f64) -> u32 {
    if delta > 0.025 {
        orbit::RED
    } else if delta < -0.025 {
        orbit::GREEN
    } else {
        orbit::INK_3
    }
}

#[cfg(feature = "parity-capture")]
#[allow(clippy::cast_possible_truncation)]
fn demo_track_map(model: &DemoModel, scale: f64) -> gpui::Div {
    use vantare_ui::efficiency::text;
    let track = model.track.clone();
    let min_x = track.iter().map(|p| p.0).fold(f64::INFINITY, f64::min) - 34.0;
    let min_y = track.iter().map(|p| p.1).fold(f64::INFINITY, f64::min) - 34.0;
    let width = track.iter().map(|p| p.0).fold(f64::NEG_INFINITY, f64::max) - min_x + 34.0;
    let height = track.iter().map(|p| p.1).fold(f64::NEG_INFINITY, f64::max) - min_y + 34.0;
    div().w_full().h(px(220.0)).flex_none().child(
        canvas(
            |_, _, _| (),
            move |bounds, (), window, cx| {
                let scale_x = (bounds.size.width / px(width as f32))
                    .min(bounds.size.height / px(height as f32));
                let map_width = px(width as f32) * scale_x;
                let map_height = px(height as f32) * scale_x;
                let origin = point(
                    bounds.origin.x + (bounds.size.width - map_width) / 2.0,
                    bounds.origin.y + (bounds.size.height - map_height) / 2.0,
                );
                let position = |x: f64, y: f64| {
                    point(
                        origin.x + px(((x - min_x) as f32) * scale_x),
                        origin.y + px(((y - min_y) as f32) * scale_x),
                    )
                };
                let mut base = PathBuilder::stroke(px(15.0 * scale_x));
                for (index, (x, y)) in track.iter().enumerate() {
                    let at = position(*x, *y);
                    if index == 0 {
                        base.move_to(at);
                    } else {
                        base.line_to(at);
                    }
                }
                if let Some((x, y)) = track.first() {
                    base.line_to(position(*x, *y));
                }
                if let Ok(path) = base.build() {
                    window.paint_path(path, rgba(0xffff_ff14));
                }

                for (name, delta, at) in DEMO_CORNERS {
                    let start = ((at - 0.045) * track.len() as f64).round() as usize;
                    let end = ((at + 0.045) * track.len() as f64).round() as usize;
                    let mut segment = PathBuilder::stroke(px(9.0 * scale_x));
                    for index in start..=end {
                        if let Some((x, y)) = track.get(index % track.len()) {
                            let at = position(*x, *y);
                            if index == start {
                                segment.move_to(at);
                            } else {
                                segment.line_to(at);
                            }
                        }
                    }
                    if let Ok(path) = segment.build() {
                        window.paint_path(path, rgb(demo_tone(delta * scale)));
                    }
                    // El SVG usa extremos redondos; PathBuilder los deja planos.
                    let radius = px(4.5 * scale_x);
                    for index in [start, end] {
                        if let Some((x, y)) = track.get(index % track.len()) {
                            let at = position(*x, *y);
                            window.paint_quad(
                                gpui::fill(
                                    gpui::Bounds::new(
                                        point(at.x - radius, at.y - radius),
                                        gpui::size(radius * 2.0, radius * 2.0),
                                    ),
                                    rgb(demo_tone(delta * scale)),
                                )
                                .corner_radii(radius),
                            );
                        }
                    }
                    let index = (at * track.len() as f64).round() as usize;
                    if let Some((x, y)) = track.get(index % track.len()) {
                        let at = position(x + 10.0, y - 8.0);
                        text::draw(
                            window,
                            cx,
                            name,
                            f32::from(at.x),
                            f32::from(at.y),
                            &text::ink(10.0 * scale_x, 700.0, 0.0, rgb(orbit::INK_2).into()),
                        );
                    }
                }
                if let (Some((x, y)), Some((next_x, next_y))) = (track.first(), track.get(1)) {
                    let angle = (next_y - y).atan2(next_x - x) + std::f64::consts::FRAC_PI_2;
                    let mut start_line = PathBuilder::stroke(px(2.0 * scale_x));
                    start_line.move_to(position(x + angle.cos() * 10.0, y + angle.sin() * 10.0));
                    start_line.line_to(position(x - angle.cos() * 10.0, y - angle.sin() * 10.0));
                    if let Ok(path) = start_line.build() {
                        window.paint_path(path, rgb(orbit::INK));
                    }
                }
            },
        )
        .w_full()
        .h_full(),
    )
}

#[cfg(feature = "parity-capture")]
fn demo_legend_item(text: &'static str, tone: u32) -> gpui::Div {
    div()
        .flex()
        .items_center()
        .gap(px(6.0))
        .child(div().w(px(9.0)).h(px(3.0)).rounded(px(2.0)).bg(rgb(tone)))
        .child(telemetry_text(text, 10.5, 400, orbit::INK_4))
}

#[cfg(feature = "parity-capture")]
fn demo_map_legend() -> gpui::Div {
    div()
        .flex()
        .h(px(15.0))
        .items_center()
        .gap(px(14.0))
        .mt(px(12.0))
        .child(demo_legend_item("ganas", orbit::GREEN))
        .child(demo_legend_item("neutro", orbit::INK_3))
        .child(demo_legend_item("pierdes", orbit::RED))
        .child(
            telemetry_text("clic en una curva para saltar", 10.5, 400, orbit::INK_MUTED).ml_auto(),
        )
}

#[cfg(feature = "parity-capture")]
fn demo_trace(
    title: &'static str,
    unit: &'static str,
    height: f32,
    channel: &'static str,
    mine: Vec<f64>,
    reference: Vec<f64>,
    extra: Vec<f64>,
    delta: bool,
) -> gpui::Div {
    let mut values = mine.clone();
    values.extend(reference.iter().copied());
    values.extend(extra.iter().copied());
    let (minimum, maximum) = match channel {
        "pedals" => (0.0, 100.0),
        "steer" => {
            let bound = values
                .iter()
                .map(|value| value.abs())
                .fold(1.0_f64, f64::max);
            (-bound, bound)
        }
        "delta" => {
            let bound = values
                .iter()
                .map(|value| value.abs())
                .fold(0.6_f64, f64::max)
                * 1.15;
            (-bound, bound)
        }
        _ => {
            let max = values.iter().copied().fold(f64::NEG_INFINITY, f64::max);
            let min = values.iter().copied().fold(f64::INFINITY, f64::min);
            let padding = (max - min) * 0.08;
            if padding == 0.0 {
                (min - 1.0, max + 1.0)
            } else {
                (min - padding, max + padding)
            }
        }
    };
    let plot_title = telemetry_text(title, 10.5, 700, orbit::INK_2);
    let plot_unit = telemetry_text(unit, 10.5, 500, orbit::INK_3).ml(px(4.0));
    let mut trace = div()
        .relative()
        .w_full()
        .h(px(height))
        .overflow_hidden()
        .border_1()
        .border_color(rgba(orbit::LINE))
        .rounded(px(8.0))
        .bg(rgba(0xffff_ff05))
        .child(
            canvas(
                |_, _, _| (),
                move |bounds, (), window, _| {
                    let x_for = |index: usize, length: usize| {
                        if length <= 1 {
                            bounds.origin.x
                        } else {
                            bounds.origin.x
                                + bounds.size.width
                                    * ((index as f32 / (length - 1) as f32 * 10_000.0).round()
                                        / 10_000.0)
                        }
                    };
                    let y_for = |value: f64| {
                        let span = (maximum - minimum).max(f64::EPSILON);
                        let fraction = ((value - minimum) / span).clamp(0.0, 1.0);
                        // Trace.tsx redondea en el viewBox antes de escalar el SVG.
                        let y = 4.0 + (height - 8.0) * (1.0 - fraction as f32);
                        bounds.origin.y + bounds.size.height * ((y * 10.0).round() / 10.0 / height)
                    };
                    for (_, _, at) in DEMO_CORNERS {
                        let center = bounds.origin.x + bounds.size.width * at as f32;
                        let band_width = bounds.size.width * 0.06;
                        let x = (center - band_width / 2.0).max(bounds.origin.x);
                        let right = (center + band_width / 2.0).min(bounds.right());
                        window.paint_quad(gpui::fill(
                            gpui::Bounds::new(
                                point(x, bounds.origin.y),
                                gpui::size(right - x, bounds.size.height),
                            ),
                            rgba(0xffff_ff09),
                        ));
                    }
                    if channel == "speed" || channel == "pedals" {
                        for fraction in [0.25_f32, 0.5, 0.75] {
                            let y = bounds.origin.y + bounds.size.height * fraction;
                            let mut grid = PathBuilder::stroke(px(1.0));
                            grid.move_to(point(bounds.origin.x, y));
                            grid.line_to(point(bounds.right(), y));
                            if let Ok(path) = grid.build() {
                                window.paint_path(path, rgba(0xffff_ff0d));
                            }
                        }
                    } else {
                        let y = y_for(0.0);
                        let mut zero = PathBuilder::stroke(px(1.0)).dash_array(&[px(3.0), px(4.0)]);
                        zero.move_to(point(bounds.origin.x, y));
                        zero.line_to(point(bounds.right(), y));
                        if let Ok(path) = zero.build() {
                            window.paint_path(path, rgba(0xffff_ff24));
                        }
                    }

                    if delta {
                        for (positive, color) in [(true, 0xf047_5540), (false, 0x78d6_8b40)] {
                            let zero = y_for(0.0);
                            let mut area = PathBuilder::fill();
                            area.move_to(point(bounds.origin.x, zero));
                            for (index, value) in mine.iter().enumerate() {
                                let value = if positive {
                                    value.max(0.0)
                                } else {
                                    value.min(0.0)
                                };
                                area.line_to(point(x_for(index, mine.len()), y_for(value)));
                            }
                            area.line_to(point(bounds.right(), zero));
                            area.close();
                            if let Ok(path) = area.build() {
                                window.paint_path(path, rgba(color));
                            }
                        }
                    }

                    let mut paint_series = |series: &[f64], width: f32, color: gpui::Hsla| {
                        let mut line = PathBuilder::stroke(px(width));
                        for (index, value) in series.iter().enumerate() {
                            let point = point(x_for(index, series.len()), y_for(*value));
                            if index == 0 {
                                line.move_to(point);
                            } else {
                                line.line_to(point);
                            }
                        }
                        if let Ok(path) = line.build() {
                            window.paint_path(path, color);
                        }
                    };
                    if delta {
                        paint_series(&mine, 1.5, rgb(orbit::INK).into());
                    } else if channel == "pedals" {
                        paint_series(&mine, 1.8, rgb(orbit::GREEN).into());
                        paint_series(&extra, 1.8, rgb(orbit::RED).into());
                    } else {
                        paint_series(&reference, 1.5, orbit::tint(0x8fd6dd, 0.9));
                        paint_series(&mine, 2.0, rgb(orbit::CORAL).into());
                    }
                },
            )
            .w_full()
            .h_full(),
        )
        .child(
            div()
                .absolute()
                .top(px(4.0))
                .left(px(6.0))
                .flex()
                .items_center()
                .child(plot_title)
                .child(plot_unit),
        );
    for (name, _, position) in DEMO_CORNERS {
        trace = trace.child(
            telemetry_mono(name, 12.0, 600, orbit::INK_4)
                .absolute()
                .left(relative(position as f32 - 0.028))
                .top(px(15.0)),
        );
    }
    trace
}

#[cfg(feature = "parity-capture")]
fn demo_trace_legend() -> gpui::Div {
    div()
        .flex()
        .items_center()
        .gap(px(14.0))
        .mt(px(12.0))
        .child(demo_legend_item("tu vuelta", orbit::CORAL))
        .child(demo_legend_item("referencia", orbit::CYAN))
        .child(demo_legend_item("acelerador", orbit::GREEN))
        .child(demo_legend_item("freno", orbit::RED))
}

#[cfg(feature = "parity-capture")]
fn format_delta(value: f64, digits: usize) -> String {
    format!("{value:+.*}", digits)
}

#[cfg(feature = "parity-capture")]
fn demo_insights_view(scale: f64) -> gpui::Div {
    const INSIGHTS: [(&str, f64, u32, &str); 8] = [
        (
            "T7",
            0.18,
            1628,
            "Frenas 12 m antes y con un 15 % menos de presión; llegas al vértice 6 km/h más lento.",
        ),
        (
            "T17",
            0.16,
            3441,
            "Freno de 42 m contra 33 m de referencia; el coche entra menos girado.",
        ),
        (
            "T13",
            0.11,
            2627,
            "Doble corrección de volante a mitad de curva; pierdes tracción.",
        ),
        (
            "T15",
            0.09,
            3071,
            "Cambias a 3.ª tarde; el motor cae fuera de par en la salida.",
        ),
        (
            "T3",
            0.06,
            703,
            "Frenas 9 m antes que la referencia y sueltas el freno de golpe.",
        ),
        ("T5", 0.02, 1147, "Trazada ligeramente ancha en la salida."),
        (
            "T1",
            -0.04,
            222,
            "Buen apoyo de entrada; mantienes 3 km/h más en el vértice.",
        ),
        (
            "T10",
            -0.05,
            2146,
            "Aceleras 8 m antes en la salida; ganas hasta la recta.",
        ),
    ];

    let mut list = div().flex().flex_col().gap(px(6.0));
    for (corner, delta, meters, why) in INSIGHTS {
        let color = demo_tone(delta * scale);
        list = list.child(
            div()
                .w_full()
                .px(px(12.0))
                .py(px(10.0))
                .flex()
                .items_center()
                .gap(px(12.0))
                .rounded(px(orbit::RADIUS_CONTROL))
                .bg(rgba(0xffff_ff05))
                .child(
                    div()
                        .w(px(34.0))
                        .h(px(24.0))
                        .flex_none()
                        .flex()
                        .items_center()
                        .justify_center()
                        .rounded(px(orbit::RADIUS_CHIP))
                        .bg(rgba(0xffff_ff0d))
                        .child(telemetry_mono(corner, 10.5, 700, color)),
                )
                .child(
                    div()
                        .flex_1()
                        .min_w_0()
                        .flex()
                        .flex_col()
                        .gap(px(2.0))
                        .child(telemetry_text(
                            if delta > 0.025 {
                                format!("Pierdes tiempo en {corner}")
                            } else if delta < -0.025 {
                                format!("Ganas en {corner}")
                            } else {
                                format!("{corner} · neutro")
                            },
                            12.0,
                            640,
                            orbit::INK,
                        ))
                        .child(telemetry_text(why, 10.5, 400, orbit::INK_3).line_height(px(15.2))),
                )
                .child(
                    div()
                        .flex_none()
                        .flex()
                        .flex_col()
                        .items_end()
                        .child(telemetry_mono(
                            format_delta(delta * scale, 2),
                            12.0,
                            700,
                            color,
                        ))
                        .child(telemetry_text(
                            format!("{meters} m"),
                            10.5,
                            500,
                            orbit::INK_MUTED,
                        )),
                ),
        );
    }
    list
}

#[cfg(feature = "parity-capture")]
fn demo_traces_view(model: &DemoModel) -> gpui::Div {
    let mine = &model.mine;
    let reference = &model.reference;
    let speed = demo_trace(
        "Velocidad",
        "km/h",
        150.0,
        "speed",
        mine.iter().map(|sample| sample.speed).collect(),
        reference.iter().map(|sample| sample.speed).collect(),
        Vec::new(),
        false,
    );
    let pedals = demo_trace(
        "Acelerador / Freno",
        "%",
        100.0,
        "pedals",
        mine.iter().map(|sample| sample.throttle).collect(),
        Vec::new(),
        mine.iter().map(|sample| sample.brake).collect(),
        false,
    );
    let steer = demo_trace(
        "Volante",
        "°",
        80.0,
        "steer",
        mine.iter().map(|sample| sample.steer).collect(),
        reference.iter().map(|sample| sample.steer).collect(),
        Vec::new(),
        false,
    );
    let delta = demo_trace(
        "Delta",
        "s",
        110.0,
        "delta",
        model.delta.clone(),
        Vec::new(),
        Vec::new(),
        true,
    );
    div()
        .flex()
        .flex_col()
        .gap(px(10.0))
        .child(speed)
        .child(pedals)
        .child(steer)
        .child(delta)
        .child(demo_trace_legend())
}

impl Analysis {
    fn recordings_view(&self, cx: &Context<Self>) -> gpui::Stateful<gpui::Div> {
        let mut files = orbit::card_body()
            .id("analysis-recordings")
            .max_h(px(orbit::CONTROL_H * 4.0))
            .overflow_y_scroll();
        for (index, path) in self.files.iter().enumerate() {
            let path = path.clone();
            let name = path
                .file_name()
                .map_or_else(String::new, |name| name.to_string_lossy().into_owned());
            files = files.child(orbit::setting_row(
                &name,
                if self.selected.as_ref() == Some(&path) {
                    "Grabación seleccionada"
                } else {
                    "Grabación nativa · solo lectura"
                },
                orbit::button("open-recording", "Abrir")
                    .id(("recording", index))
                    .on_click(cx.listener(move |this, _, _, cx| this.open(path.clone(), cx))),
            ));
        }
        if self.files.is_empty() {
            files = files.child(orbit::callout(
                "Sin grabaciones disponibles. Recarga el directorio local para buscar sesiones.",
            ));
        }
        files
    }

    fn laps_view(&self, cx: &Context<Self>) -> gpui::Stateful<gpui::Div> {
        let mut laps = div()
            .id("analysis-laps")
            .gap(px(orbit::GUTTER / 2.0))
            .max_h(px(orbit::CONTROL_H * 6.0))
            .overflow_y_scroll();
        for (index, lap) in self.laps.iter().enumerate() {
            let mut choices = div().flex().gap(px(orbit::GUTTER / 4.0));
            for side in 0..2 {
                choices = choices.child(
                    orbit::button(
                        "choose-lap",
                        &format!(
                            "{}{}",
                            if side == 0 { "A" } else { "B" },
                            if self.pair[side] == Some(index) {
                                " ✓"
                            } else {
                                ""
                            }
                        ),
                    )
                    .id((if side == 0 { "lap-a" } else { "lap-b" }, index))
                    .on_click(cx.listener(move |this, _, _, cx| this.choose(side, index, cx))),
                );
            }
            laps = laps.child(
                orbit::card(&format!("Vuelta {} · coche {}", lap.lap, lap.car)).child(
                    orbit::card_body()
                        .child(orbit::setting_row(
                            &format!("Época {} · sesión {}", lap.epoch, lap.session),
                            &format!(
                                "Chunk {} · {} muestras · {}{} · ventana {}",
                                lap.first_chunk,
                                lap.samples,
                                if lap.sealed { "sellada" } else { "sin cierre" },
                                if lap.gap { " / con huecos" } else { "" },
                                lap.observed_span_s
                                    .map_or_else(|| "—".into(), |value| format!("{value:.3} s"))
                            ),
                            choices,
                        ))
                        .child(telemetry_text(
                            stats("km/h", &lap.speed, 3.6),
                            12.0,
                            400,
                            orbit::INK_2,
                        ))
                        .child(telemetry_text(
                            stats("Acelerador %", &lap.throttle, 100.0),
                            12.0,
                            400,
                            orbit::INK_2,
                        ))
                        .child(telemetry_text(
                            stats("Freno %", &lap.brake, 100.0),
                            12.0,
                            400,
                            orbit::INK_2,
                        )),
                ),
            );
        }
        laps
    }
}

impl Analysis {
    #[cfg_attr(not(feature = "parity-capture"), allow(clippy::unused_self))]
    fn is_synthetic(&self) -> bool {
        #[cfg(feature = "parity-capture")]
        {
            self.demo.as_ref().is_some_and(|result| result.is_ok())
        }
        #[cfg(not(feature = "parity-capture"))]
        {
            false
        }
    }

    #[cfg_attr(not(feature = "parity-capture"), allow(clippy::unused_self))]
    fn telemetry_title(&self) -> String {
        #[cfg(feature = "parity-capture")]
        {
            self.demo
                .as_ref()
                .and_then(|result| result.as_ref().ok())
                .map_or_else(
                    || "Sin sesión analizada".to_owned(),
                    |session| format!("{} · {}", session.track, session.car),
                )
        }
        #[cfg(not(feature = "parity-capture"))]
        {
            "Sin sesión analizada".to_owned()
        }
    }

    fn telemetry_header(&self, cx: &Context<Self>) -> gpui::Div {
        let synthetic = self.is_synthetic();
        let mut references = telemetry_segment_group();
        for (reference, label) in TelemetryReference::ALL {
            let id = match reference {
                TelemetryReference::Best => "telemetry-ref-best",
                TelemetryReference::Session => "telemetry-ref-session",
                TelemetryReference::Pro => "telemetry-ref-pro",
            };
            references = references.child(telemetry_segment(
                id,
                label,
                self.reference == reference,
                false,
                move |this, cx| {
                    this.reference = reference;
                    cx.notify();
                },
                cx,
            ));
        }
        let status = div()
            .h(px(29.0))
            .px(px(12.0))
            .flex()
            .items_center()
            .rounded_full()
            .border_1()
            .border_color(rgba(if synthetic { 0xff9b_5738 } else { 0xffff_ff12 }))
            .bg(rgba(0xffff_ff06))
            .text_size(px(10.0))
            .font_family("Inter W750")
            .font_weight(FontWeight(400.0))
            .text_color(rgb(if synthetic {
                orbit::EMBER
            } else {
                orbit::INK_3
            }))
            .child(if synthetic {
                "DATOS SINTÉTICOS"
            } else {
                "SIN SESIONES"
            });
        let actions = div()
            .flex()
            .items_center()
            .gap(px(10.0))
            .child(references)
            .child(status);

        div()
            .flex_none()
            .mr(px(-2.0))
            .flex()
            .items_end()
            .justify_between()
            .gap(px(orbit::GUTTER / 2.0))
            .child(
                div()
                    .flex_1()
                    .min_w_0()
                    .child(telemetry_tracked("ANÁLISIS POST-SESIÓN", 11.0, 800, orbit::INK_3, 0.99).relative().top(px(-2.0)))
                    .child(
                        telemetry_tracked(&self.telemetry_title(), 32.0, 700, orbit::INK, -0.3)
                            .mt(px(6.0))
                            .h(px(51.0))
                            .line_height(px(51.0)),
                    )
                    .child(
                        telemetry_text(
                            "Compara tu mejor vuelta con una referencia y te dice, curva a curva, dónde se va el tiempo y por qué.",
                            orbit::BODY,
                            400,
                            orbit::INK_2,
                        )
                        .mt(px(7.0))
                        .line_height(px(20.9)),
                    ),
            )
            .child(actions)
    }

    fn telemetry_stats(&self) -> gpui::Div {
        let mut row = div()
            .flex_none()
            .mr(px(-2.0))
            .flex()
            .gap(px(21.0))
            .mt(px(16.0));
        #[cfg(feature = "parity-capture")]
        if self.is_synthetic() {
            let model = DemoModel::new();
            let scale = self.reference.scale();
            let total = match model.delta.last() {
                Some(value) => *value * scale,
                None => 0.0,
            };
            let sectors = model
                .sectors
                .iter()
                .map(|value| format_delta(value * scale, 2))
                .collect::<Vec<_>>()
                .join(" · ");
            row = row
                .child(
                    telemetry_stat(
                        "Vuelta analizada",
                        "2:04.512",
                        None,
                        "vuelta 9 de 12 · óptima teórica 2:04.101",
                        orbit::INK,
                        false,
                    )
                    .flex_grow(1.002),
                )
                .child(telemetry_stat(
                    "Delta a referencia",
                    &format_delta(total, 3),
                    Some("s"),
                    "referencia 2:03.980 · vuelta 4",
                    orbit::CORAL,
                    false,
                ))
                .child(
                    telemetry_stat("Sectores", "", None, &sectors, orbit::INK, true)
                        .flex_grow(1.002),
                )
                .child(telemetry_stat(
                    "Consistencia",
                    "94",
                    Some("%"),
                    "8 de 12 vueltas a ±0.5 s",
                    orbit::GREEN,
                    false,
                ));
        }
        if !self.is_synthetic() {
            for (index, label) in [
                "Vuelta analizada",
                "Delta a referencia",
                "Sectores",
                "Consistencia",
            ]
            .into_iter()
            .enumerate()
            {
                row = row.child(
                    telemetry_stat(label, "—", None, "sin datos de sesión", orbit::INK, false)
                        .flex_grow(if index % 2 == 0 { 1.002 } else { 0.998 }),
                );
            }
        }
        row
    }

    #[cfg_attr(not(feature = "parity-capture"), allow(clippy::unused_self))]
    fn telemetry_bodies(&self) -> (gpui::Div, gpui::Div, gpui::Div) {
        #[cfg(feature = "parity-capture")]
        match self.demo.as_ref() {
            Some(Ok(_)) => {
                let model = DemoModel::new();
                let scale = self.reference.scale();
                let map = div()
                    .flex()
                    .flex_col()
                    .child(demo_track_map(&model, scale))
                    .child(demo_map_legend());
                return (map, demo_insights_view(scale), demo_traces_view(&model));
            }
            Some(Err(error)) => {
                return (
                    telemetry_empty(error),
                    telemetry_empty("Sin curvas que analizar todavía."),
                    telemetry_empty("Las trazas se dibujan cuando haya una vuelta grabada."),
                );
            }
            None => {}
        }
        (
            telemetry_empty("El mapa se dibuja cuando haya una vuelta grabada."),
            telemetry_empty(
                "No hay sesiones disponibles · importa archivos locales de LMU cuando el flujo esté disponible.",
            ),
            telemetry_empty("Las trazas se dibujan cuando haya una vuelta grabada."),
        )
    }

    fn telemetry_recordings(&self, cx: &Context<Self>) -> Option<gpui::Div> {
        if self.is_synthetic() || self.files.is_empty() {
            return None;
        }
        let refresh = orbit::button(
            "analysis-refresh",
            if self.busy {
                "Leyendo…"
            } else {
                "Recargar grabaciones"
            },
        )
        .on_click(cx.listener(|this, _, _, cx| this.refresh(cx)));
        let mut recordings = div()
            .flex()
            .flex_col()
            .gap(px(orbit::GUTTER / 2.0))
            .child(orbit::setting_row(
                "Directorio local",
                &self.root.display().to_string(),
                refresh,
            ))
            .child(orbit::callout(self.status.clone()));
        if !self.recording_status.is_empty() {
            recordings = recordings.child(orbit::callout(self.recording_status.clone()));
        }
        recordings = recordings.child(self.recordings_view(cx));
        let mut insights = div()
            .flex()
            .flex_col()
            .gap(px(orbit::GUTTER / 2.0))
            .child(recordings);
        if !self.laps.is_empty() {
            insights = insights.child(self.laps_view(cx));
        }
        Some(insights)
    }

    fn telemetry_traces(&self, placeholder: gpui::Div) -> gpui::Div {
        if self.charts.speed[0].is_empty() && self.charts.speed[1].is_empty() {
            return placeholder;
        }
        div()
            .flex()
            .flex_col()
            .gap(px(orbit::GUTTER / 2.0))
            .child(chart(
                "Velocidad km/h",
                self.charts.speed.clone(),
                self.charts.distance_range,
                None,
            ))
            .child(chart(
                "Acelerador %",
                self.charts.throttle.clone(),
                self.charts.distance_range,
                Some((0.0, 100.0)),
            ))
            .child(chart(
                "Freno %",
                self.charts.brake.clone(),
                self.charts.distance_range,
                Some((0.0, 100.0)),
            ))
            .child(chart(
                "Delta A−B s",
                [self.charts.delta.clone(), Vec::new()],
                self.charts.distance_range,
                None,
            ))
    }

    fn telemetry_columns(
        map_body: gpui::Div,
        insight_body: gpui::Div,
        trace_body: gpui::Div,
        cx: &Context<Self>,
    ) -> gpui::Div {
        let mut axis = telemetry_segment_group();
        axis = axis
            .child(telemetry_segment(
                "telemetry-axis-distance",
                "Distancia",
                true,
                false,
                |_, _| {},
                cx,
            ))
            .child(telemetry_segment(
                "telemetry-axis-time",
                "Tiempo",
                false,
                true,
                |_, _| {},
                cx,
            ));

        let map = telemetry_surface(
            "Mapa",
            telemetry_mono("color = tiempo ganado / perdido", 12.0, 400, orbit::INK_3),
            None,
            map_body,
            false,
        );
        let insights = telemetry_surface(
            "Dónde se va el tiempo",
            telemetry_mono("ordenado por pérdida", 12.0, 400, orbit::INK_3),
            None,
            insight_body,
            true,
        );
        let traces = telemetry_surface(
            "Trazas",
            telemetry_mono("— m", 12.0, 400, orbit::INK_3),
            Some(axis),
            trace_body,
            true,
        );
        div()
            .flex_1()
            .min_h_0()
            .mr(px(-2.0))
            .flex()
            .gap(px(21.0))
            .mt(px(16.0))
            .child(
                div()
                    .w(px(400.0))
                    .flex_none()
                    .flex()
                    .flex_col()
                    .min_h_0()
                    .gap(px(21.0))
                    .child(map)
                    .child(insights),
            )
            .child(traces)
    }

    fn telemetry_note(&self) -> gpui::Div {
        if self.is_synthetic() {
            telemetry_note(
                Some("Datos sintéticos "),
                "el circuito, los canales y los insights los genera la propia pantalla para enseñar la estructura. No son una sesión tuya.",
            )
        } else {
            telemetry_note(
                None,
                "No hay sesiones disponibles · importa archivos locales de LMU cuando el flujo esté disponible.",
            )
        }
    }
}

impl Render for Analysis {
    fn render(&mut self, window: &mut Window, cx: &mut Context<Self>) -> impl IntoElement {
        let (map, mut insights, traces) = self.telemetry_bodies();
        if let Some(recordings) = self.telemetry_recordings(cx) {
            insights = recordings;
        }
        let columns = Self::telemetry_columns(map, insights, self.telemetry_traces(traces), cx);

        div()
            .id("analysis")
            .w_full()
            // La shell desplaza el contenido; la rejilla necesita un alto finito
            // para reservar la nota inferior y desplazar solo las trazas/insights.
            .h((window.viewport_size().height - px(orbit::TOPBAR_H + orbit::GUTTER)).max(px(0.0)))
            .max_w(px(1508.0))
            .mx_auto()
            .relative()
            .left(px(-1.0))
            .pb(px(20.0))
            .flex()
            .flex_col()
            .child(self.telemetry_header(cx))
            .child(self.telemetry_stats())
            .child(columns)
            .child(self.telemetry_note())
    }
}
