//! Renderer productivo en un HWND fuera de pantalla, sin procesos auxiliares.
use crate::{
    demo::CaptureState,
    shell::{self, Hub, Options},
};
use gpui::{App, Context, Entity, IntoElement, Render, Window, div, prelude::*};
use std::{
    cell::RefCell,
    path::PathBuf,
    rc::Rc,
    time::{Duration, Instant},
};
use vantare_ui::{
    capture_batch::{Cache, inputs_hash},
    capture_window,
};

pub(crate) struct CurrentScene(pub CaptureState);
impl gpui::Global for CurrentScene {}

fn clock_input(scene: &str, now_millis: impl FnOnce() -> i64) -> Option<i64> {
    (scene == "calendario-beta-prueba").then(now_millis)
}

pub(crate) fn current_name(cx: &App) -> Option<&str> {
    cx.try_global::<CurrentScene>()
        .map(|scene| scene.0.name.as_str())
}

fn access(state: &CaptureState) -> Result<shell::navigation::Access, String> {
    if let Some(path) = std::env::var_os("VANTARE_CAPTURE_POLICY") {
        let bytes = std::fs::read(path).map_err(|e| e.to_string())?;
        let policy: vantare_ipc::control::Policy =
            serde_json::from_slice(&bytes).map_err(|e| e.to_string())?;
        Ok(shell::navigation::Access {
            capture_locks: state.locked_sections(),
            ..shell::navigation::Access::from_policy(&policy, policy.checked_at_ms)
        })
    } else {
        Ok(shell::navigation::Access {
            verified: true,
            engineer: true,
            strategy: true,
            analysis: true,
            calendar: true,
            tester: true,
            capture_locks: state.locked_sections(),
            ..Default::default()
        })
    }
}

pub fn run(options: Options, _: CaptureState, _: PathBuf) -> Result<(), String> {
    run_many(vec![options])
}

struct Job {
    options: Options,
    access: shell::navigation::Access,
    cache: Cache,
}
struct Root {
    hub: Entity<Hub>,
}
impl Render for Root {
    fn render(&mut self, _: &mut Window, _: &mut Context<Self>) -> impl IntoElement {
        div().size_full().child(self.hub.clone())
    }
}

fn prepare_jobs(options: Vec<Options>) -> Result<(usize, Vec<Job>), String> {
    let common = inputs_hash(&[
        PathBuf::from(crate::scene::FIXTURES),
        PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("reference/fixtures"),
    ])?;
    let total = options.len();
    let mut jobs = Vec::new();
    for options in options {
        let state = options
            .capture
            .as_ref()
            .ok_or("el lote solo admite capturas")?;
        let output = options.capture_output.clone().ok_or("falta output")?;
        // This legacy QA scene deliberately uses the wall clock rather than
        // the frozen demo clock. Its changing time is part of the input too.
        let live_clock = clock_input(&state.name, || chrono::Utc::now().timestamp_millis());
        let inputs = serde_json::to_vec(&serde_json::json!({ "scene": state.name, "sidebar": state.sidebar, "column_open": state.column_open, "parameters": state.parameters, "appearance": options.capture_appearance, "size": options.capture_size, "zoom": options.capture_zoom, "live_clock": live_clock })).map_err(|e| e.to_string())?;
        let cache = Cache::new(output.clone(), &inputs, &common)?;
        if cache.fresh() {
            println!("capture-skip {}", output.display());
            continue;
        }
        jobs.push(Job {
            access: access(state)?,
            options,
            cache,
        });
    }
    Ok((total, jobs))
}

