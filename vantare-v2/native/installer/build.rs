use std::{env, fs, path::PathBuf};

fn main() -> Result<(), Box<dyn std::error::Error>> {
    if env::var_os("CARGO_FEATURE_TRANSPORT").is_some()
        && matches!(env::var("CARGO_CFG_TARGET_OS").as_deref(), Ok("windows"))
    {
        // Static imports resolve before entry(), including /S. Both installer
        // binaries only import OS DLLs: do not search the download/current dir.
        println!("cargo:rustc-link-arg-bins=/DEPENDENTLOADFLAG:0x800");
    }
    println!("cargo:rerun-if-env-changed=VANTARE_VERSION");
    let version = env::var("VANTARE_VERSION").unwrap_or_else(|_| "0.0.0".into());
    println!("cargo:rustc-env=VANTARE_INSTALLER_VERSION={version}");
    println!("cargo:rerun-if-env-changed=VANTARE_INSTALLER_QA_OWNER_SID");
    let sid = env::var("VANTARE_INSTALLER_QA_OWNER_SID").unwrap_or_default();
    if !sid.is_empty()
        && (!sid.starts_with("S-1-")
            || !sid
                .bytes()
                .all(|b| b == b'S' || b == b'-' || b.is_ascii_digit()))
    {
        return Err("SID de origen QA inválido".into());
    }
    println!("cargo:rustc-env=VANTARE_INSTALLER_QA_OWNER_SID={sid}");
    for name in [
        "VANTARE_INSTALLER_QA_IDENTITY",
        "VANTARE_INSTALLER_QA_SHORTCUT_FOLDER",
        "VANTARE_INSTALLER_QA_LEGACY_SHORTCUT_FOLDER",
        "VANTARE_INSTALLER_QA_PREFIX",
    ] {
        println!("cargo:rerun-if-env-changed={name}");
        let value = if env::var_os("CARGO_FEATURE_TEST_INSTALLER").is_some() {
            let value = env::var(name).map_err(|_| format!("falta {name} en la build TEST"))?;
            if value.trim().is_empty() || value.contains(['\r', '\n', '\0']) {
                return Err(format!("{name} inválido").into());
            }
            value
        } else {
            String::new()
        };
        println!("cargo:rustc-env={name}={value}");
    }
    let out = PathBuf::from(env::var_os("OUT_DIR").ok_or("OUT_DIR ausente")?);
    installed_members(&out)?;
    if env::var_os("CARGO_FEATURE_TRANSPORT").is_none() {
        return Ok(());
    }
    vantare_build_support::embed_installer(&version)?;
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

// One catalogue during the read-only transition: packaging owns these arrays
// until package migration (step 4) and removal of product PS (step 7).
fn installed_members(out: &std::path::Path) -> Result<(), Box<dyn std::error::Error>> {
    let path = PathBuf::from(env::var_os("CARGO_MANIFEST_DIR").ok_or("manifest dir")?)
        .join("../packaging/candidate.ps1");
    println!("cargo:rerun-if-changed={}", path.display());
    let source = fs::read_to_string(path)?;
    let array = |name: &str| -> Result<Vec<String>, Box<dyn std::error::Error>> {
        let prefix = format!("$script:{name} = @(");
        let body = source
            .split_once(&prefix)
            .ok_or("catalogue missing")?
            .1
            .split_once(')')
            .ok_or("catalogue not closed")?
            .0;
        let mut values = Vec::new();
        for line in body.lines() {
            let code = line.split('#').next().ok_or("catalogue line")?;
            for (index, token) in code.split('\'').enumerate() {
                if index % 2 == 1 {
                    values.push(token.to_owned());
                }
            }
        }
        Ok(values)
    };
    let mut members = Vec::new();
    for bin in array("NativeBuildBins")? {
        members.push(format!("bin/{bin}.exe"));
        members.push(format!("bin/{bin}.exe.sha256"));
    }
    members.extend(array("NativeFixtures")?);
    members.extend(
        [
            "candidate.ps1",
            "README.md",
            "licenses/OFL-Inter.txt",
            "dependencies.json",
        ]
        .map(str::to_owned),
    );
    members.extend(array("NativeRetiredMembers")?);
    fs::write(
        out.join("installed-members.rs"),
        format!("const KNOWN_MEMBERS: &[&str] = &{members:?};\n"),
    )?;
    Ok(())
}
