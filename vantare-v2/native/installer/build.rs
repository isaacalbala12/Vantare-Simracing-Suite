use std::{env, fs, path::PathBuf};

fn main() -> Result<(), Box<dyn std::error::Error>> {
    println!("cargo:rerun-if-env-changed=VANTARE_VERSION");
    let version = env::var("VANTARE_VERSION").unwrap_or_else(|_| "0.0.0".into());
    println!("cargo:rustc-env=VANTARE_INSTALLER_VERSION={version}");
    vantare_build_support::embed_installer(&version)?;
    let out = PathBuf::from(env::var_os("OUT_DIR").ok_or("OUT_DIR ausente")?);
    let mut source = String::from(
        "pub const ARCHIVE: &[u8] = &[];\npub const UNINSTALLER: &[u8] = &[];\npub const PACKAGE_SHA: &str = \"\";\n",
    );
    if env::var_os("CARGO_FEATURE_SETUP_PAYLOAD").is_some() {
        let mut paths = Vec::new();
        for name in ["VANTARE_INSTALLER_ARCHIVE", "VANTARE_INSTALLER_UNINSTALLER"] {
            println!("cargo:rerun-if-env-changed={name}");
            let path =
                PathBuf::from(env::var_os(name).ok_or(format!("falta {name}"))?).canonicalize()?;
            println!("cargo:rerun-if-changed={}", path.display());
            paths.push(path);
        }
        println!("cargo:rerun-if-env-changed=VANTARE_INSTALLER_SHA256");
        let sha = env::var("VANTARE_INSTALLER_SHA256")?;
        if sha.len() != 64
            || !sha
                .bytes()
                .all(|b| b.is_ascii_digit() || (b'a'..=b'f').contains(&b))
        {
            return Err("SHA-256 de payload inválido".into());
        }
        // Debug emits an escaped Rust string literal, including Windows backslashes.
        #[allow(clippy::unnecessary_debug_formatting)]
        let embedded = format!(
            "pub const ARCHIVE: &[u8] = include_bytes!({:?});\npub const UNINSTALLER: &[u8] = include_bytes!({:?});\npub const PACKAGE_SHA: &str = {sha:?};\n",
            paths[0], paths[1]
        );
        source = embedded;
    }
    fs::write(out.join("payload.rs"), source)?;
    Ok(())
}
