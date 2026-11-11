//! Golden bytes from the real presentation API, without an App or window.
use std::{
    collections::BTreeMap,
    error::Error,
    sync::atomic::{AtomicU64, Ordering},
};
use vantare_ui::layout::Presentation;

pub(crate) fn bytes() -> Result<Vec<u8>, Box<dyn Error>> {
    static SEQUENCE: AtomicU64 = AtomicU64::new(0);
    let root = std::env::temp_dir().join(format!(
        "vantare-onboarding-presentation-{}-{}",
        std::process::id(),
        SEQUENCE.fetch_add(1, Ordering::Relaxed)
    ));
    std::fs::create_dir(&root)?;
    let result = (|| -> Result<Vec<u8>, Box<dyn Error>> {
        let mut cases = Vec::new();
        for (index, initial) in [None, Some(1_u64), Some(41)].into_iter().enumerate() {
            let layout = root.join(format!("layout-{index}.json"));
            let request = layout.with_extension("show.json");
            if let Some(value) = initial {
                std::fs::write(&request, serde_json::to_vec(&value)?)?;
            }
            Presentation::show(&layout)?;
            let mut case = BTreeMap::new();
            case.insert("initial", serde_json::to_value(initial)?);
            case.insert(
                "next",
                serde_json::to_value(std::fs::read_to_string(request)?)?,
            );
            cases.push(case);
        }
        let mut bytes = serde_json::to_vec_pretty(&cases)?;
        bytes.push(b'\n');
        Ok(bytes)
    })();
    let cleanup = std::fs::remove_dir_all(&root);
    let bytes = result?;
    cleanup?;
    Ok(bytes)
}
#[cfg_attr(test, allow(dead_code))] // Included by the headless parity test.
fn main() -> Result<(), Box<dyn Error>> {
    let output = std::env::args_os()
        .nth(1)
        .ok_or("usage: onboarding-presentation <output.json>")?;
    std::fs::write(output, bytes()?)?;
    Ok(())
}