pub fn run_many(options: Vec<Options>) -> Result<(), String> {
    let started = Instant::now();
    let (total, jobs) = prepare_jobs(options)?;
    println!(
        "capture-stage prepared elapsed_ms={}",
        started.elapsed().as_millis()
    );
    let captured = jobs.len();
    if jobs.is_empty() {
        println!(
            "capture-batch total={total} captured=0 skipped={total} app_processes=1 windows=0 elapsed_ms={}",
            started.elapsed().as_millis()
        );
        return Ok(());
    }
    let _lock = capture_window::lock()?;
    let mut jobs = jobs.into_iter();
    let mut first = jobs.next().ok_or("lote vacío")?;
    let loaded = shell::load(&mut first.options)?;
    println!(
        "capture-stage loaded elapsed_ms={}",
        started.elapsed().as_millis()
    );
    let (width, height) = dimensions(&first.options);
    let window_options = capture_window::options(width, height)?;
    let failure = Rc::new(RefCell::new(None));
    let flag = failure.clone();
    gpui_platform::application()
        .with_assets(shell::assets::Icons)
        .run(move |cx: &mut App| {
            vantare_ui::analytics::init(cx);
            cx.set_global(crate::orbit::theme::Theme::default());
            if let Err(error) = vantare_ui::efficiency::text::register_fonts(cx)
                .and_then(|()| crate::orbit::design::register_fonts(cx))
            {
                *flag.borrow_mut() = Some(error);
                cx.quit();
                return;
            }
            let error_slot = flag.clone();
            let window = match cx.open_window(window_options, |window, cx| {
                let hub = cx.new(|cx| {
                    Hub::capture_build(
                        loaded,
                        first.options.section,
                        first.access,
                        error_slot,
                        window,
                        cx,
                    )
                });
                cx.new(|_| Root { hub })
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
            println!(
                "capture-stage window-ready elapsed_ms={}",
                started.elapsed().as_millis()
            );
            cx.spawn(async move |cx| {
                let result = capture_jobs(first, jobs, window, cx, flag.clone()).await;
                if let Err(error) = result {
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
        "capture-batch total={total} captured={captured} skipped={} app_processes=1 windows=1 elapsed_ms={}",
        total - captured,
        started.elapsed().as_millis()
    );
    Ok(())
}

async fn capture_jobs(
    first: Job,
    mut jobs: std::vec::IntoIter<Job>,
    window: gpui::WindowHandle<Root>,
    cx: &mut gpui::AsyncApp,
    flag: Rc<RefCell<Option<String>>>,
) -> Result<(), String> {
    let mut next = Some(first);
    let mut initial = true;
    while let Some(mut job) = next.take() {
        if !initial {
            let loaded = shell::load(&mut job.options)?;
            window
                .update(cx, |root, window, cx| {
                    if root.hub.read(cx).capture_can_reuse_calendar(&loaded) {
                        root.hub.update(cx, |hub, cx| {
                            hub.capture_apply_calendar(loaded, job.access, cx);
                        });
                    } else {
                        root.hub = cx.new(|cx| {
                            Hub::capture_build(
                                loaded,
                                job.options.section,
                                job.access,
                                flag.clone(),
                                window,
                                cx,
                            )
                        });
                    }
                    cx.notify();
                })
                .map_err(|e| e.to_string())?;
        }
        initial = false;
        let (width, height) = dimensions(&job.options);
        let hwnd = window
            .update(cx, |_, window, cx| {
                capture_window::show(window, width, height, cx)
            })
            .map_err(|e| e.to_string())??;
        let output = job.options.capture_output.as_ref().ok_or("falta output")?;
        save_frame(cx, hwnd, (width, height), output).await?;
        job.cache.commit()?;
        println!("capture-written {}", output.display());
        next = jobs.next();
    }
    Ok::<(), String>(())
}

async fn save_frame(
    cx: &gpui::AsyncApp,
    hwnd: isize,
    (width, height): (i32, i32),
    output: &std::path::Path,
) -> Result<(), String> {
    // GPU presentation is asynchronous: require two identical HWND frames
    // after layout/font uploads, with a bounded deadline and no desktop read.
    let mut previous = None;
    let mut stable = None;
    for _ in 0..40 {
        cx.background_executor()
            .timer(Duration::from_millis(120))
            .await;
        let (_, _, pixels) = vantare_ui::capture::capture_client(hwnd, width, height)?;
        if previous.as_ref() == Some(&pixels) && pixels.chunks_exact(4).any(|p| p[..3] != [0, 0, 0])
        {
            stable = Some(pixels);
            break;
        }
        previous = Some(pixels);
    }
    let mut pixels = stable.ok_or("el render del Hub no se estabilizó en 4,8 s")?;
    for pixel in pixels.chunks_exact_mut(4) {
        pixel.swap(0, 2);
        pixel[3] = 255;
    }
    vantare_ui::capture::write_png(
        output,
        width.cast_unsigned(),
        height.cast_unsigned(),
        &pixels,
    )
}

fn dimensions(options: &Options) -> (i32, i32) {
    let (width, height) = options.capture_size.unwrap_or_else(|| {
        if options
            .capture
            .as_ref()
            .is_some_and(|s| s.name.starts_with("strategy-v5-"))
        {
            (1672, 941)
        } else {
            (1440, 900)
        }
    });
    (width.cast_signed(), height.cast_signed())
}

#[cfg(test)]
mod tests {
    #[test]
    fn only_the_live_calendar_scene_reads_time_for_its_cache_key() {
        let frozen = super::clock_input("calendario-base", || panic!("reloj demo congelado"));
        assert_eq!(frozen, None);
        let first = super::clock_input("calendario-beta-prueba", || 1000);
        let next = super::clock_input("calendario-beta-prueba", || 2000);
        assert_eq!(first, Some(1000));
        assert_ne!(first, next);
    }
}
