//! Paso 0 de #1827: estado × evento → Policy de nightly, no el modelo futuro.
use super::*;
use vantare_ipc::control::CatalogAccess::{Free, Pro};

#[derive(Clone, Copy, Debug)]
enum Case {
    Missing,
    Install,
    Expiry,
    Grace,
    GraceEnd,
    Pause,
    Stale,
    Leave,
    Rollback,
    OnlineReanchor,
    Invalidate,
    TombstoneEqual,
    TombstoneOlder,
    TombstoneNewer,
    FutureTombstone,
    FutureTombstoneOnline,
    DamagedAuthority,
    DamagedMarker,
    DamagedOnline,
    Ahead300,
    Ahead301,
    OlderIssuance,
}

type Observation = (Owner, i64, Duration, Snapshot, Result<()>);

type PolicyCase = (
    Case,
    Option<Error>,
    bool,
    bool,
    vantare_ipc::control::CatalogAccess,
    bool,
    Option<i64>,
);

#[test]
fn nightly_state_event_policy_matrix() {
    use Case::*;
    // caso                  error evento        overlays módulos catálogo recovery plazo relativo
    #[rustfmt::skip]
    const CASES: &[PolicyCase] = &[
        (Missing, None, false, false, Free, false, None),
        (Install, None, true, true, Pro, false, Some(20)),
        (Expiry, None, true, false, Free, false, None),
        (Grace, None, true, true, Pro, false, Some(3620)),
        (GraceEnd, None, true, false, Free, false, None),
        // Paused pierde hoy la gracia: cambia en paso 6b (decisión 4 de #1827).
        (Pause, None, true, false, Free, false, None),
        (Stale, None, true, true, Pro, false, Some(3620)),
        (Leave, None, true, false, Free, false, None),
        (Rollback, Some(Error::Clock), false, false, Free, true, None),
        (OnlineReanchor, None, true, true, Pro, false, Some(20)),
        (Invalidate, None, false, false, Free, false, None),
        (TombstoneEqual, Some(Error::Denied), false, false, Free, false, None),
        (TombstoneOlder, Some(Error::Denied), false, false, Free, false, None),
        (TombstoneNewer, None, true, true, Pro, false, Some(20)),
        // #1822 F2: diagnóstico genérico; cambia en paso 7, sin bajar la lápida.
        (FutureTombstone, None, false, false, Free, true, None),
        (FutureTombstoneOnline, Some(Error::Denied), false, false, Free, true, None),
        (DamagedAuthority, Some(Error::Denied), false, false, Free, true, None),
        // #1822 F4: la marca ilegible sigue bloqueando en cada restauración.
        (DamagedMarker, Some(Error::Denied), false, false, Free, true, None),
        (DamagedOnline, None, true, true, Pro, false, Some(20)),
        // #1784: se adelanta referencia, nunca se extiende la fecha firmada.
        (Ahead300, None, true, true, Pro, false, Some(320)),
        (Ahead301, Some(Error::Clock), false, false, Free, false, None),
        (OlderIssuance, Some(Error::Clock), true, true, Pro, false, Some(20)),
    ];
    for (case, error, overlays, modules, catalog, recovery, deadline) in CASES.iter().copied() {
        let start = 1_790_800_000;
        let root = test_root();
        let (mut owner, at, tick, snapshot, event) = run_case(case, &root);
        assert_eq!(event.err(), error, "{case:?}: event");
        let observed = owner.advance(&snapshot, wall(at), tick);
        if matches!(case, Rollback) {
            assert_eq!(observed.err(), Some(Error::Clock));
        } else {
            observed.expect("policy read");
        }
        let policy = owner.policy();
        assert_eq!(policy.overlays_advanced, overlays, "{case:?}: overlays");
        assert_eq!(
            [
                policy.engineer,
                policy.strategy,
                policy.analysis,
                policy.calendar,
                policy.tester
            ],
            [modules; 5],
            "{case:?}: modules"
        );
        assert_eq!(policy.catalog, catalog, "{case:?}: catalog");
        assert_eq!(
            policy.online_recovery_required, recovery,
            "{case:?}: recovery"
        );
        assert_eq!(
            policy.valid_until_ms,
            deadline.map(|offset| u64::try_from(start + offset).expect("deadline") * 1000),
            "{case:?}: deadline"
        );
        assert_eq!(
            policy.error.is_some(),
            matches!(
                case,
                Rollback | Invalidate | TombstoneEqual | TombstoneOlder
            ),
            "{case:?}: error presence"
        );
        // El motivo tipado llegará con Policy.state (paso 7); no fijar textos.
        drop(owner);
        clean(&root);
    }
}

fn run_case(case: Case, root: &std::path::Path) -> Observation {
    use Case::*;
    let start = 1_790_800_000;
    let rights = || {
        vec![Capability {
            key: "vantare.operational.owner".into(),
            paid_through: wall(
                start
                    + if matches!(case, Ahead300 | Ahead301) {
                        620
                    } else {
                        20
                    },
            )
            .to_rfc3339(),
            perpetual: false,
            scope_version: String::new(),
        }]
    };
    let issued = match case {
        Ahead300 => start + 300,
        Ahead301 => start + 301,
        _ => start - 10,
    };
    let (initial, initial_keys) = signed_v1_named(issued, rights(), devices().legacy, "initial");
    let fresh_at = match case {
        TombstoneEqual => start,
        TombstoneOlder => start - 1,
        _ => start + 1,
    };
    let (fresh, fresh_keys) = signed_v1_named(fresh_at, rights(), devices().legacy, "fresh");
    let keys = format!("{initial_keys},{fresh_keys}");
    let owner = Owner::open(root, Some(&keys), devices(), 1, wall(start)).expect("owner");
    run_event(case, root, owner, (&keys, initial, fresh), start)
}

