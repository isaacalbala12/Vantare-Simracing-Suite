use std::path::PathBuf;
use vantare_ipc::paths::{Error, Root};

pub fn default_data_dir() -> Result<PathBuf, &'static str> {
    Root::from_env()
        .map(|root| root.base().to_owned())
        .map_err(Error::message)
}

#[cfg(test)]
mod tests {
    use vantare_ipc::paths::{Error, Root};

    #[test]
    fn windows_fallback_selects_local_app_data_without_an_override() {
        let local = std::env::temp_dir().join("vantare-1869-local-fallback");
        for empty in [false, true] {
            let root = Root::resolve_fixture("windows", |key| match key {
                "VANTARE_NATIVE_DATA_ROOT" if empty => Some("".into()),
                "LOCALAPPDATA" => Some(local.clone().into_os_string()),
                "APPDATA" => Some(local.join("wrong-roaming").into_os_string()),
                _ => None,
            })
            .expect("fallback Windows");
            assert_eq!(root.base(), local);
            assert_eq!(root.layout(), local.join("Vantare/native/layout.json"));
        }
        assert_eq!(
            Root::resolve_fixture("windows", |_| None),
            Err(Error::MissingBase)
        );
    }
}
