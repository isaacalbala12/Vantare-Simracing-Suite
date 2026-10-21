//! Recurso Win32 compartido: GPUI busca el icono del ejecutable con ID 1.
use std::{env, fs, path::PathBuf, process::Command};

pub fn embed() -> Result<(), Box<dyn std::error::Error>> {
    embed_for(None)
}

/// Share the icon with a single entry point in a crate that also has CLI tools.
pub fn embed_binary(binary: &str) -> Result<(), Box<dyn std::error::Error>> {
    embed_for(Some(binary))
}

fn embed_for(binary: Option<&str>) -> Result<(), Box<dyn std::error::Error>> {
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
    if let Some(binary) = binary {
        println!("cargo:rustc-link-arg-bin={binary}={}", resource.display());
    } else {
        println!("cargo:rustc-link-arg-bins={}", resource.display());
    }
    Ok(())
}

/// Installer version resources without changing resources of application binaries.
pub fn embed_installer(version: &str) -> Result<(), Box<dyn std::error::Error>> {
    embed()?;
    if !env::var("TARGET")?.ends_with("windows-msvc") {
        return Ok(());
    }
    let parts = version
        .split('.')
        .map(str::parse::<u16>)
        .collect::<Result<Vec<_>, _>>()?;
    if parts.len() != 3 {
        return Err("installer version requires major.minor.patch".into());
    }
    let sdk = env::var_os("WindowsSdkDir")
        .map(PathBuf::from)
        .or_else(|| {
            env::var_os("ProgramFiles(x86)").map(|p| PathBuf::from(p).join("Windows Kits/10"))
        })
        .ok_or("Windows SDK absent")?;
    let mut compilers = fs::read_dir(sdk.join("bin"))?
        .map(|entry| entry.map(|e| e.path().join("x64/rc.exe")))
        .collect::<Result<Vec<_>, _>>()?;
    compilers.sort();
    let compiler = compilers
        .into_iter()
        .rev()
        .find(|p| p.is_file())
        .ok_or("rc.exe absent")?;
    let out = PathBuf::from(env::var_os("OUT_DIR").ok_or("OUT_DIR absent")?);
    for (bin, description) in [
        ("vantare-setup", "Instalador Vantare"),
        ("vantare-uninstall", "Desinstalador Vantare"),
    ] {
        let source = out.join(format!("{bin}.rc"));
        let resource = out.join(format!("{bin}.res"));
        fs::write(
            &source,
            format!(
                r#"
#pragma code_page(65001)
1 VERSIONINFO
FILEVERSION {a},{b},{c},0
PRODUCTVERSION {a},{b},{c},0
FILEOS 0x40004
FILETYPE 1
BEGIN
 BLOCK "StringFileInfo"
 BEGIN
  BLOCK "0c0a04b0"
  BEGIN
   VALUE "ProductName", "Vantare\0"
   VALUE "ProductVersion", "{version}\0"
   VALUE "FileVersion", "{version}\0"
   VALUE "FileDescription", "{description}\0"
   VALUE "InternalName", "{bin}\0"
   VALUE "LegalCopyright", "Vantare 2026\0"
  END
 END
 BLOCK "VarFileInfo"
 BEGIN
  VALUE "Translation", 0x0c0a, 1200
 END
END
"#,
                a = parts[0],
                b = parts[1],
                c = parts[2]
            ),
        )?;
        let status = Command::new(&compiler)
            .args(["/nologo", "/fo"])
            .arg(&resource)
            .arg(&source)
            .status()?;
        if !status.success() {
            return Err(format!("installer resource: {status}").into());
        }
        println!("cargo:rustc-link-arg-bin={bin}={}", resource.display());
        // GPUI already embeds its asInvoker/PerMonitorV2 manifest in gpui.lib.
        // A second /MANIFEST:EMBED produces a duplicate resource at link time.
    }
    Ok(())
}
