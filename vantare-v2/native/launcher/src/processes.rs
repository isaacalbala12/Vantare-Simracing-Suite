//! Propiedad de procesos de esta sesión; un PID observado nunca concede cierre.
use std::{
    path::{Path, PathBuf},
    process::Child,
    sync::{Arc, Mutex},
};

pub type Shared = Arc<Mutex<Processes>>;

struct Started {
    profile: String,
    app: String,
    path: PathBuf,
    child: Child,
}

#[derive(Default)]
pub struct Processes {
    started: Vec<Started>,
}

impl Processes {
    pub fn available(&mut self) -> Result<(), String> {
        self.reap()?;
        if self.started.len() >= 256 {
            return Err("límite de procesos iniciados alcanzado".into());
        }
        Ok(())
    }

    pub fn record(&mut self, profile: &str, app: &str, path: &Path, child: Child) {
        self.started.push(Started {
            profile: profile.into(),
            app: app.into(),
            path: path.into(),
            child,
        });
    }

    pub fn status(&mut self, pid: u32) -> Result<Option<std::process::ExitStatus>, String> {
        self.started
            .iter_mut()
            .find(|s| s.child.id() == pid)
            .ok_or("proceso iniciado no registrado")?
            .child
            .try_wait()
            .map_err(|e| format!("observar proceso iniciado: {e}"))
    }

    pub fn owns(&mut self, path: &Path, pids: &[u32]) -> Result<bool, String> {
        self.reap()?;
        let expected = std::fs::canonicalize(path).map_err(|e| format!("identidad de app: {e}"))?;
        Ok(!pids.is_empty()
            && pids.iter().all(|pid| {
                self.started.iter().any(|s| {
                    s.child.id() == *pid
                        && s.path
                            .as_os_str()
                            .eq_ignore_ascii_case(expected.as_os_str())
                })
            }))
    }

    pub fn has_profile(&mut self, profile: &str) -> Result<bool, String> {
        self.reap()?;
        Ok(self.started.iter().any(|s| s.profile == profile))
    }

    pub fn close_profile(&mut self, profile: &str) -> Result<(), String> {
        self.close_matching(|s| s.profile == profile)
    }

    pub fn restart(&mut self, path: &Path, pids: &[u32]) -> Result<(), String> {
        if !self.owns(path, pids)? {
            return Err("no se puede reiniciar una app abierta fuera de Vantare".into());
        }
        self.close_matching(|s| pids.contains(&s.child.id()))
    }

    fn close_matching(&mut self, matches: impl Fn(&Started) -> bool) -> Result<(), String> {
        let mut errors = Vec::new();
        for started in &mut self.started {
            if !matches(started) {
                continue;
            }
            let result = (|| {
                if started
                    .child
                    .try_wait()
                    .map_err(|e| e.to_string())?
                    .is_none()
                {
                    // Child conserva el handle original de CreateProcess, no reabre el PID.
                    started.child.kill().map_err(|e| e.to_string())?;
                    started.child.wait().map_err(|e| e.to_string())?;
                }
                Ok::<(), String>(())
            })();
            if let Err(error) = result {
                errors.push(format!("cerrar {}: {error}", started.app));
            }
        }
        self.reap()?;
        if errors.is_empty() {
            Ok(())
        } else {
            Err(errors.join("; "))
        }
    }

    fn reap(&mut self) -> Result<(), String> {
        let mut index = 0;
        while index < self.started.len() {
            if self.started[index]
                .child
                .try_wait()
                .map_err(|e| format!("observar proceso iniciado: {e}"))?
                .is_some()
            {
                self.started.remove(index);
            } else {
                index += 1;
            }
        }
        Ok(())
    }
}