fn run_event(
    case: Case,
    root: &std::path::Path,
    mut owner: Owner,
    credentials: (&str, String, String),
    start: i64,
) -> Observation {
    use Case::*;
    let (keys, initial, fresh) = credentials;
    let mut at = start;
    let mut tick = Duration::ZERO;
    let mut snapshot = photo(false);
    let event = match case {
        Missing => Ok(()),
        Ahead300 | Ahead301 => owner.install(initial, wall(start), tick),
        _ => {
            owner
                .install(initial.clone(), wall(start), tick)
                .expect("initial install");
            match case {
                Install => Ok(()),
                Expiry => {
                    at += 20;
                    tick = Duration::from_secs(20);
                    Ok(())
                }
                Grace | GraceEnd | Pause | Stale | Leave => {
                    owner
                        .advance(&photo(true), wall(start + 5), Duration::from_secs(5))
                        .expect("enter before expiry");
                    at += if matches!(case, GraceEnd) { 3620 } else { 21 };
                    tick = Duration::from_secs(u64::try_from(at - start).expect("elapsed"));
                    snapshot = photo(true);
                    if matches!(case, Pause) {
                        snapshot.state.source_state = SourceState::Paused;
                    }
                    if matches!(case, Stale) {
                        snapshot.state.source_state = SourceState::Stale;
                    }
                    if matches!(case, Leave) {
                        snapshot = photo(false);
                    }
                    Ok(())
                }
                Rollback => {
                    owner
                        .advance(&snapshot, wall(start + 10), Duration::from_secs(10))
                        .expect("observe future");
                    tick = Duration::from_secs(11);
                    // La fila observa también la Policy denegada publicada tras el error.
                    owner.advance(&snapshot, wall(start), tick).map(|_| ())
                }
                OnlineReanchor => {
                    owner
                        .advance(&snapshot, wall(start + 1000), Duration::from_secs(1))
                        .expect("persist future");
                    at += 1;
                    tick = Duration::from_secs(2);
                    owner.install_online(fresh, wall(at), tick)
                }
                Invalidate | TombstoneEqual | TombstoneOlder | TombstoneNewer => {
                    owner
                        .invalidate(wall(start), tick)
                        .expect("durable tombstone");
                    if matches!(case, Invalidate) {
                        Ok(())
                    } else {
                        at += 1;
                        tick = Duration::from_secs(1);
                        owner.install_online(fresh, wall(at), tick)
                    }
                }
                FutureTombstone
                | FutureTombstoneOnline
                | DamagedAuthority
                | DamagedMarker
                | DamagedOnline => {
                    return restart_event(case, owner, root, (keys, initial, fresh), start);
                }
                OlderIssuance => {
                    owner
                        .install(fresh, wall(start + 1), Duration::from_secs(1))
                        .expect("newer issuance");
                    at += 2;
                    tick = Duration::from_secs(2);
                    owner.install(initial, wall(at), tick)
                }
                Missing | Ahead300 | Ahead301 => unreachable!(),
            }
        }
    };
    (owner, at, tick, snapshot, event)
}

fn restart_event(
    case: Case,
    mut owner: Owner,
    root: &std::path::Path,
    credentials: (&str, String, String),
    start: i64,
) -> Observation {
    use Case::*;
    let (keys, initial, fresh) = credentials;
    let mut at = start;
    let tick = Duration::ZERO;
    let snapshot = photo(false);
    let event = match case {
        FutureTombstone | FutureTombstoneOnline => {
            owner
                .advance(&snapshot, wall(start + 1000), Duration::from_secs(1))
                .expect("future");
            owner
                .invalidate(wall(start + 1), Duration::from_secs(2))
                .expect("future tombstone");
            drop(owner);
            at += 1;
            owner = Owner::open(root, Some(keys), devices(), 2, wall(at)).expect("restart");
            if matches!(case, FutureTombstoneOnline) {
                owner.install_online(fresh, wall(at), tick)
            } else {
                Ok(())
            }
        }
        DamagedAuthority | DamagedMarker | DamagedOnline => {
            use sha2::{Digest, Sha256};
            drop(owner);
            let namespace = root.join(format!("{:x}", Sha256::digest(b"core-rights-v1")));
            let name = if matches!(case, DamagedMarker) {
                "authority-recovery.dpapi"
            } else {
                "authority.dpapi"
            };
            std::fs::write(namespace.join(name), b"damaged isolated fixture").expect("damage");
            at += 1;
            owner =
                Owner::open(root, Some(keys), devices(), 2, wall(at)).expect("recoverable storage");
            if matches!(case, DamagedMarker) {
                // #1822 F4: otra restauración conserva la guardia ilegible.
                drop(owner);
                owner = Owner::open(root, Some(keys), devices(), 3, wall(at))
                    .expect("second recoverable restore");
                assert_eq!(
                    std::fs::read(namespace.join(name)).expect("guard"),
                    b"damaged isolated fixture"
                );
            }
            if matches!(case, DamagedOnline) {
                owner.install_online(fresh, wall(at), tick)
            } else {
                owner.install(initial, wall(at), tick)
            }
        }
        _ => unreachable!(),
    };
    (owner, at, tick, snapshot, event)
}
