#![cfg_attr(windows, windows_subsystem = "windows")]
//! Never execute on the server, including probes. Runtime tests are in lib.rs.
use rune::{
    App, AppSpec, Cx, El, OverlayInput, OverlayOptions, OverlayPlacement, OverlaySpec, RunOptions,
    Tx, WindowSpec, el,
};
use std::{
    io::Read,
    sync::{
        Arc, Mutex,
        atomic::{AtomicBool, Ordering},
    },
    thread::JoinHandle,
    time::Duration,
};
use vantare_domain::Snapshot;
use vantare_overlays_rune::{HEIGHT, Relative, WIDTH, presentation};

const PROVENANCE: &str = concat!(
    "VANTARE_BUILD;sha=",
    env!("VANTARE_BUILD_SHA"),
    ";dirty=",
    env!("VANTARE_BUILD_DIRTY"),
    ";rune=d5338988a7c1b3377adb60853815b6d0843dae7c;rust=",
    env!("VANTARE_BUILD_RUST"),
    ";profile=release;opt-level=3;lto=false;codegen-units=16;debug=false;features=medir-latencia;copies=1,4,10"
);
#[derive(Default)]
struct Shared {
    latest: Mutex<Option<Arc<Snapshot>>>,
    waker: Mutex<Option<rune::Waker>>,
    stop: AtomicBool,
}
struct Reader {
    shared: Arc<Shared>,
    worker: Option<JoinHandle<()>>,
}
impl Reader {
    fn start(name: &str) -> Result<Self, Box<dyn std::error::Error>> {
        let mut subscriber = vantare_ipc::Subscriber::connect_requested(
            name,
            vantare_ipc::relative_measurement_demand(),
            |_| true,
        )?;
        let shared = Arc::new(Shared::default());
        let bus = shared.clone();
        let worker = std::thread::Builder::new()
            .name("rune-relative-ipc".into())
            .spawn(move || {
                while !bus.stop.load(Ordering::Acquire) {
                    if let Some(photo) = subscriber.next_photo(Duration::from_millis(50)) {
                        *bus.latest.lock().unwrap() = Some(photo.snapshot);
                        if let Some(waker) = bus.waker.lock().unwrap().as_ref() {
                            waker.wake();
                        }
                    }
                }
            })?;
        Ok(Self {
            shared,
            worker: Some(worker),
        })
    }
}
impl Drop for Reader {
    fn drop(&mut self) {
        self.shared.stop.store(true, Ordering::Release);
        if let Some(worker) = self.worker.take() {
            if worker.join().is_err() {
                eprintln!("VANTARE_IPC_READER_PANIC");
            }
        }
    }
}
struct Mosaic {
    copies: Vec<Relative>,
    shared: Arc<Shared>,
    photo: Option<(u64, u64)>,
    clicks: u64,
}
fn setup(state: &mut Mosaic, waker: rune::Waker) {
    *state.shared.waker.lock().unwrap() = Some(waker);
}
fn poll(state: &mut Mosaic, _time: f64, _tx: &mut Tx) -> bool {
    let photo = state.shared.latest.lock().unwrap().take();
    let Some(photo) = photo else { return false };
    state.photo = Some((photo.epoch, photo.sequence));
    let mut structural = false;
    for relative in &mut state.copies {
        structural |= relative.ingest(&photo);
    }
    structural
}
fn view(state: &Mosaic, _cx: &mut Cx<Mosaic>) -> El {
    let columns = match state.copies.len() {
        1 => 1,
        4 => 2,
        _ => 4,
    };
    let mut root = el().w_full().h_full();
    for (index, relative) in state.copies.iter().enumerate() {
        let x = 20.0 + (index % columns) as f32 * (WIDTH + 12.0);
        let y = 20.0 + (index / columns) as f32 * (HEIGHT + 12.0);
        root = root.child(
            presentation::view(relative)
                .key(format!("relative-copy-{index}"))
                .pin(Some(x), Some(y), None, None),
        );
    }
    // Invisible hit region over the first brand, for the explicit interaction check.
    // Benchmark rounds keep the pointer outside this region.
    root.child(
        el().key("brand-hit-zone")
            .role("button")
            .label("Vantare: comprobar clic sin foco")
            .hit()
            .size(65.0, 18.0)
            .pin(Some(363.0), Some(31.0), None, None)
            .on_press(|state: &mut Mosaic| {
                state.clicks += 1;
                eprintln!("VANTARE_MEASUREMENT_CLICK;count={}", state.clicks);
            }),
    )
}
struct Encoded {
    previous: Option<(u64, u64)>,
}
impl rune::compose::Compositor<Mosaic> for Encoded {
    fn render(&mut self, frame: &mut rune::compose::Frame<'_, Mosaic>) {
        frame.draw_ui();
        if let Some((epoch, sequence)) = frame
            .rt
            .state
            .photo
            .filter(|photo| Some(*photo) != self.previous)
        {
            // This is an ENCODE marker, immediately before Rune's submit path;
            // it is not mislabeled as DXGI Present, nor as visibility.
            vantare_profiling::latency::mark("encoded", epoch, sequence, 1);
            self.previous = Some((epoch, sequence));
        }
    }
    fn draws_own(&self) -> bool {
        false
    }
}
fn config(args: &[String]) -> Result<(usize, String), Box<dyn std::error::Error>> {
    let mut args = args.to_vec();
    let index = args
        .iter()
        .position(|arg| arg == "--control-stdin")
        .ok_or("falta --control-stdin")?;
    args.remove(index);
    let [flag, count, source_flag, source] = args.as_slice() else {
        return Err("uso: --medicion-relative 1|4|10 --fuente pipe[:nombre] --control-stdin".into());
    };
    let copies = count.parse::<usize>()?;
    if flag != "--medicion-relative" || source_flag != "--fuente" || !matches!(copies, 1 | 4 | 10) {
        return Err("argumentos de medicion invalidos".into());
    }
    let name = if source == "pipe" {
        vantare_ipc::default_pipe_name()?
    } else {
        source
            .strip_prefix("pipe:")
            .filter(|name| !name.is_empty())
            .ok_or("se requiere el IPC del nucleo")?
            .to_owned()
    };
    Ok((copies, name))
}
fn application() -> Result<(), Box<dyn std::error::Error>> {
    let (copies, name) = config(&std::env::args().skip(1).collect::<Vec<_>>())?;
    let reader = Reader::start(&name)?;
    let shared = reader.shared.clone();
    let excluded = std::env::var("VANTARE_MEASUREMENT_EXCLUDE_CAPTURE").is_ok_and(|v| v == "1");
    rune::run_windows_with(RunOptions { accessory: true }, move |_displays| {
        let spec = AppSpec {
            fonts: presentation::FONTS,
            families: ("Inter", "Inter"),
            ..AppSpec::new("Vantare Relative Rune", (1.0, 1.0), || (), |_, _| el())
        };
        let mut app = App::new(spec).windowless();
        let app_handle = app.handle();
        std::thread::Builder::new()
            .name("rune-parent-watch".into())
            .spawn(move || {
                let mut buffer = [0u8; 256];
                loop {
                    match std::io::stdin().read(&mut buffer) {
                        Ok(0) => break,
                        Ok(_) => {}
                        Err(error) => {
                            eprintln!("stdin: {error}");
                            break;
                        }
                    }
                }
                app_handle.quit();
            })
            .expect("supervisor stdin");
        let state = Mosaic {
            copies: (0..copies).map(|_| Relative::default()).collect(),
            shared,
            photo: None,
            clicks: 0,
        };
        let overlay = app.overlay(
            OverlaySpec::new("Vantare Relative Rune", (WIDTH, HEIGHT), view)
                .options(OverlayOptions {
                    placement: Some(OverlayPlacement::FullScreen),
                    input: OverlayInput::Regions,
                    exclude_from_capture: excluded,
                    ..Default::default()
                })
                .setup(setup)
                .poll(poll)
                .compositor(Encoded { previous: None }),
            state,
        );
        overlay.show();
        vec![WindowSpec::from_app("rune-relative", app)]
    });
    drop(reader);
    Ok(())
}
fn main() -> std::process::ExitCode {
    eprintln!("{PROVENANCE}");
    let session = match vantare_profiling::latency::Session::from_env() {
        Ok(session) => session,
        Err(error) => {
            eprintln!("traza: {error}");
            return std::process::ExitCode::from(2);
        }
    };
    let result = application();
    if let Some(session) = session {
        if let Err(error) = session.finish() {
            eprintln!("cerrar traza: {error}");
            return std::process::ExitCode::from(2);
        }
    }
    result.map_or_else(
        |error| {
            eprintln!("{error}");
            std::process::ExitCode::from(2)
        },
        |()| std::process::ExitCode::SUCCESS,
    )
}
