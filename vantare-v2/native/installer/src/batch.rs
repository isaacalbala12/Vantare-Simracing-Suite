//! QA-only capture batch: one hidden HWND outside every monitor, `PrintWindow`
//! frames and a scripted engine. Never opens a visible window or the engine.
use crate::{
    args::Args,
    model::{Info, Mode, Progress},
    view::{Action, Installer},
};
use gpui::{App, AsyncApp, Context, Entity, IntoElement, Render, Window, WindowHandle, prelude::*};
use serde::Deserialize;
use std::{
    cell::{Cell, RefCell},
    path::{Path, PathBuf},
    rc::Rc,
    time::{Duration, Instant},
};
use vantare_ui::{capture, capture_window};

const ROOT: &str = "C:/tmp/ola2/1591-qa";
const WIDTH: i32 = 720;
const HEIGHT: i32 = 460;

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct Manifest {
    snapshot: PathBuf,
    jobs: Vec<Job>,
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct Job {
    /// Static state of `capture_state`, or a scripted flow when `frames > 0`.
    scene: String,
    /// PNG for a still; directory of `frame-NNN.png` for a flow.
    output: PathBuf,
    #[serde(default)]
    snapshot: Option<PathBuf>,
    #[serde(default)]
    frames: u32,
    #[serde(default = "interval")]
    interval_ms: u64,
    #[serde(default)]
    reduce_motion: bool,
}
fn interval() -> u64 {
    40
}

enum Step {
    Start(Mode),
    Progress(&'static str, u8, u64, bool),
    Finish(u8),
    Toggle(Action),
    Scene(&'static str),
}

/// Engine milestones as sent by installer-driver.ps1, on a compressed clock.
fn script(scene: &str, size: u64) -> Result<Vec<(u64, Step)>, String> {
    let mut steps = Vec::new();
    match scene {
        "install-flow" => {
            steps.push((400, Step::Start(Mode::Install)));
            steps.push((450, Step::Progress("prepare", 0, 0, true)));
            for k in 0..=28_u64 {
                let done = size * k / 28;
                let percent = 6 + u8::try_from(done * 34 / size.max(1)).unwrap_or(34);
                steps.push((600 + k * 50, Step::Progress("extract", percent, done, true)));
            }
            steps.push((2100, Step::Progress("verify", 40, 0, true)));
            steps.push((3700, Step::Progress("copy", 54, 0, false)));
            steps.push((5600, Step::Progress("shortcuts", 84, 0, false)));
            steps.push((6000, Step::Progress("register", 93, 0, false)));
            steps.push((6400, Step::Progress("done", 100, 0, false)));
            steps.push((6450, Step::Finish(0)));
        }
        "remove-flow" => {
            steps.push((0, Step::Scene("uninstall")));
            steps.push((400, Step::Start(Mode::Remove)));
            steps.push((450, Step::Progress("prepare", 0, 0, false)));
            steps.push((900, Step::Progress("copy", 12, 0, false)));
            steps.push((2600, Step::Progress("shortcuts", 72, 0, false)));
            steps.push((3000, Step::Progress("register", 88, 0, false)));
            steps.push((3400, Step::Progress("done", 100, 0, false)));
            steps.push((3450, Step::Finish(0)));
        }
        "options-flow" => {
            steps.push((400, Step::Toggle(Action::Options)));
            steps.push((1200, Step::Toggle(Action::Desktop)));
            steps.push((1800, Step::Toggle(Action::Autostart)));
        }
        _ => return Err(format!("flujo de captura desconocido: {scene}")),
    }
    Ok(steps)
}

fn inside_qa(path: &Path) -> Result<(), String> {
    if path.starts_with(Path::new(ROOT)) {
        Ok(())
    } else {
        Err(format!("{} fuera de la raíz QA", path.display()))
    }
}

fn snapshot(path: &Path) -> Result<Info, String> {
    inside_qa(path)?;
    crate::engine::reject_links(path)?;
    serde_json::from_slice(&std::fs::read(path).map_err(|e| e.to_string())?)
        .map_err(|e| e.to_string())
}

struct Root {
    view: Entity<Installer>,
}
impl Render for Root {
    fn render(&mut self, _: &mut Window, _: &mut Context<Self>) -> impl IntoElement {
        gpui::div().size_full().child(self.view.clone())
    }
}

fn installer(info: Info, cx: &mut Context<Root>) -> Entity<Installer> {
    cx.new(|cx| Installer::new(info, Args::default(), true, Rc::new(Cell::new(0)), cx))
}

pub fn run(manifest: &Path) -> Result<(), String> {
    inside_qa(manifest)?;
    let manifest: Manifest = serde_json::from_slice(
        &std::fs::read(manifest).map_err(|e| format!("{}: {e}", manifest.display()))?,
    )
    .map_err(|e| e.to_string())?;
    let mut jobs = Vec::new();
    for job in manifest.jobs {
        inside_qa(&job.output)?;
        let info = snapshot(job.snapshot.as_deref().unwrap_or(&manifest.snapshot))?;
        jobs.push((job, info));
    }
    let first = jobs.first().ok_or("lote vacío")?.1.clone();
    let _lock = capture_window::lock()?;
    let options = capture_window::options(WIDTH, HEIGHT)?;
    let failure = Rc::new(RefCell::new(None::<String>));
    let flag = failure.clone();
    let started = Instant::now();
    gpui_platform::application().run(move |cx: &mut App| {
        if let Err(error) = crate::style::fonts(cx) {
            *flag.borrow_mut() = Some(error);
            cx.quit();
            return;
        }
        let window = match cx.open_window(options, |_, cx| {
            cx.new(|cx| Root {
                view: installer(first, cx),
            })
        }) {
            Ok(window) => window,
            Err(error) => {
                *flag.borrow_mut() = Some(error.to_string());
                cx.quit();
                return;
            }
        };
        if let Err(error) = window
            .update(cx, |_, window, _| capture_window::created(window))
            .map_err(|e| e.to_string())
            .and_then(|result| result)
        {
            *flag.borrow_mut() = Some(error);
            cx.quit();
            return;
        }
        cx.spawn(async move |cx| {
            if let Err(error) = capture_jobs(jobs, window, cx).await {
                *flag.borrow_mut() = Some(error);
            }
            cx.update(|cx| cx.quit());
        })
        .detach();
    });
    if let Some(error) = failure.borrow_mut().take() {
        return Err(error);
    }
    println!(
        "capture-batch installer windows=1 elapsed_ms={}",
        started.elapsed().as_millis()
    );
    Ok(())
}

async fn capture_jobs(
    jobs: Vec<(Job, Info)>,
    window: WindowHandle<Root>,
    cx: &mut AsyncApp,
) -> Result<(), String> {
    for (job, info) in jobs {
        let size = info.size;
        // Stills show end states; flows animate unless the job asks otherwise.
        let reduce = job.reduce_motion || job.frames == 0;
        let scene = job.scene.clone();
        let hwnd = window
            .update(cx, |root, window, cx| {
                cx.set_reduce_motion(reduce);
                root.view = installer(info, cx);
                if job.frames == 0 {
                    root.view.update(cx, |view, _| view.capture_state(&scene));
                }
                cx.notify();
                capture_window::show(window, WIDTH, HEIGHT, cx)
            })
            .map_err(|e| e.to_string())??;
        if job.frames == 0 {
            still(cx, hwnd, &job.output).await?;
        } else {
            flow(cx, window, hwnd, &job, &script(&job.scene, size)?).await?;
        }
        println!("capture-written {}", job.output.display());
    }
    Ok(())
}

fn rgba(mut pixels: Vec<u8>) -> Vec<u8> {
    for pixel in pixels.chunks_exact_mut(4) {
        pixel.swap(0, 2);
        pixel[3] = 255;
    }
    pixels
}

async fn still(cx: &AsyncApp, hwnd: isize, output: &Path) -> Result<(), String> {
    // GPU presentation is asynchronous: two identical frames, bounded deadline.
    let mut previous = None;
    for _ in 0..40 {
        cx.background_executor()
            .timer(Duration::from_millis(120))
            .await;
        let (_, _, pixels) = capture::capture_client(hwnd, WIDTH, HEIGHT)?;
        if previous.as_ref() == Some(&pixels) && pixels.chunks_exact(4).any(|p| p[..3] != [0, 0, 0])
        {
            return write(output, &rgba(pixels));
        }
        previous = Some(pixels);
    }
    Err("el render del instalador no se estabilizó en 4,8 s".into())
}

fn write(output: &Path, pixels: &[u8]) -> Result<(), String> {
    if let Some(parent) = output.parent() {
        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    capture::write_png(
        output,
        WIDTH.cast_unsigned(),
        HEIGHT.cast_unsigned(),
        pixels,
    )
}

async fn flow(
    cx: &mut AsyncApp,
    window: WindowHandle<Root>,
    hwnd: isize,
    job: &Job,
    script: &[(u64, Step)],
) -> Result<(), String> {
    std::fs::create_dir_all(&job.output).map_err(|e| e.to_string())?;
    // Let the first frame and fonts settle before the clock starts.
    cx.background_executor()
        .timer(Duration::from_millis(300))
        .await;
    let start = Instant::now();
    let mut next = 0;
    let mut writes = Vec::new();
    for frame in 0..job.frames {
        let due = Duration::from_millis(u64::from(frame) * job.interval_ms);
        if let Some(wait) = due.checked_sub(start.elapsed()) {
            cx.background_executor().timer(wait).await;
        }
        let now = u64::try_from(start.elapsed().as_millis()).unwrap_or(u64::MAX);
        let mut pending = Vec::new();
        while let Some((at, step)) = script.get(next)
            && *at <= now
        {
            pending.push(step);
            next += 1;
        }
        if !pending.is_empty() {
            window
                .update(cx, |root, _, cx| {
                    root.view.update(cx, |view, cx| {
                        for step in pending {
                            apply(view, step, cx);
                        }
                        cx.notify();
                    });
                })
                .map_err(|e| e.to_string())?;
        }
        let (_, _, pixels) = capture::capture_client(hwnd, WIDTH, HEIGHT)?;
        let path = job.output.join(format!("frame-{frame:03}.png"));
        // Encoding runs off the UI thread so the captured timing stays honest.
        writes.push(
            cx.background_executor()
                .spawn(async move { write(&path, &rgba(pixels)) }),
        );
    }
    for write in writes {
        write.await?;
    }
    Ok(())
}

fn apply(view: &mut Installer, step: &Step, cx: &mut Context<Installer>) {
    match step {
        Step::Start(mode) => view.begin(*mode),
        Step::Progress(name, percent, done, can_cancel) => view.progress(Progress {
            step: (*name).into(),
            percent: *percent,
            done: *done,
            total: if *done > 0 { view.info.size } else { 0 },
            can_cancel: *can_cancel,
        }),
        Step::Finish(code) => view.finished(Ok(*code), cx),
        Step::Toggle(action) => view.capture_toggle(*action),
        Step::Scene(scene) => view.capture_state(scene),
    }
}
