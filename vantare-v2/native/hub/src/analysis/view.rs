use super::{
    model::{Charts, Lap, Point, Signal, project_laps},
    reader::{Cancel, Reader, recordings},
};
use crate::shell::button;
use gpui::{
    Context, IntoElement, PathBuilder, Render, Window, canvas, div, point, prelude::*, px, rgb,
};
use std::{
    path::PathBuf,
    sync::{
        Arc,
        atomic::{AtomicBool, Ordering},
    },
};

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
}

impl Analysis {
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
                        this.status = if allow_delta { "A azul · B naranja · delta A−B (positivo: A más lento). Solo tramo observado común; no duración total de vuelta.".into() }
                            else { "A azul · B naranja · Delta no disponible: resumen con huecos. Las líneas se cortan donde falta cobertura.".into() };
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
        return div().child(format!("{title}: sin muestras fiables comparables"));
    }
    let measured_min = points
        .iter()
        .map(|p| p.distance)
        .fold(f64::INFINITY, f64::min);
    let measured_max = points
        .iter()
        .map(|p| p.distance)
        .fold(f64::NEG_INFINITY, f64::max);
    let (x_min, x_max) = distance_range.unwrap_or((measured_min, measured_max));
    let (y_min, y_max) = fixed.unwrap_or_else(|| {
        (
            points.iter().map(|p| p.value).fold(0.0, f64::min),
            points.iter().map(|p| p.value).fold(0.0, f64::max),
        )
    });
    div()
        .flex()
        .flex_col()
        .child(format!(
            "{title} · {x_min:.0}–{x_max:.0} m · {y_min:.2}–{y_max:.2}"
        ))
        .child(
            canvas(
                |_, _, _| (),
                move |bounds, (), window, _| {
                    let mut axes = PathBuilder::stroke(px(1.0));
                    axes.move_to(bounds.origin);
                    axes.line_to(point(bounds.origin.x, bounds.bottom()));
                    axes.line_to(point(bounds.right(), bounds.bottom()));
                    if let Ok(path) = axes.build() {
                        window.paint_path(path, rgb(0x0066_6666));
                    }
                    let zero = ((0.0 - y_min) / (y_max - y_min).max(0.001)).clamp(0.0, 1.0);
                    #[allow(clippy::cast_possible_truncation)]
                    let zero_y = bounds.bottom() - bounds.size.height * zero as f32;
                    let mut baseline = PathBuilder::stroke(px(1.0));
                    baseline.move_to(point(bounds.origin.x, zero_y));
                    baseline.line_to(point(bounds.right(), zero_y));
                    if let Ok(path) = baseline.build() {
                        window.paint_path(path, rgb(0x0044_4444));
                    }
                    for (line, color) in series.iter().zip([0x0055_99ff, 0x00ff_aa55]) {
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
            .h(px(115.0)),
        )
}

impl Render for Analysis {
    fn render(&mut self, _: &mut Window, cx: &mut Context<Self>) -> impl IntoElement {
        let mut files = div()
            .id("analysis-recordings")
            .flex()
            .flex_col()
            .gap_1()
            .max_h(px(160.0))
            .overflow_y_scroll();
        for (index, path) in self.files.iter().enumerate() {
            let path = path.clone();
            files = files.child(
                div()
                    .id(("recording", index))
                    .role(gpui::Role::Button)
                    .tab_index(0)
                    .cursor_pointer()
                    .child(format!(
                        "{}{}",
                        if self.selected.as_ref() == Some(&path) {
                            "▶ "
                        } else {
                            ""
                        },
                        path.file_name().unwrap_or_default().to_string_lossy()
                    ))
                    .on_click(cx.listener(move |this, _, _, cx| this.open(path.clone(), cx))),
            );
        }
        let mut laps = div()
            .id("analysis-laps")
            .flex()
            .flex_col()
            .gap_2()
            .max_h(px(240.0))
            .overflow_y_scroll();
        for (index, lap) in self.laps.iter().enumerate() {
            let mut row = div().flex().gap_2().child(format!("Época {} · sesión {} · coche {} · contador vuelta {} · chunk {} · {} muestras · {}{} · ventana {}",
                lap.epoch, lap.session, lap.car, lap.lap, lap.first_chunk, lap.samples,
                if lap.sealed { "sellada" } else { "sin cierre" }, if lap.gap { " / con huecos" } else { "" },
                lap.observed_span_s.map_or_else(|| "—".into(), |v| format!("{v:.3} s"))));
            for side in 0..2 {
                row = row.child(
                    div()
                        .id((if side == 0 { "lap-a" } else { "lap-b" }, index))
                        .role(gpui::Role::Button)
                        .tab_index(0)
                        .cursor_pointer()
                        .child(format!(
                            "{}{}",
                            if side == 0 { "A" } else { "B" },
                            if self.pair[side] == Some(index) {
                                " ✓"
                            } else {
                                ""
                            }
                        ))
                        .on_click(cx.listener(move |this, _, _, cx| this.choose(side, index, cx))),
                );
            }
            laps = laps.child(
                div()
                    .flex()
                    .flex_col()
                    .child(row)
                    .child(stats("km/h", &lap.speed, 3.6))
                    .child(stats("Acelerador %", &lap.throttle, 100.0))
                    .child(stats("Freno %", &lap.brake, 100.0)),
            );
        }
        div().id("analysis").flex().flex_col().gap_2().overflow_y_scroll()
            .child(format!("Grabaciones: {} · solo lectura fuera de carrera", self.root.display()))
            .child(button("analysis-refresh", "Recargar grabaciones").on_click(cx.listener(|this, _, _, cx| this.refresh(cx))))
            .child(self.status.clone()).child(self.recording_status.clone()).child(files).child(laps)
            .child("Selecciona A y B. Medias aritméticas de muestras fiables; ventana observada no equivale a tiempo de vuelta. Máximo 1024 puntos/canal; sin 3D.")
            .child(chart("Velocidad km/h", self.charts.speed.clone(), self.charts.distance_range, None))
            .child(chart("Acelerador %", self.charts.throttle.clone(), self.charts.distance_range, Some((0.0, 100.0))))
            .child(chart("Freno %", self.charts.brake.clone(), self.charts.distance_range, Some((0.0, 100.0))))
            .child(chart("Delta A−B s", [self.charts.delta.clone(), Vec::new()], self.charts.distance_range, None))
    }
}
