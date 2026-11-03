//! Windows presentation and the installer's in-process Startup projection.
#![allow(unsafe_code)]

pub(in crate::shell) fn reduced_motion() -> bool {
    #[cfg(windows)]
    {
        #[link(name = "user32")]
        unsafe extern "system" {
            fn SystemParametersInfoW(
                action: u32,
                parameter: u32,
                value: *mut i32,
                flags: u32,
            ) -> i32;
        }
        let mut enabled = 0;
        // SAFETY: SPI_GETCLIENTAREAANIMATION writes a BOOL to this local buffer.
        unsafe { SystemParametersInfoW(0x1042, 0, &raw mut enabled, 0) == 0 || enabled == 0 }
    }
    #[cfg(not(windows))]
    {
        false
    }
}

pub(super) struct StartupChange {
    root: std::path::PathBuf,
    enabled: bool,
}

impl StartupChange {
    pub(super) fn start(enabled: bool) -> Result<Self, String> {
        #[cfg(windows)]
        {
            let root = std::path::PathBuf::from(
                std::env::var_os("VANTARE_BETA_ROOT")
                    .ok_or("Instala Vantare con Setup para iniciar con Windows")?,
            );
            if !root.is_absolute() {
                return Err("Raíz de instalación inválida".into());
            }
            Ok(Self { root, enabled })
        }
        #[cfg(not(windows))]
        {
            let _ = enabled;
            Err("Inicio automático disponible solo en Windows".into())
        }
    }

    pub(super) async fn complete(self, executor: gpui::BackgroundExecutor) -> Result<(), String> {
        #[cfg(windows)]
        {
            executor
                .spawn(async move {
                    vantare_installer::engine::shell::sync_running(&self.root, Some(self.enabled))
                        .map_err(|error| error.to_string())
                })
                .await
        }
        #[cfg(not(windows))]
        {
            let _ = executor;
            Err("Inicio automático disponible solo en Windows".into())
        }
    }
}

pub(in crate::shell) fn installed_startup() -> Option<bool> {
    installed_startup_at(std::path::Path::new(&std::env::var_os(
        "VANTARE_BETA_ROOT",
    )?))
}

pub(super) fn installed_startup_at(root: &std::path::Path) -> Option<bool> {
    vantare_installer::engine::context::startup(root)
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn installed_preference_has_priority_over_legacy() {
        let parent = if std::env::var("CI").as_deref() == Ok("true") {
            std::path::PathBuf::from(std::env::var_os("RUNNER_TEMP").expect("CI QA root"))
        } else {
            std::path::PathBuf::from("D:/VantareServer/qa/isa-1840")
        };
        let root = parent.join(format!("startup-read-{}", std::process::id()));
        vantare_installer::engine::context::qa_path(&root).unwrap();
        std::fs::create_dir_all(&root).unwrap();
        std::fs::write(
            root.join("startup-options.json"),
            br#"{"schema":1,"autostart":true}"#,
        )
        .unwrap();
        assert_eq!(installed_startup_at(&root), Some(true));
        std::fs::write(
            root.join("installer-ui.json"),
            format!(
                "{{\"schema\":1,\"kind\":\"rust-gpui\",\"uninstaller\":\"Uninstall.exe\",\"sha256\":\"{}\",\"desktop\":false,\"autostart\":false}}",
                "a".repeat(64)
            ),
        )
        .unwrap();
        assert_eq!(installed_startup_at(&root), Some(false));
        std::fs::remove_dir_all(root).unwrap();
    }
}
