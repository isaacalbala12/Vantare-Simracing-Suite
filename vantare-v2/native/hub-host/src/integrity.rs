//! The installed UI is part of the same authenticated inventory as bin/.
use std::{
    io,
    path::{Path, PathBuf},
};
use vantare_installer::engine::Installation;

pub fn ui(generation: &Path) -> io::Result<PathBuf> {
    #[cfg(feature = "qa-e2e")]
    let read_started = std::time::Instant::now();
    let root = generation
        .ancestors()
        .nth(2)
        .ok_or(io::ErrorKind::InvalidInput)?;
    let denied = |error| io::Error::new(io::ErrorKind::PermissionDenied, error);
    let mut installation = Installation::read(root).map_err(denied)?;
    #[cfg(feature = "qa-e2e")]
    let first_walk_us = read_started.elapsed().as_micros();
    let active = installation
        .state
        .as_ref()
        .ok_or(io::ErrorKind::PermissionDenied)?;
    if root.join("generations").join(&active.active.generation) != generation {
        return Err(io::ErrorKind::PermissionDenied.into());
    }
    let manifest = installation
        .manifest
        .as_ref()
        .ok_or(io::ErrorKind::PermissionDenied)?;
    for required in [
        "bin/vantare-hub.exe",
        "hub-ui/vantare-hub-ui.exe",
        "hub-ui/resources/app.asar",
    ] {
        if !manifest.files.iter().any(|member| member.path == required) {
            return Err(io::ErrorKind::PermissionDenied.into());
        }
    }
    // Includes every hub-ui resource, size/hash, executable sidecars, and rejection
    // of undeclared files and reparse points. Never launch before this succeeds.
    #[cfg(feature = "qa-e2e")]
    let verify_started = std::time::Instant::now();
    installation.verify(root).map_err(denied)?;
    #[cfg(feature = "qa-e2e")]
    eprintln!(
        "HUB_QA_INTEGRITY first_walk_us={first_walk_us} verify_walk_and_hash_us={}",
        verify_started.elapsed().as_micros()
    );
    crate::ready::canonical_executable(&generation.join("hub-ui/vantare-hub-ui.exe"))
}

#[cfg(test)]
pub(crate) mod tests {
    use super::*;
    use serde_json::json;
    use std::fs;
    use std::os::windows::process::CommandExt as _;
    use vantare_installer::engine::hash_file;

