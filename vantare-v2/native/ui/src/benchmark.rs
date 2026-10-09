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
#[derive(Clone, Copy)]
pub(crate) enum Work {
    Plan,
    Labels,
    Motion,
}
thread_local! { static WORK: Cell<[u64;3]> = const { Cell::new([0;3]) }; }
pub(crate) fn mark(work: Work) {
    WORK.with(|counts| {
        let mut next = counts.get();
        next[work as usize] += 1;
        counts.set(next);
    });
}
type Count = fn(bool) -> (u64, u64);
struct Samples {
    preparation: Vec<u64>,
    allocations: [Vec<(u64, u64)>; 3],
    ingest: Vec<u64>,
    frame: Vec<u64>,
    paint: Vec<u64>,
    invalidations: usize,
}
impl Default for Samples {
    fn default() -> Self {
        Self {
            preparation: Vec::with_capacity(SAMPLES),
            allocations: std::array::from_fn(|_| Vec::with_capacity(SAMPLES)),
            ingest: Vec::with_capacity(SAMPLES),
            frame: Vec::with_capacity(SAMPLES),
            paint: Vec::with_capacity(SAMPLES),
            invalidations: 0,
        }
    }
}
struct Panel {
    count: Option<Count>,
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
        if index == WARMUP + 1 {
            WORK.with(|counts| counts.set([0; 3]));
        }
        let photo = &self.photos[(index - 1) % self.photos.len()];
        if let Some(count) = self.count {
            count(true);
        }
        let start = Instant::now();
        let changed = self.widget.ingest(photo, self.prefs);
        let ingest = ns(start);
        let ingest_alloc = self.count.map(|count| count(false)).unwrap_or_default();
        if let Some(count) = self.count {
            count(true);
        }
        let start = Instant::now();
        let (paint, _) = self.widget.frame(self.prefs);
        let preparation = ns(start);
        let preparation_alloc = self.count.map(|count| count(false)).unwrap_or_default();
        let count = self.count;
        let extent = self.widget.size();
        let samples = self.samples.clone();
        let output = self.output.clone();
        let failure = self.failure.clone();
        window.request_animation_frame();
        canvas(|_,_,_| (), move |bounds,(),window,cx| {
            if let Some(count)=count { count(true); }
            let start=Instant::now();
            text::with_origin((f32::from(bounds.origin.x),f32::from(bounds.origin.y)),|| {
                let mut target=PaintWindow::new(window,bounds.origin,1.0,1.0); paint(&mut target,cx);
            });
            let elapsed=ns(start);
            let paint_alloc=count.map(|count| count(false)).unwrap_or_default();
            if index > WARMUP {
                let mut stats=samples.borrow_mut(); stats.preparation.push(preparation); for (index,alloc) in [ingest_alloc,preparation_alloc,paint_alloc].into_iter().enumerate() { stats.allocations[index].push(alloc); } stats.ingest.push(ingest); stats.frame.push(preparation+elapsed); stats.paint.push(elapsed); stats.invalidations+=usize::from(changed);
                if stats.frame.len()==SAMPLES {
                    let allocation_report: Vec<_>=stats.allocations.iter().map(|values| { let alloc: Vec<_>=values.iter().map(|x|x.0).collect(); let bytes: Vec<_>=values.iter().map(|x|x.1).collect(); serde_json::json!({"allocations_p50":percentile(&alloc,50),"bytes_p50":percentile(&bytes,50),"raw":values}) }).collect();
                    let value=serde_json::json!({"work_since_warmup_plan_labels_motion":WORK.with(Cell::get),"allocation_stages":allocation_report,"preparation_ns":{"p50":percentile(&stats.preparation,50),"p99":percentile(&stats.preparation,99)},"samples":SAMPLES,"warmup":WARMUP,"ingest_ns":{"p50":percentile(&stats.ingest,50),"p99":percentile(&stats.ingest,99)},"frame_ns":{"p50":percentile(&stats.frame,50),"p99":percentile(&stats.frame,99)},"paint_ns":{"p50":percentile(&stats.paint,50),"p99":percentile(&stats.paint,99)},"invalidations":stats.invalidations,"raw_ns":{"ingest":stats.ingest,"frame":stats.frame,"paint":stats.paint},"measurement":"CPU: ingest + frame preparation and productive paint; excludes GPU submit/present"});
                    let result=serde_json::to_vec_pretty(&value).map_err(std::io::Error::other).and_then(|bytes| std::fs::write(&output,bytes));
                    if let Err(error)=result { eprintln!("benchmark: {error}"); failure.set(true); }
                    cx.quit();
                }
            }
        }).w(px(extent.0)).h(px(extent.1))
    }
}
pub fn run_counted(
    settings: Settings,
    prefs: Preferences,
    photos: Vec<Snapshot>,
    output: PathBuf,
    count: Option<Count>,
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
                count,
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

pub fn run(
    settings: Settings,
    prefs: Preferences,
    photos: Vec<Snapshot>,
    output: PathBuf,
) -> ExitCode {
    run_counted(settings, prefs, photos, output, None)
}
