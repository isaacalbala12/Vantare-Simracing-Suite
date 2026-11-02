//! Un único bucle de E/S para Windows y Unix; `session::paso` decide qué hacer.
use super::{
    Child, Instance, Outcome, Service, Stop, child_shutdown, engineer_allowed, log, platform,
};
use super::{
    background::Workers,
    session::{Action, Event, Phase, Reason, Session},
};
use std::{
    collections::VecDeque,
    io,
    process::ExitCode,
    time::{Duration, Instant},
};

struct Driver<'a> {
    services: &'a mut [Service],
    workers: &'a mut Workers,
    machine: Session,
    primary: Option<io::Error>,
    closed: Option<io::Error>,
    grace: Duration,
}

impl Driver<'_> {
    fn wait(&mut self, stop: &Stop, instance: &Instance, timeout: Duration) {
        match platform::wait(
            stop,
            instance,
            self.services,
            timeout,
            !self.machine.stopping(),
        ) {
            Ok(true) => {
                let actions = self
                    .machine
                    .paso(Event::Stop(Reason::Stopped), Instant::now());
                self.actions(actions);
            }
            Ok(false) => {}
            Err(error) => {
                let actions = self.error(error);
                self.actions(actions);
                std::thread::sleep(timeout.min(Duration::from_millis(25)));
            }
        }
    }

    fn error(&mut self, error: io::Error) -> Vec<Action> {
        if self.machine.stopping() {
            self.closed.get_or_insert(error);
            Vec::new()
        } else {
            self.primary.get_or_insert(error);
            self.machine
                .paso(Event::Stop(Reason::Failed), Instant::now())
        }
    }

    fn actions(&mut self, actions: Vec<Action>) {
        let mut pending: VecDeque<_> = actions.into();
        while let Some(action) = pending.pop_front() {
            let event = match action {
                Action::Spawn(index) => {
                    if !self.machine.can_spawn(index) {
                        continue;
                    }
                    match self.services[index].spawn() {
                        Ok(()) => Event::Started(index),
                        Err(error) => {
                            log(format_args!(
                                "{}: no arranca: {error}",
                                self.services[index].name
                            ));
                            Event::SpawnFailed(index)
                        }
                    }
                }
                Action::Close(index) => {
                    log(format_args!(
                        "EOF solicitado: {}",
                        self.services[index].name
                    ));
                    if let Some(child) = &mut self.services[index].child {
                        drop(child.stdin.take());
                    }
                    continue;
                }
                Action::Kill(index) => {
                    if !self.machine.killing(index) {
                        continue;
                    }
                    let service = &mut self.services[index];
                    let mut reaped = true;
                    if let Some(child) = &mut service.child {
                        let result =
                            child_shutdown::force(child, service.name, self.grace, Child::kill);
                        reaped = child.try_wait().is_ok_and(|status| status.is_some());
                        if let Err(error) = result {
                            log(format_args!("{} no se pudo cerrar: {error}", service.name));
                            if self.machine.stopping() {
                                self.closed.get_or_insert(error);
                            } else {
                                log(format_args!(
                                    "{} revocado: cierre fallido: {error}",
                                    service.name
                                ));
                            }
                        }
                    }
                    if reaped {
                        service.child.take();
                    }
                    Event::Killed {
                        child: index,
                        reaped,
                    }
                }
                Action::Backoff { child, delay } => {
                    log(format_args!(
                        "{}: reinicio en {delay:?}",
                        self.services[child].name
                    ));
                    continue;
                }
                Action::StopWorkers => {
                    self.workers.request_shutdown();
                    continue;
                }
                Action::ForceWorkers => {
                    log("plazo global agotado: worker de sesión no respondió; salida forzada");
                    self.workers.force_on_exit();
                    self.closed.get_or_insert_with(|| {
                        io::Error::new(io::ErrorKind::TimedOut, "worker de sesión fuera de plazo")
                    });
                    continue;
                }
            };
            pending.extend(self.machine.paso(event, Instant::now()));
        }
    }

    fn observe(&mut self) {
        for index in 0..self.services.len() {
            let Some(child) = &mut self.services[index].child else {
                continue;
            };
            match child.try_wait() {
                Ok(Some(status)) => {
                    let name = self.services[index].name;
                    self.services[index].child.take();
                    if self.machine.closing(index) {
                        child_shutdown::report(name, status);
                    } else if !status.success() {
                        log(format_args!("{name} cayó: {status}"));
                    }
                    let actions = self.machine.paso(
                        Event::Exited {
                            child: index,
                            success: status.success(),
                        },
                        Instant::now(),
                    );
                    self.actions(actions);
                }
                Ok(None) => {}
                Err(error) => {
                    let actions = self.error(error);
                    self.actions(actions);
                }
            }
        }
    }
}

