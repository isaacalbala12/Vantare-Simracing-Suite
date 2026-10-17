//! Adaptación GPUI del productor de services; solo memoria en callbacks.
use gpui::{App, Global};
use vantare_services::diagnostics::{Privacy, Recorder, Usage};

struct Analytics(Option<Recorder>);
impl Global for Analytics {}

pub fn init(cx: &mut App) {
    let recorder = match Recorder::start() {
        Ok(recorder) => recorder,
        Err(error) => {
            eprintln!("uso local: {error}");
            None
        }
    };
    cx.set_global(Analytics(recorder));
}
fn recorder(cx: &App) -> Option<&Recorder> {
    cx.try_global::<Analytics>()?.0.as_ref()
}
pub fn generation(cx: &App) -> Option<u64> {
    recorder(cx)?.generation()
}
pub fn consent(cx: &App, privacy: Privacy) {
    if let Some(recorder) = recorder(cx) {
        recorder.consent(privacy);
    }
}
/// La salida sin guardar prevalece sobre el archivo antiguo en esta sesión.
pub fn suspend_until_consent(cx: &App) {
    if let Some(recorder) = recorder(cx) {
        recorder.suspend_until_consent();
    }
}
pub fn record(cx: &App, event: &Usage) {
    if let Some(recorder) = recorder(cx) {
        recorder.record(event);
    }
}
pub fn record_once(cx: &App, event: &Usage) {
    if let Some(recorder) = recorder(cx) {
        recorder.record_once(event);
    }
}
pub fn record_in_generation(cx: &App, event: &Usage, generation: u64) {
    if let Some(recorder) = recorder(cx) {
        recorder.record_in_generation(event, generation, false);
    }
}
