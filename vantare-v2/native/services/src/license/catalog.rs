//! Solo recibe derechos ya verificados y vigentes de Authority.
use vantare_ipc::control::CatalogAccess;

pub fn access(rights: &[String]) -> CatalogAccess {
    let has = |key: &str| rights.iter().any(|right| right == key);
    if has("vantare.plan.pro") || has("vantare.operational.owner") {
        CatalogAccess::Pro
    } else if has("vantare.edition.launch_v1") {
        // Ser tester o tener acceso al canal no amplía la compra perpetua.
        CatalogAccess::LaunchV1
    } else if has("vantare.operational.tester") || has("vantare.operational.nightly_tester") {
        CatalogAccess::Pro
    } else {
        CatalogAccess::Free
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn channel_access_does_not_extend_launch_and_pro_or_owner_takes_precedence() {
        for (keys, expected) in [
            (vec![], CatalogAccess::Free),
            (vec!["vantare.channel.testers"], CatalogAccess::Free),
            (vec!["vantare.edition.launch_v1"], CatalogAccess::LaunchV1),
            (
                vec!["vantare.edition.launch_v1", "vantare.operational.tester"],
                CatalogAccess::LaunchV1,
            ),
            (
                vec![
                    "vantare.edition.launch_v1",
                    "vantare.operational.nightly_tester",
                ],
                CatalogAccess::LaunchV1,
            ),
            (
                vec!["vantare.edition.launch_v1", "vantare.channel.nightly"],
                CatalogAccess::LaunchV1,
            ),
            (
                vec!["vantare.edition.launch_v1", "vantare.plan.pro"],
                CatalogAccess::Pro,
            ),
            (
                vec!["vantare.edition.launch_v1", "vantare.operational.owner"],
                CatalogAccess::Pro,
            ),
            (vec!["vantare.operational.tester"], CatalogAccess::Pro),
        ] {
            assert_eq!(
                access(&keys.into_iter().map(str::to_owned).collect::<Vec<_>>()),
                expected
            );
        }
    }
}
