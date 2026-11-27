//! Clasificación de acceso compartida; ADR 0102, pasos 4 y 5.
use crate::{Error, protocol::RenewalOutcome};
use vantare_ipc::{
    control::Policy,
    services_protocol::{LicenseNotice, Reply},
};

/// Transport cannot disprove an existing actionable rejection.
pub fn notice_after(current: Option<LicenseNotice>, next: LicenseNotice) -> Option<LicenseNotice> {
    match next {
        LicenseNotice::DeviceLimit { .. }
        | LicenseNotice::Failure {
            outcome: RenewalOutcome::Definitive,
            ..
        } => Some(next),
        LicenseNotice::Failure { .. } => current,
    }
}

/// Aviso del estado, con frontera en hora local de pared para todas las vistas.
pub fn policy_message(policy: &Policy) -> Option<String> {
    let message = policy.state.message()?;
    if let vantare_ipc::control::AccessState::ClockBehind { until_ms } = policy.state {
        let until = i64::try_from(until_ms)
            .ok()
            .and_then(chrono::DateTime::from_timestamp_millis)
            .map(|date| {
                date.with_timezone(&chrono::Local)
                    .format("%d/%m/%Y %H:%M:%S %:z")
                    .to_string()
            });
        Some(match until {
            Some(until) => format!("{message} Frontera guardada (hora local): {until}."),
            None => format!("{message} La frontera guardada está fuera del rango de fechas."),
        })
    } else {
        Some(message.into())
    }
}

/// Se conserva el origen para diagnóstico; ninguna renovación revoca.
#[derive(Clone, Copy, Debug)]
pub enum Origin {
    Renewal { automatic: bool },
    OAuth { automatic: bool },
    Core { cached_clock_rejection: bool },
}

/// Únicas acciones con autoridad para revocar derechos locales.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Revocation {
    Logout,
    IdentityChange,
    DeviceReset,
}

