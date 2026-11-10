//! The installed UI is part of the same authenticated inventory as bin/.
use std::{
    io,
    path::{Path, PathBuf},
};
use vantare_installer::engine::Installation;

pub fn ui(generation: &Path) -> io::Result<PathBuf> {
    let root = generation
        .ancestors()
        .nth(2)
        .ok_or(io::ErrorKind::InvalidInput)?;
    let denied = |error| io::Error::new(io::ErrorKind::PermissionDenied, error);
    let mut installation = Installation::read(root).map_err(denied)?;
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
    installation.verify(root).map_err(denied)?;
    crate::ready::canonical_executable(&generation.join("hub-ui/vantare-hub-ui.exe"))
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;
    use std::fs;
    use vantare_installer::engine::hash_file;

    #[test]
    fn bound_inventory_rejects_modified_missing_and_extra_ui_before_launch() {
        let root = std::env::temp_dir().join(format!(
            "hub-integrity-{}",
            vantare_services::random_id().expect("QA id")
        ));
        let id = "0123456789abcdef0123456789abcdef";
        let generation = root.join("generations").join(id);
        fs::create_dir_all(generation.join("bin")).expect("bin");
        fs::create_dir_all(generation.join("hub-ui/resources")).expect("UI");
        fs::create_dir_all(generation.join("data")).expect("data");
        let mut pe = [0_u8; 70];
        pe[..2].copy_from_slice(b"MZ");
        pe[60..64].copy_from_slice(&64_u32.to_le_bytes());
        pe[64..].copy_from_slice(b"PE\0\0\x64\x86");
        let mut members = Vec::new();
        for name in [
            "bin/vantare-hub.exe",
            "hub-ui/vantare-hub-ui.exe",
            "hub-ui/resources/app.asar",
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
        let canonical_root = fs::canonicalize(&root).expect("owned QA root");
        assert!(canonical_root.starts_with(fs::canonicalize(std::env::temp_dir()).expect("temp")));
        fs::remove_dir_all(canonical_root).expect("own fixtures");
    }
}
