//! Only this host adapter performs IO; Calendar never sends a legacy launch.
use super::{HostError, HostToUi, Pipe, Reply, Request, Session, frame, io};
use crate::launcher::editor::{ProfileClose, ProfileFailure, ProfileRetry, ProfileRunning};
use crate::{
    calendar::{
        CalendarLaunchMode, CalendarLaunchView,
        launch::{Binding, Clock, scope_stop},
        launch_types,
    },
    protocol::{Event, Topic},
};
pub(super) fn publish(session: &mut Session, pipe: &mut Pipe, force: bool) -> io::Result<()> {
    let value = session.calendar_launch.view();
    if session.subscriptions.contains(&Topic::CalendarLaunch)
        && (force || session.calendar_launch_published.as_ref() != Some(&value))
    {
        frame::write(
            pipe,
            &HostToUi::Event {
                event: Event::CalendarLaunch {
                    value: Box::new(value.clone()),
                },
            },
        )?;
        session.calendar_launch_published = Some(value);
    }
    Ok(())
}
fn arm(
    session: &mut Session,
    profile: &str,
    revision: &str,
    generation: &str,
    mode: &CalendarLaunchMode,
    now: Clock,
) -> Result<
    (
        CalendarLaunchView,
        Option<Box<crate::calendar::CalendarConfigView>>,
    ),
    HostError,
> {
    if !launch_types::token(revision)
        || !launch_types::token(generation)
        || profile.is_empty()
        || profile.len() > crate::launcher::ID_LIMIT
        || profile.contains('\0')
    {
        return Err(HostError::Rejected);
    }
    if scope_stop(&session.current, session.closing.is_some(), generation).is_some() {
        return Err(HostError::Denied);
    }
    let observed = session
        .core
        .account_observation()
        .ok_or(HostError::CoreUnavailable)?;
    if String::from(observed.generation.clone()) != generation
        || !u64::try_from(now.wall).is_ok_and(|wall| observed.policy.permits_launch(wall))
    {
        return Err(HostError::Denied);
    }
    let resident = session.launcher_resident_state.view();
    if !resident.online || resident.protected {
        return Err(HostError::CoreUnavailable);
    }
    let execution = resident
        .execution
        .as_ref()
        .filter(|e| e.revision_checked_launch)
        .ok_or(HostError::Unsupported)?;
    if resident.running {
        return Err(HostError::Busy);
    }
    let editor = crate::launcher::editor::get(&session.launcher, Some(profile))?;
    if editor.revision != revision {
        return Err(HostError::LauncherConflict {
            current: session.launcher_reader.view(),
        });
    }
    if editor.draft.steps.is_empty() {
        return Err(HostError::Denied);
    }
    let policy = &editor.draft.policy;
    let decision_required = policy.already_running == ProfileRunning::Ask
        || policy.failure == ProfileFailure::Ask
        || policy.cancel == ProfileClose::Ask
        || policy.exit == ProfileClose::Ask
        || policy.retry == ProfileRetry::Ask;
    let plan = crate::calendar::CalendarLaunchPlan {
        arm_id: vantare_services::random_id().map_err(|_| HostError::Io)?,
        profile: profile.into(),
        profile_name: editor.draft.name,
        decision_required,
        mode: mode.clone(),
    };
    let binding = Binding::new(
        plan,
        revision.into(),
        generation.into(),
        execution.instance.clone(),
        now,
    )?;
    let config = session
        .calendar_state
        .prepare_launch(mode, now)?
        .map(Box::new);
    session.calendar_launch.install(binding, now);
    Ok((session.calendar_launch.view(), config))
}
pub(super) fn dispatch_at(
    session: &mut Session,
    pipe: &mut Pipe,
    id: u32,
    request: &Request,
    now: Clock,
) -> io::Result<()> {
    let result = match request {
        Request::CalendarLaunchArm {
            profile,
            base_revision,
            armed_generation,
            mode,
        } => arm(session, profile, base_revision, armed_generation, mode, now).map(
            |(value, config)| Reply::CalendarLaunchArm {
                value: Box::new(value),
                config,
            },
        ),
        Request::CalendarLaunchCancel { arm_id } => {
            session.calendar_launch.cancel(arm_id);
            Ok(Reply::CalendarLaunchCancel {
                value: Box::new(session.calendar_launch.view()),
            })
        }
        _ => return Err(io::ErrorKind::InvalidInput.into()),
    };
    frame::write(
        pipe,
        &match result {
            Ok(result) => HostToUi::Response { id, result },
            Err(error) => HostToUi::Failure { id, error },
        },
    )?;
    publish(session, pipe, false)
}
pub(super) fn tick(session: &mut Session, pipe: &mut Pipe, now: Clock) -> io::Result<()> {
    if !session.calendar_launch.active() {
        return publish(session, pipe, false);
    }
    let reader = &mut session.launcher_resident_state;
    let resident = session
        .calendar_launch
        .resident(now.monotonic, || reader.view());
    let (ready, auto, candidates) = if session.calendar_launch.automatic_since().is_some() {
        session.calendar_state.launch_sources(now.wall)
    } else {
        (true, false, vec![])
    };
    if let Some(due) = session.calendar_launch.step(
        crate::calendar::launch::Inputs {
            core: &session.current,
            closing: session.closing.is_some(),
            resident: &resident,
            alerts_ready: ready,
            auto_enabled: auto,
            candidates: &candidates,
        },
        now,
    ) {
        let result = session
            .calendar_state
            .launch_target(
                &due.candidate.series_id,
                due.candidate.start_at,
                now.wall,
                false,
            )
            .and_then(|()| {
                let generation = due
                    .binding
                    .generation
                    .clone()
                    .try_into()
                    .map_err(|_| HostError::Denied)?;
                crate::launcher::checked::launch_for_instance(
                    &session.launcher,
                    session.core.account_observation().as_ref(),
                    &generation,
                    &due.binding.plan.profile,
                    &due.binding.revision,
                    &due.binding.instance,
                )
            });
        session
            .calendar_launch
            .sent(due, result, &resident, now.monotonic);
    }
    publish(session, pipe, false)
}
