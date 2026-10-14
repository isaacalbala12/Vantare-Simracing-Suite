//! La app carga la preferencia; el renderer solo consulta el valor puro.
use std::path::Path;
#[derive(Clone, Copy, Default, PartialEq, Eq)]
pub struct MotionPolicy(pub bool);
impl gpui::Global for MotionPolicy {}
impl MotionPolicy {
    /// Lee la parte de apariencia que consume el host de overlays.
    pub fn load(path: &Path) -> Result<Self, String> {
        load(path)
    }
}

#[derive(Default, serde::Deserialize)]
#[serde(default, rename_all = "camelCase")]
struct Stored {
    reduced_motion: bool,
}
fn load(path: &Path) -> Result<MotionPolicy, String> {
    if path
        .components()
        .any(|part| part.as_os_str().to_string_lossy().starts_with(".env"))
    {
        return Err("archivo de entorno no permitido".into());
    }
    match std::fs::metadata(path) {
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => {
            return Ok(MotionPolicy(false));
        }
        Err(error) => return Err(format!("inspeccionar movimiento: {error}")),
        Ok(metadata) if metadata.len() > 16 * 1024 => return Err("apariencia supera 16 KiB".into()),
        Ok(_) => {}
    }
    let bytes = std::fs::read(path).map_err(|error| format!("leer movimiento: {error}"))?;
    let stored: Stored =
        serde_json::from_slice(&bytes).map_err(|error| format!("leer movimiento: {error}"))?;
    Ok(MotionPolicy(stored.reduced_motion))
}
pub(crate) fn install(cx: &mut gpui::App) {
    let Some(path) = std::env::var_os("VANTARE_APPEARANCE_FILE").map(std::path::PathBuf::from)
    else {
        return;
    };
    match MotionPolicy::load(&path) {
        Ok(policy) => cx.set_global(policy),
        Err(error) => eprintln!("{error}"),
    }
    cx.spawn(async move |cx| {
        let mut last_error = None;
        loop {
            cx.background_executor()
                .timer(std::time::Duration::from_millis(500))
                .await;
            match MotionPolicy::load(&path) {
                Ok(policy) => {
                    last_error = None;
                    cx.update(|cx| {
                        if cx.try_global::<MotionPolicy>().copied() != Some(policy) {
                            cx.set_global(policy);
                            cx.refresh_windows();
                        }
                    });
                }
                Err(error) => {
                    if last_error.as_ref() != Some(&error) {
                        eprintln!("{error}");
                    }
                    last_error = Some(error);
                }
            }
        }
    })
    .detach();
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn old_settings_default_to_motion_and_the_switch_roundtrips() {
        let old: Stored = serde_json::from_str("{}").expect("old settings");
        assert!(!old.reduced_motion);
        for enabled in [false, true] {
            let settings = serde_json::json!({"reducedMotion": enabled, "contrast": 120});
            let stored: Stored = serde_json::from_value(settings).expect("settings");
            assert_eq!(stored.reduced_motion, enabled);
        }
    }
}
