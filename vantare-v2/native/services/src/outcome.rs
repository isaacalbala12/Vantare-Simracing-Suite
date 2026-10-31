//! Clasificación de acceso compartida; paso 4 de ADR 0102, sin cambiar efectos.
use crate::{Error, protocol::RenewalOutcome};
use vantare_ipc::{control::Policy, services_protocol::Reply};

/// La columna manual sigue revocando hasta el cambio acordado del paso 5.
#[derive(Clone, Copy, Debug)]
pub enum Origin {
    Renewal { automatic: bool },
    OAuth { automatic: bool },
    Core { cached_clock_rejection: bool },
}

#[derive(Clone, Copy)]
pub enum Observation<'a> {
    Error(Error, Origin),
    Reply(&'a Reply),
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct Outcome {
    pub renewal: RenewalOutcome,
    /// Exige ACK durable antes de limpiar candidate o cerrar sesión.
    pub revoke: bool,
    pub sign_out: bool,
}

/// Única tabla de resultados y efectos. Los llamadores ejecutan los efectos,
/// conservando su orden y propagando los errores del ACK/almacenamiento.
pub fn outcome(observation: Observation<'_>) -> Outcome {
    use RenewalOutcome::{Definitive, Transient, Verified};
    let (renewal, revoke, sign_out) = match observation {
        Observation::Error(error, origin) => {
            // Columnas definitivas: renovación, OAuth, respuesta del núcleo.
            // Core(Rejected) no procede de license_remote::renew; la cuarentena
            // del candidate se hace en App::complete_online_renewal.
            let (renewal, oauth, core) = match error {
                Error::Authentication => (true, true, false),
                Error::Denied => (true, true, true),
                Error::Conflict | Error::DeviceLimit => (true, false, true),
                Error::InvalidCredential | Error::Expired => (false, false, true),
                Error::Core(vantare_ipc::control::Failure::Rejected) => (true, false, false),
                _ => (false, false, false),
            };
            let (definitive, revoke, sign_out) = match origin {
                Origin::Renewal { automatic } => (
                    renewal,
                    !automatic && renewal && !matches!(error, Error::Core(_)),
                    false,
                ),
                Origin::OAuth { automatic } => (oauth, !automatic && oauth, !automatic && oauth),
                Origin::Core {
                    cached_clock_rejection,
                } => (
                    core || (cached_clock_rejection && error == Error::Clock),
                    false,
                    false,
                ),
            };
            (
                if definitive { Definitive } else { Transient },
                revoke,
                sign_out,
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
            (renewal, false, false)
        }
    };
    Outcome {
        renewal,
        revoke,
        sign_out,
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
                    sign_out: false
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
                sign_out: false
            }
        );
        assert_eq!(
            outcome(Observation::Reply(&Reply::Error {
                message: String::new()
            })),
            Outcome {
                renewal: RenewalOutcome::Transient,
                revoke: false,
                sign_out: false
            }
        );
    }
}
