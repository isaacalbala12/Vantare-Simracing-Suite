//! Lo que la pantalla de Cuenta cuenta de la licencia firmada. Solo presentación:
//! los derechos los concede el núcleo, no esta vista.
use super::navigation::Access;
use super::{LicenseStatus, LicenseView};
use crate::protocol::AccessView;
use vantare_ipc::{
    control::{AccessState, Policy},
    services_protocol::Session,
};

/// Umbral del aviso «caduca pronto». La renovación automática (servicios) va antes.
pub(super) const WARN_MS: u64 = 24 * 60 * 60 * 1000;

/// `None` salvo con acceso verificado y no bloqueado, y una política de la sesión
/// vigente en `wall`. `tester` sale solo de `policy.tester`.
pub(super) fn view(
    access: &AccessView,
    session: Session,
    policy: Option<&Policy>,
    wall: u64,
) -> Option<LicenseView> {
    let policy = policy?;
    if !access.verified || access.blocked {
        return None;
    }
    if !Access::from_session_policy(session, policy, wall).verified {
        return None;
    }
    let (status, until_ms) = if policy.state == AccessState::Grace {
        // La validación de la pantalla exige fecha en gracia: sin fecha, sin fila.
        (
            LicenseStatus::Grace,
            Some(policy.grace_until_ms.or(policy.signed_until_ms)?),
        )
    } else {
        match policy.signed_until_ms {
            None => (LicenseStatus::Active, None),
            Some(until) if until.saturating_sub(wall) <= WARN_MS => {
                (LicenseStatus::Expiring, Some(until))
            }
            Some(until) => (LicenseStatus::Active, Some(until)),
        }
    };
    Some(LicenseView {
        tester: policy.tester,
        status,
        until_ms,
    })
}

#[cfg(test)]
#[path = "license_tests.rs"]
mod tests;