    pub(crate) fn fixture() -> (crate::test_support::Root, PathBuf) {
        let owned = crate::test_support::Root::new();
        let root = &owned.path;
        let id = "0123456789abcdef0123456789abcdef";
        let generation = root.join("generations").join(id);
        fs::create_dir_all(generation.join("bin")).expect("bin");
        fs::create_dir_all(generation.join("hub-ui/resources")).expect("UI");
        fs::create_dir_all(generation.join("data")).expect("data");
        fs::create_dir_all(generation.join("hub-ui/locales")).expect("locales");
        let mut pe = [0_u8; 70];
        pe[..2].copy_from_slice(b"MZ");
        pe[60..64].copy_from_slice(&64_u32.to_le_bytes());
        pe[64..].copy_from_slice(b"PE\0\0\x64\x86");
        let mut members = Vec::new();
        for name in [
            "bin/vantare-hub.exe",
            "hub-ui/vantare-hub-ui.exe",
            "hub-ui/resources/app.asar",
            "hub-ui/example.dll",
            "hub-ui/locales/es.pak",
        ] {
            let path = generation.join(name);
            fs::write(
                &path,
                if Path::new(name)
                    .extension()
                    .is_some_and(|ext| ext.eq_ignore_ascii_case("exe"))
                {
                    &pe[..]
                } else {
                    b"inert asar"
                },
            )
            .expect("fixture");
            let hash = hash_file(&path).expect("hash");
            members.push(
                json!({"path":name,"size":fs::metadata(&path).expect("stat").len(),"sha256":hash}),
            );
            if Path::new(name)
                .extension()
                .is_some_and(|ext| ext.eq_ignore_ascii_case("exe"))
            {
                let sidecar = format!("{name}.sha256");
                let bytes = format!(
                    "{hash}  {}\n",
                    path.file_name().expect("name").to_str().expect("text")
                );
                fs::write(generation.join(&sidecar), bytes).expect("sidecar");
                members.push(json!({"path":sidecar,"size":fs::metadata(generation.join(&sidecar)).expect("stat").len(),"sha256":hash_file(&generation.join(&sidecar)).expect("hash")}));
            }
        }
        let manifest = generation.join("manifest.json");
        fs::write(&manifest, serde_json::to_vec(&json!({"schema":1,"product":"vantare-native","candidate":true,"architecture":"windows-x64","version":"0.0.989","channel":"nightly","data_schema":"opaque-v1","source_sha":"0".repeat(40),"source_dirty":false,"build_profile":"Release","files":members})).expect("JSON")).expect("manifest");
        fs::write(root.join("state.json"), serde_json::to_vec(&json!({"schema":1,"product":"vantare-native","channel":"nightly","active":{"generation":id,"manifest_sha256":hash_file(&manifest).expect("hash")},"previous":null})).expect("JSON")).expect("state");
        let generation = crate::ready::canonical_executable(&generation).expect("canonical");
        (owned, generation)
    }
    #[test]
    fn bound_inventory_rejects_modified_missing_and_extra_ui_before_launch() {
        let (_owned, generation) = fixture();
        assert!(ui(&generation).is_ok());
        let asar = generation.join("hub-ui/resources/app.asar");
        fs::write(&asar, b"other asar").expect("tamper same size");
        assert!(ui(&generation).is_err());
        fs::write(&asar, b"inert asar").expect("restore");
        let extra = generation.join("hub-ui/extra.dll");
        fs::write(&extra, b"extra").expect("extra");
        assert!(ui(&generation).is_err());
        fs::remove_file(extra).expect("remove extra");
        fs::remove_file(asar).expect("missing");
        assert!(ui(&generation).is_err());
    }
    #[test]
    fn binding_sidecar_dll_and_locale_tampering_are_rejected() {
        for name in [
            "bin/vantare-hub.exe.sha256",
            "hub-ui/example.dll",
            "hub-ui/locales/es.pak",
        ] {
            let (_owned, generation) = fixture();
            fs::write(generation.join(name), b"tampered").expect("tamper");
            assert!(ui(&generation).is_err());
        }
        let (owned, generation) = fixture();
        let path = owned.path.join("state.json");
        let mut state: serde_json::Value =
            serde_json::from_slice(&fs::read(&path).expect("read")).expect("JSON");
        state["active"]["manifest_sha256"] = "f".repeat(64).into();
        fs::write(path, serde_json::to_vec(&state).expect("JSON")).expect("change binding");
        assert!(ui(&generation).is_err());
    }
    #[test]
    fn a_directory_junction_is_rejected_even_when_its_bytes_match() {
        let (owned, generation) = fixture();
        let locales = generation.join("hub-ui").join("locales");
        let moved = crate::ready::canonical_executable(&owned.path)
            .expect("canonical root")
            .join("original-locales");
        fs::rename(&locales, &moved).expect("move fixture");
        let result = std::process::Command::new("cmd.exe")
            .args(["/d", "/c", "mklink", "/J"])
            .arg(&locales)
            .arg(&moved)
            .creation_flags(windows_sys::Win32::System::Threading::CREATE_NO_WINDOW)
            .output()
            .expect("QA junction");
        assert!(
            result.status.success(),
            "QA junction: {}",
            String::from_utf8_lossy(&result.stderr)
        );
        let rejected = ui(&generation).is_err();
        fs::remove_dir(&locales).expect("remove junction before owned cleanup");
        assert!(rejected);
    }
}
