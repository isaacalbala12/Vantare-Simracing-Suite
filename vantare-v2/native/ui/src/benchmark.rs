//! Medición de QA sobre `Widget::ingest`, frame y pintor productivos; no entra en producto.
use crate::{
    Settings, Widget, app,
    efficiency::{preview::PaintWindow, text},
};
use gpui::{
    App, AppContext, Bounds, Context, IntoElement, Render, Window, WindowBounds, WindowOptions,
    canvas, point, prelude::*, px, size,
};
use std::{
    cell::{Cell, RefCell},
    path::PathBuf,
    process::ExitCode,
    rc::Rc,
    time::Instant,
};
use vantare_domain::{Snapshot, format::Preferences};
const WARMUP: usize = 60;
const SAMPLES: usize = 600;
struct Samples {
    ingest: Vec<u64>,
    frame: Vec<u64>,
    paint: Vec<u64>,
    invalidations: usize,
}
impl Default for Samples {
    fn default() -> Self {
        Self {
            ingest: Vec::with_capacity(SAMPLES),
            frame: Vec::with_capacity(SAMPLES),
            paint: Vec::with_capacity(SAMPLES),
            invalidations: 0,
        }
    }
}
struct Panel {
    widget: Widget,
    photos: Vec<Snapshot>,
    prefs: Preferences,
    index: usize,
    samples: Rc<RefCell<Samples>>,
    output: PathBuf,
    failure: Rc<Cell<bool>>,
}
fn ns(start: Instant) -> u64 {
    u64::try_from(start.elapsed().as_nanos()).unwrap_or(u64::MAX)
}
fn percentile(values: &[u64], p: usize) -> u64 {
    let mut v = values.to_vec();
    v.sort_unstable();
    v[(v.len() * p / 100).min(v.len() - 1)]
}
impl Render for Panel {
    fn render(&mut self, window: &mut Window, _cx: &mut Context<Self>) -> impl IntoElement {
        self.index += 1;
        let index = self.index;
        let photo = &self.photos[(index - 1) % self.photos.len()];
        let start = Instant::now();
        let changed = self.widget.ingest(photo, self.prefs);
        let ingest = ns(start);
        let start = Instant::now();
        let (paint, _) = self.widget.frame(self.prefs);
        let preparation = ns(start);
        let extent = self.widget.size();
        let samples = self.samples.clone();
        let output = self.output.clone();
        let failure = self.failure.clone();
        window.request_animation_frame();
        canvas(|_,_,_| (), move |bounds,(),window,cx| {
            let start=Instant::now();
            text::with_origin((f32::from(bounds.origin.x),f32::from(bounds.origin.y)),|| {
                let mut target=PaintWindow::new(window,bounds.origin,1.0,1.0); paint(&mut target,cx);
            });
            let elapsed=ns(start);
            if index > WARMUP {
                let mut stats=samples.borrow_mut(); stats.ingest.push(ingest); stats.frame.push(preparation+elapsed); stats.paint.push(elapsed); stats.invalidations+=usize::from(changed);
                if stats.frame.len()==SAMPLES {
                    let value=serde_json::json!({"samples":SAMPLES,"warmup":WARMUP,"ingest_ns":{"p50":percentile(&stats.ingest,50),"p99":percentile(&stats.ingest,99)},"frame_ns":{"p50":percentile(&stats.frame,50),"p99":percentile(&stats.frame,99)},"paint_ns":{"p50":percentile(&stats.paint,50),"p99":percentile(&stats.paint,99)},"invalidations":stats.invalidations,"raw_ns":{"ingest":stats.ingest,"frame":stats.frame,"paint":stats.paint},"measurement":"CPU: ingest + frame preparation and productive paint; excludes GPU submit/present"});
                    let result=serde_json::to_vec_pretty(&value).map_err(std::io::Error::other).and_then(|bytes| std::fs::write(&output,bytes));
                    if let Err(error)=result { eprintln!("benchmark: {error}"); failure.set(true); }
                    cx.quit();
                }
            }
        }).w(px(extent.0)).h(px(extent.1))
    }
}
pub fn run(
    settings: Settings,
    prefs: Preferences,
    photos: Vec<Snapshot>,
    output: PathBuf,
) -> ExitCode {
    if photos.is_empty() {
        eprintln!("corpus vacío");
        return ExitCode::FAILURE;
    }
    let failure = Rc::new(Cell::new(false));
    let flag = failure.clone();
    gpui_platform::application().run(move |cx: &mut App| {
        if !app::init(cx) {
            flag.set(true);
            return;
        }
        let widget = Widget::new(&settings, prefs);
        let options = WindowOptions {
            window_bounds: Some(WindowBounds::Windowed(Bounds::new(
                point(px(0.0), px(0.0)),
                size(px(1000.0), px(900.0)),
            ))),
            ..Default::default()
        };
        if let Err(error) = cx.open_window(options, |_, cx| {
            cx.new(|_| Panel {
                widget,
                photos,
                prefs,
                index: 0,
                samples: Rc::new(RefCell::new(Samples::default())),
                output,
                failure: flag.clone(),
            })
        }) {
            eprintln!("benchmark window: {error}");
            flag.set(true);
            cx.quit();
        }
    });
    if failure.get() {
        ExitCode::FAILURE
    } else {
        ExitCode::SUCCESS
    }
}