#[derive(Clone, Copy)]
pub enum Observation<'a> {
    Action(Revocation),
    Error(Error, Origin),
    Reply(&'a Reply),
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct Outcome {
    pub renewal: RenewalOutcome,
    /// Exige ACK durable antes de anunciar revocación o cerrar sesión.
    pub revoke: bool,
    pub sign_out: bool,
    pub needs_sign_in: bool,
}

/// Única tabla de resultados y efectos. Los llamadores ejecutan los efectos,
/// conservando su orden y propagando los errores del ACK/almacenamiento.
pub fn outcome(observation: Observation<'_>) -> Outcome {
    use RenewalOutcome::{Definitive, Transient, Verified};
    let (renewal, revoke, sign_out, needs_sign_in) = match observation {
        Observation::Action(action) => (Transient, true, action == Revocation::Logout, false),
        Observation::Error(error, origin) => {
            // Columnas definitivas: renovación, OAuth, respuesta del núcleo.
            // Core(Rejected) no procede de license_remote::renew; App puede leer
            // el estado del núcleo para explicar la frontera de seguridad.
            let (renewal, oauth, core) = match error {
                Error::Authentication => (true, true, false),
                Error::Denied | Error::Conflict | Error::DeviceLimit => (true, false, true),
                Error::InvalidCredential | Error::Expired => (false, false, true),
                Error::Core(vantare_ipc::control::Failure::Rejected) => (true, false, false),
                _ => (false, false, false),
            };
            let (definitive, needs_sign_in) = match origin {
                Origin::Renewal { automatic: true } if error == Error::Authentication => {
                    (false, true)
                }
                Origin::Renewal { .. } => (renewal, false),
                Origin::OAuth { .. } => (oauth, oauth),
                Origin::Core {
                    cached_clock_rejection,
                } => (
                    core || (cached_clock_rejection && error == Error::Clock),
                    false,
                ),
            };
            (
                if definitive { Definitive } else { Transient },
                false,
                false,
                needs_sign_in,
            )
        }
        Observation::Reply(reply) => {
            let renewal = match reply {
                Reply::License { policy, .. }
                    if policy.state.permits_access() && policy.current_at(policy.checked_at_ms) =>
                {
                    Verified
                }
                Reply::LicenseFailure { outcome, .. } => *outcome,
                Reply::DeviceLimit { .. } => Definitive,
                _ => Transient,
            };
            (renewal, false, false, false)
        }
    };
    Outcome {
        renewal,
        revoke,
        sign_out,
        needs_sign_in,
    }
}

/// Margen de la renovación automática fuera de carrera: así el aviso de
/// «caduca pronto» (24 h) solo aparece si no se ha podido renovar.
pub const RENEW_AHEAD_AUTO_MS: u64 = 36 * 60 * 60_000;
/// Margen de la renovación en carrera: única ventana que abre la red en carrera.
pub const RENEW_AHEAD_URGENT_MS: u64 = 60 * 60_000;

/// Renovar antes del vencimiento firmado, sin sumar ni restar gracia local.
pub fn renewal_urgent(policy: &Policy, wall: u64) -> bool {
    renewal_within(policy, wall, RENEW_AHEAD_URGENT_MS)
}

/// Toca renovar automáticamente; sin fecha firmada nunca se adelanta.
pub fn renewal_due(policy: &Policy, wall: u64) -> bool {
    renewal_within(policy, wall, RENEW_AHEAD_AUTO_MS)
}

fn renewal_within(policy: &Policy, wall: u64, ahead: u64) -> bool {
    renewal_deadline(policy).is_some_and(|end| end <= wall.saturating_add(ahead))
}

pub fn renewal_deadline(policy: &Policy) -> Option<u64> {
    policy.signed_until_ms
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn automatic_renewal_starts_thirty_six_hours_ahead_and_urgent_stays_at_one_hour() {
        use vantare_ipc::control::{AccessState, Policy, VERSION};
        const HOUR: u64 = 60 * 60_000;
        assert_eq!(RENEW_AHEAD_AUTO_MS, 36 * HOUR);
        assert_eq!(RENEW_AHEAD_URGENT_MS, HOUR);
        let wall = 1_000_000;
        let at = |left: u64| Policy {
            version: VERSION,
            revision: 1,
            checked_at_ms: wall,
            state: AccessState::Active,
            signed_until_ms: Some(wall + left),
            ..Policy::default()
        };
        // (tiempo restante, renovación automática, renovación urgente)
        for (left, due, urgent) in [
            (36 * HOUR + 1, false, false),
            (36 * HOUR, true, false),
            (HOUR + 1, true, false),
            (HOUR, true, true),
            (0, true, true),
        ] {
            assert_eq!(renewal_due(&at(left), wall), due, "automática {left}");
            assert_eq!(renewal_urgent(&at(left), wall), urgent, "urgente {left}");
        }
        let unsigned = Policy {
            signed_until_ms: None,
            ..at(0)
        };
        assert!(!renewal_due(&unsigned, wall), "sin fecha firmada");
        assert!(!renewal_urgent(&unsigned, wall), "sin fecha firmada");
        assert!(renewal_due(&at(0), u64::MAX), "sin desbordar el reloj");
    }

    #[test]
    fn a_fresh_denied_state_is_never_a_verified_renewal() {
        use vantare_ipc::control::{AccessState, Policy, VERSION};
        for state in [
            AccessState::NoCredential,
            AccessState::RecoveryRequired,
            AccessState::ClockBehind { until_ms: 9000 },
            AccessState::Expired,
            AccessState::Revoked,
            AccessState::Unavailable,
            AccessState::Unconfigured,
            AccessState::UpdateRequired,
        ] {
            let reply = Reply::License {
                policy: Policy {
                    version: VERSION,
                    revision: 1,
                    checked_at_ms: 1000,
                    state,
                    ..Policy::default()
                },
                message: String::new(),
            };
            assert_eq!(
                outcome(Observation::Reply(&reply)).renewal,
                RenewalOutcome::Transient,
                "{state:?}"
            );
        }
    }

    #[test]
    fn signed_recovery_without_new_runway_is_verified_not_a_transport_failure() {
        use vantare_ipc::control::{AccessState, Policy, VERSION};
        for state in [AccessState::Active, AccessState::Grace] {
            let policy = Policy {
                version: VERSION,
                revision: 1,
                checked_at_ms: 1000,
                state,
                signed_until_ms: Some(2000),
                grace_until_ms: Some(3_602_000),
                ..Policy::default()
            };
            assert!(renewal_urgent(&policy, 1000));
            assert_eq!(renewal_deadline(&policy), Some(2000));
            assert_eq!(
                outcome(Observation::Reply(&Reply::License {
                    policy,
                    message: String::new()
                }))
                .renewal,
                RenewalOutcome::Verified
            );
        }
    }

    #[test]
    fn only_explicit_actions_revoke_and_authentication_rejections_require_sign_in() {
        for action in [
            Revocation::Logout,
            Revocation::IdentityChange,
            Revocation::DeviceReset,
        ] {
            let effects = outcome(Observation::Action(action));
            assert!(effects.revoke, "{action:?}");
            assert_eq!(effects.sign_out, action == Revocation::Logout);
            assert!(!effects.needs_sign_in);
        }
        for error in [
            Error::Authentication,
            Error::Denied,
            Error::Conflict,
            Error::DeviceLimit,
            Error::InvalidCredential,
            Error::Expired,
            Error::Offline,
            Error::Protocol,
            Error::Storage,
            Error::Clock,
            Error::AccountConflict,
            Error::Core(vantare_ipc::control::Failure::Rejected),
        ] {
            for origin in [
                Origin::Renewal { automatic: false },
                Origin::Renewal { automatic: true },
                Origin::OAuth { automatic: false },
                Origin::OAuth { automatic: true },
            ] {
                let effects = outcome(Observation::Error(error, origin));
                assert!(!effects.revoke, "{error:?}/{origin:?}");
                assert!(!effects.sign_out, "{error:?}/{origin:?}");
                assert_eq!(
                    effects.needs_sign_in,
                    matches!(
                        origin,
                        Origin::OAuth { .. } | Origin::Renewal { automatic: true }
                    ) && error == Error::Authentication
                );
            }
        }
    }

    #[test]
    fn reply_failures_preserve_the_reported_result_without_local_effects() {
        for renewal in [
            RenewalOutcome::Verified,
            RenewalOutcome::Transient,
            RenewalOutcome::Definitive,
        ] {
            let reply = Reply::LicenseFailure {
                outcome: renewal,
                message: String::new(),
            };
            assert_eq!(
                outcome(Observation::Reply(&reply)),
                Outcome {
                    renewal,
                    revoke: false,
                    sign_out: false,
                    needs_sign_in: false
                }
            );
        }
        assert_eq!(
            outcome(Observation::Reply(&Reply::DeviceLimit {
                message: String::new()
            })),
            Outcome {
                renewal: RenewalOutcome::Definitive,
                revoke: false,
                sign_out: false,
                needs_sign_in: false
            }
        );
        assert_eq!(
            outcome(Observation::Reply(&Reply::Error {
                message: String::new()
            })),
            Outcome {
                renewal: RenewalOutcome::Transient,
                revoke: false,
                sign_out: false,
                needs_sign_in: false
            }
        );
    }
}
