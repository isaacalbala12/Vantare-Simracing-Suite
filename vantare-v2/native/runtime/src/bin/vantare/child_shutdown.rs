//! Política común de cierre para Windows y Unix.
use super::{Outcome, log};
use std::io;
use std::process::{Child, ExitCode, ExitStatus};
use std::time::Duration;

pub(super) fn report(name: &str, status: ExitStatus) {
    if status.success() {
        log(format_args!("{name} cerrado"));
    } else {
        // El hijo atendió el cierre. Su código se diagnostica, no es un kill.
        log(format_args!("{name} cerró con {status}"));
    }
}

pub(super) fn force(
    child: &mut Child,
    name: &str,
    grace: Duration,
    kill: impl FnOnce(&mut Child) -> io::Result<()>,
) -> io::Result<()> {
    if let Some(status) = child.try_wait()? {
        report(name, status);
        return Ok(());
    }
    match kill(child) {
        Ok(()) => {
            let status = child.wait()?;
            // Child::kill puede tener éxito aunque el hijo ya haya salido.
            if natural_exit(status) {
                report(name, status);
                return Ok(());
            }
            log(format_args!("{name} no terminó en {grace:?}: se le mata"));
            Err(io::Error::new(
                io::ErrorKind::TimedOut,
                format!("cierre forzado de {name} tras {grace:?}"),
            ))
        }
        Err(error) => match child.try_wait()? {
            Some(status) => {
                report(name, status);
                Ok(())
            }
            None => Err(error),
        },
    }
}

fn natural_exit(status: ExitStatus) -> bool {
    #[cfg(unix)]
    {
        // SIGKILL no tiene código; una salida natural con código no fue un kill.
        status.code().is_some()
    }
    #[cfg(not(unix))]
    {
        status.success()
    }
}

pub(super) fn finish_run(
    outcome: io::Result<Outcome>,
    closed: io::Result<()>,
) -> io::Result<ExitCode> {
    // El cierre ya se intentó para todos los hijos. Conserva el error original
    // o registra el motivo de supervisión antes de propagar el error de cierre.
    let code = match outcome? {
        Outcome::Stopped => ExitCode::SUCCESS,
        Outcome::Finished(name) => {
            log(format_args!("{name} terminó: se cierra todo"));
            ExitCode::SUCCESS
        }
        Outcome::Exhausted(name) => {
            log(format_args!(
                "{name}: presupuesto de reinicios agotado, se para"
            ));
            ExitCode::FAILURE
        }
    };
    closed?;
    Ok(code)
}

#[cfg(test)]
mod tests;
