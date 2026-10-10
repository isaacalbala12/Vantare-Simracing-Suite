//! Recurso Win32 compartido: GPUI busca el icono del ejecutable con ID 1.
use std::{env, fs, path::PathBuf, process::Command};

pub fn embed() -> Result<(), Box<dyn std::error::Error>> {
    if !env::var("TARGET")?.ends_with("windows-msvc") {
        return Ok(());
    }
    let manifest = PathBuf::from(env::var_os("CARGO_MANIFEST_DIR").ok_or("manifest ausente")?);
    let icon = manifest.join("../assets/icon.ico").canonicalize()?;
    println!("cargo:rerun-if-changed={}", icon.display());
    println!("cargo:rerun-if-env-changed=WindowsSdkDir");
    let sdk = env::var_os("WindowsSdkDir")
        .map(PathBuf::from)
        .or_else(|| {
            env::var_os("ProgramFiles(x86)").map(|root| PathBuf::from(root).join("Windows Kits/10"))
        })
        .ok_or("Windows SDK ausente")?;
    let mut versions = fs::read_dir(sdk.join("bin"))?
        .map(|entry| entry.map(|entry| entry.path().join("x64/rc.exe")))
        .collect::<Result<Vec<_>, _>>()?;
    versions.sort();
    let compiler = versions
        .into_iter()
        .rev()
        .find(|path| path.is_file())
        .ok_or("rc.exe ausente en Windows SDK")?;
    let out = PathBuf::from(env::var_os("OUT_DIR").ok_or("OUT_DIR ausente")?);
    let source = out.join("vantare-icon.rc");
    let resource = out.join("vantare-icon.res");
    fs::write(
        &source,
        format!("1 ICON \"{}\"\n", icon.to_string_lossy().replace('\\', "/")),
    )?;
    let status = Command::new(compiler)
        .arg("/nologo")
        .arg("/fo")
        .arg(&resource)
        .arg(source)
        .status()?;
    if !status.success() {
        return Err(format!("compilar icono Win32: {status}").into());
    }
    println!("cargo:rustc-link-arg-bins={}", resource.display());
    Ok(())
}
