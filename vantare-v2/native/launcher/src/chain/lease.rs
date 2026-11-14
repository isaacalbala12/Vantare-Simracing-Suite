use super::StartError;

pub fn acquire(settings: &std::path::Path) -> Result<std::fs::File, StartError> {
    // Shared by start and checked removal; keep the existing lock identity.
    let mut options = std::fs::File::options();
    options.read(true).write(true).create(true).truncate(false);
    #[cfg(windows)]
    {
        use std::os::windows::fs::OpenOptionsExt as _;
        options
            .access_mode(0xc001_0000) // GENERIC_READ | GENERIC_WRITE | DELETE.
            .share_mode(0)
            .custom_flags(0x0420_0000); // DELETE_ON_CLOSE | OPEN_REPARSE_POINT.
    }
    let lease = options
        .open(settings.with_extension("chain-lock"))
        .map_err(|error| {
            let message = format!("bloquear cadena Launcher: {error}");
            if error.kind() == std::io::ErrorKind::WouldBlock || super::chain_lock_busy(&error) {
                StartError::Busy(message)
            } else {
                StartError::Io(message)
            }
        })?;
    lease.try_lock().map_err(|error| match error {
        std::fs::TryLockError::WouldBlock => {
            StartError::Busy("ya hay una cadena Launcher activa".into())
        }
        std::fs::TryLockError::Error(error) => {
            StartError::Io(format!("bloquear cadena Launcher: {error}"))
        }
    })?;

    Ok(lease)
}
