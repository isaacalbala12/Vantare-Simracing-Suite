use std::path::Path;
use vantare_domain::motion_policy::MotionPolicy;
#[derive(Default, serde::Deserialize)]
#[serde(default, rename_all = "camelCase")]
struct Stored {
    reduced_motion: bool,
}
pub fn load(path: &Path) -> Result<MotionPolicy, String> {
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