/// EOF a consumidores en orden de política; núcleo tras ellos o al comenzar
/// su reserva. P nace una vez. La revocación no falla la sesión; el cierre final
/// sí informa kills/defectos, conservando siempre el motivo original.
pub(super) fn run(
    services: &mut [Service],
    stop: &Stop,
    instance: &Instance,
    rights: Option<&vantare_ipc::control::Feed>,
    grace: Duration,
    workers: &mut Workers,
) -> io::Result<ExitCode> {
    run_with_error(services, stop, instance, rights, grace, workers, None)
}

#[cfg(windows)]
pub(super) fn fail_setup(
    stop: &Stop,
    instance: &Instance,
    grace: Duration,
    workers: &mut Workers,
    error: io::Error,
) -> io::Result<ExitCode> {
    run_with_error(&mut [], stop, instance, None, grace, workers, Some(error))
}

fn run_with_error(
    services: &mut [Service],
    stop: &Stop,
    instance: &Instance,
    rights: Option<&vantare_ipc::control::Feed>,
    grace: Duration,
    workers: &mut Workers,
    primary: Option<io::Error>,
) -> io::Result<ExitCode> {
    let machine = Session::new(
        services.iter().map(|service| service.policy),
        grace,
        Instant::now(),
    );
    let mut driver = Driver {
        services,
        workers,
        machine,
        primary,
        closed: None,
        grace,
    };
    if driver.primary.is_some() {
        let actions = driver
            .machine
            .paso(Event::Stop(Reason::Failed), Instant::now());
        driver.actions(actions);
    }
    loop {
        // Conserva la prioridad de Stop frente a salidas simultáneas de hijos.
        if !driver.machine.stopping() {
            driver.wait(stop, instance, Duration::ZERO);
        }
        let workers_done = if driver.machine.stopping() {
            match driver.workers.poll_shutdown() {
                Ok(done) => done,
                Err(error) => {
                    driver.closed.get_or_insert(error);
                    false
                }
            }
        } else {
            false
        };
        let permitted = rights.is_some_and(|feed| engineer_allowed(&feed.policy()));
        let actions = driver.machine.paso(
            Event::Tick {
                permitted,
                workers_done,
            },
            Instant::now(),
        );
        driver.actions(actions);
        // force() vuelve a consultar el estado antes del kill. Tick procesa
        // primero la revocación para no confundirla con una salida espontánea.
        driver.observe();
        if let Phase::Finished(reason) = driver.machine.phase {
            // No hay Job en Unix: incluso ante error se intenta matar y recoger
            // explícitamente cualquier hijo cuyo primer kill falló.
            for service in driver.services.iter_mut() {
                service.reap_on_exit();
            }
            let outcome = if let Some(error) = driver.primary.take() {
                Err(error)
            } else {
                Ok(match reason {
                    Reason::Stopped | Reason::Failed => Outcome::Stopped,
                    Reason::Finished(index) => Outcome::Finished(driver.services[index].name),
                    Reason::Exhausted(index) => Outcome::Exhausted(driver.services[index].name),
                })
            };
            return child_shutdown::finish_run(outcome, driver.closed.take().map_or(Ok(()), Err));
        }
        let timeout = driver.machine.wait_for(Instant::now());
        driver.wait(stop, instance, timeout);
    }
}
