//! Clasificación de acceso compartida; ADR 0102, pasos 4 y 5.
use crate::{Error, protocol::RenewalOutcome};
use vantare_ipc::{control::Policy, services_protocol::Reply};

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
    /// Exige ACK durable antes de limpiar candidate o cerrar sesión.
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
            // Core(Rejected) no procede de license_remote::renew; la cuarentena
            // del candidate se hace en App::complete_online_renewal.
            let (renewal, oauth, core) = match error {
                Error::Authentication => (true, true, false),
                Error::Denied | Error::Conflict | Error::DeviceLimit => (true, false, true),
                Error::InvalidCredential | Error::Expired => (false, false, true),
                Error::Core(vantare_ipc::control::Failure::Rejected) => (true, false, false),
                _ => (false, false, false),
            };
            let (definitive, needs_sign_in) = match origin {
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
                    if policy.overlays_advanced
                        && policy.current_at(policy.checked_at_ms)
                        && !renewal_urgent(policy, policy.checked_at_ms) =>
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

/// Ventana existente de una hora; Policy todavía mezcla firma y gracia Live.
pub fn renewal_urgent(policy: &Policy, wall: u64) -> bool {
    renewal_deadline(policy).is_some_and(|end| end <= wall.saturating_add(60 * 60_000))
}

pub fn renewal_deadline(policy: &Policy) -> Option<u64> {
    policy.valid_until_ms.map(|end| {
        if policy.live {
            // Policy publica el plazo efectivo, que puede incluir gracia de juego.
            // Reservarla permite renovar antes del plazo firmado, sin ampliarlo.
            end.saturating_sub(crate::license::GAME_GRACE_SECONDS.unsigned_abs() * 1000)
        } else {
            end
        }
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn only_explicit_actions_revoke_and_oauth_rejections_require_sign_in() {
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
                    matches!(origin, Origin::OAuth { .. }) && error == Error::Authentication
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
