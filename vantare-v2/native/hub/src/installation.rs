//! Sincroniza el nombre visible incluso con el bootstrap del feed anterior.
use std::path::Path;

#[cfg(windows)]
fn installed_script(executable: &Path, root: &Path) -> Result<std::path::PathBuf, String> {
    let bin = executable.parent().ok_or("falta la carpeta bin")?;
    let generation = bin.parent().ok_or("falta la generación")?;
    let generations = generation.parent().ok_or("faltan las generaciones")?;
    let id = generation.file_name().and_then(|name| name.to_str());
    if executable.file_name().and_then(|name| name.to_str()) != Some("vantare-hub.exe")
        || bin.file_name().and_then(|name| name.to_str()) != Some("bin")
        || generations != root.join("generations")
        || !id.is_some_and(|id| {
            id.len() == 32
                && id
                    .bytes()
                    .all(|byte| byte.is_ascii_digit() || (b'a'..=b'f').contains(&byte))
        })
    {
        return Err("el Hub no pertenece a esta instalación".into());
    }
    Ok(generation.join("candidate.ps1"))
}

pub(crate) fn confirm_ready(root: &Path) -> Result<(), String> {
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        // El script ya pertenece al inventario firmado/verificado del paquete.
        // No se ejecuta la copia raíz congelada que conserva el updater antiguo.
        let executable = std::env::current_exe().map_err(|error| error.to_string())?;
        let script = installed_script(&executable, root)?;
        let windows = std::env::var_os("WINDIR").ok_or("Windows no disponible")?;
        let status = std::process::Command::new(
            Path::new(&windows).join("System32/WindowsPowerShell/v1.0/powershell.exe"),
        )
        .args(["-NoProfile", "-ExecutionPolicy", "Bypass", "-File"])
        .arg(script)
        .args(["-Operation", "Register", "-Root"])
        .arg(root)
        .creation_flags(0x0800_0000) // CREATE_NO_WINDOW: sin consola al abrir el Hub.
        .status()
        .map_err(|error| format!("actualizar nombre instalado: {error}"))?;
        if !status.success() {
            return Err("no se pudo actualizar el nombre instalado de Vantare".into());
        }
    }
    std::fs::write(root.join("hub-ready"), std::process::id().to_string())
        .map_err(|error| format!("confirmar arranque: {error}"))
}

#[cfg(all(test, windows))]
mod tests {
    use super::*;

    #[test]
    fn feed_uses_its_generation_and_rejects_another_installation() {
        let root = Path::new("C:/qa/Vantare Native Beta");
        let generation = root.join("generations/0123456789abcdef0123456789abcdef");
        let executable = generation.join("bin/vantare-hub.exe");
        assert_eq!(
            installed_script(&executable, root).unwrap(),
            generation.join("candidate.ps1")
        );
        assert!(installed_script(&executable, Path::new("C:/another installation")).is_err());
        assert!(installed_script(&root.join("bin/vantare-hub.exe"), root).is_err());
        assert!(installed_script(&generation.join("bin/another.exe"), root).is_err());
        assert!(
            installed_script(&root.join("generations/invalid/bin/vantare-hub.exe"), root).is_err()
        );
    }
}

/// Run y toasts usan la identidad del instalador, también en QA aislada.
pub(crate) fn hub_identity() -> Result<String, String> {
    hub_identity_at(
        std::env::var_os("VANTARE_BETA_ROOT")
            .as_deref()
            .map(Path::new),
    )
}

fn hub_identity_at(root: Option<&Path>) -> Result<String, String> {
    let Some(root) = root else {
        return Ok("VantareNative.Hub".into());
    };
    let identity = match std::fs::read_to_string(root.join("registration-identity.txt")) {
        Ok(identity) => identity,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => {
            return Ok("VantareNative.Hub".into());
        }
        Err(error) => return Err(format!("leer identidad instalada: {error}")),
    };
    let identity = identity.trim();
    if identity.is_empty()
        || identity.len() > 64
        || !identity.bytes().all(|byte| byte.is_ascii_alphanumeric())
    {
        return Err("Identidad de registro inválida".into());
    }
    Ok(if identity == "VantareNativeBeta" {
        "VantareNative.Hub".into()
    } else {
        format!("{identity}.Hub")
    })
}

#[cfg(test)]
mod identity_tests {
    use super::*;
    #[test]
    fn isolated_installation_does_not_use_the_real_run_or_toast_identity() {
        let root = std::env::temp_dir().join(format!("vantare-identity-{}", std::process::id()));
        std::fs::create_dir_all(&root).expect("raíz propia");
        assert_eq!(hub_identity_at(None).unwrap(), "VantareNative.Hub");
        assert_eq!(hub_identity_at(Some(&root)).unwrap(), "VantareNative.Hub");
        for (marker, expected) in [
            ("VantareNativeBeta", "VantareNative.Hub"),
            ("VantareQAIntegration", "VantareQAIntegration.Hub"),
        ] {
            std::fs::write(root.join("registration-identity.txt"), marker).unwrap();
            assert_eq!(hub_identity_at(Some(&root)).unwrap(), expected);
        }
        std::fs::write(root.join("registration-identity.txt"), "invalid/identity").unwrap();
        assert!(hub_identity_at(Some(&root)).is_err());
        std::fs::remove_dir_all(root).unwrap();
    }
}
