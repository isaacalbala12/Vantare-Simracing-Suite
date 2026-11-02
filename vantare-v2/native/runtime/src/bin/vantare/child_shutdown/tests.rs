use super::*;
use std::process::{Command, Stdio};

struct OwnedChild(Child);

impl Drop for OwnedChild {
    fn drop(&mut self) {
        let _killed = self.0.kill();
        let _reaped = self.0.wait();
    }
}

fn waiting(code: u8) -> OwnedChild {
    #[cfg(windows)]
    let mut command = {
        use std::os::windows::process::CommandExt;
        let mut command = Command::new("cmd.exe");
        command.args(["/D", "/C", &format!("set /p line= & exit /b {code}")]);
        command.creation_flags(0x0800_0000);
        command
    };
    #[cfg(unix)]
    let mut command = {
        let mut command = Command::new("sh");
        command.args(["-c", &format!("read line; exit {code}")]);
        command
    };
    OwnedChild(
        command
            .stdin(Stdio::piped())
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .spawn()
            .expect("hijo propio bloqueado por stdin"),
    )
}

fn close_and_wait(child: &mut Child) {
    drop(child.stdin.take());
    child.wait().expect("barrera de salida");
}

#[test]
fn an_exit_before_kill_is_clean_even_with_a_nonzero_code() {
    for code in [0, 7] {
        let mut child = waiting(code);
        close_and_wait(&mut child.0);
        force(&mut child.0, "fixture", Duration::ZERO, |_| {
            panic!("no matar un hijo que ya salió")
        })
        .expect("salida espontánea diagnosticada sin fallo de cierre");
    }
}

#[test]
fn successful_exit_racing_a_successful_kill_is_clean() {
    let mut child = waiting(0);
    force(&mut child.0, "fixture", Duration::ZERO, |child| {
        close_and_wait(child); // Sale después del último try_wait, antes del kill.
        Ok(())
    })
    .expect("el éxito de kill no demuestra que haya matado al hijo");
}

#[test]
fn an_exit_racing_a_failed_kill_is_clean() {
    for code in [0, 7] {
        let mut child = waiting(code);
        force(&mut child.0, "fixture", Duration::ZERO, |child| {
            close_and_wait(child);
            Err(io::ErrorKind::PermissionDenied.into())
        })
        .expect("salida observada tras el fallo de kill");
    }
}

#[test]
#[cfg(unix)]
fn a_natural_nonzero_exit_racing_a_successful_kill_is_not_a_signal_kill() {
    let mut child = waiting(7);
    force(&mut child.0, "fixture", Duration::ZERO, |child| {
        close_and_wait(child);
        Ok(())
    })
    .expect("status.code distingue salida natural de SIGKILL");
}

#[test]
fn actually_killing_the_blocked_child_is_a_shutdown_failure() {
    let mut child = waiting(0);
    assert_eq!(
        force(&mut child.0, "fixture", Duration::ZERO, Child::kill)
            .expect_err("kill real")
            .kind(),
        io::ErrorKind::TimedOut
    );
    assert!(child.0.try_wait().expect("recogido").is_some());
}

#[test]
fn supervision_error_has_priority_over_shutdown_error() {
    assert_eq!(
        finish_run(
            Err(io::ErrorKind::InvalidData.into()),
            Err(io::ErrorKind::TimedOut.into()),
        )
        .expect_err("conservar el motivo original")
        .kind(),
        io::ErrorKind::InvalidData
    );
    assert_eq!(
        finish_run(Ok(Outcome::Stopped), Err(io::ErrorKind::TimedOut.into()))
            .expect_err("el kill final sigue siendo fallo")
            .kind(),
        io::ErrorKind::TimedOut
    );
}

#[test]
#[cfg(unix)]
fn another_signal_racing_our_kill_is_not_reported_as_our_sigkill() {
    let mut child = waiting(0);
    force(&mut child.0, "fixture", Duration::ZERO, |child| {
        assert!(
            Command::new("kill")
                .args(["-TERM", &child.id().to_string()])
                .status()?
                .success()
        );
        child.wait()?;
        Ok(())
    })
    .expect("SIGTERM observada no es nuestro SIGKILL");
}
