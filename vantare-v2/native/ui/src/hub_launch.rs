//! Reabrir el Hub conserva la instancia y los datos de los overlays.
use std::{ffi::OsString, path::Path};

pub(crate) fn arguments(args: &[String], data_root: Option<&Path>) -> Vec<OsString> {
    let mut result = Vec::new();
    if let Some(pipe) = args.windows(2).find_map(|pair| {
        (pair[0] == "--fuente")
            .then(|| pair[1].strip_prefix("pipe:"))
            .flatten()
    }) {
        result.extend([OsString::from("--pipe"), OsString::from(pipe)]);
    }
    if let Some(root) = data_root {
        for (flag, relative) in [
            ("--data-dir", "hub"),
            ("--layout", "Vantare/native/layout.json"),
            ("--engineer-settings", "Vantare/native/engineer.json"),
            ("--launcher-file", "Vantare/native/launcher.json"),
        ] {
            result.extend([OsString::from(flag), root.join(relative).into_os_string()]);
        }
    }
    result
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn reopening_preserves_the_beta_instance_and_generation_data() {
        let args = vec![
            "--start-hidden".into(),
            "--fuente".into(),
            "pipe:core-user-native-beta".into(),
        ];
        let root = Path::new("C:/generation/data");
        let result = arguments(&args, Some(root));
        assert_eq!(result[0], "--pipe");
        assert_eq!(result[1], "core-user-native-beta");
        assert_eq!(result[3], root.join("hub"));
        assert_eq!(result[5], root.join("Vantare/native/layout.json"));
        assert_eq!(result[9], root.join("Vantare/native/launcher.json"));
    }

    #[test]
    fn local_preview_keeps_the_default_hub_context() {
        assert!(arguments(&["--fuente".into(), "local".into()], None).is_empty());
    }
}
