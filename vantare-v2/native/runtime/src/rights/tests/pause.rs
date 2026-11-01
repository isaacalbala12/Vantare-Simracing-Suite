//! Decisión 4 de #1827: Paused conserva el plazo absoluto de la misma sesión.
use super::*;

fn paused_owner(start: i64) -> (std::path::PathBuf, Owner) {
    let root = test_root();
    let (credential, keys) = signed(start + 20, start - 10);
    let mut owner = Owner::open(&root, Some(&keys), devices(), 1, wall(start)).expect("owner");
    owner
        .install(credential, wall(start), Duration::ZERO)
        .expect("install");
    owner
        .advance(&photo(true), wall(start + 5), Duration::from_secs(5))
        .expect("enter live");
    (root, owner)
}

#[test]
fn long_pause_and_resume_keep_the_original_hour_and_expire_during_pause() {
    let start = 1_790_900_000;
    let (root, mut owner) = paused_owner(start);
    let mut snapshot = photo(true);
    // The first pause starts before paid-through and lasts well beyond it.
    for (elapsed, state, allowed) in [
        (10, SourceState::Paused, true),
        (1800, SourceState::Paused, true),
        (1801, SourceState::Live, true),
        (2000, SourceState::Paused, true),
        (3619, SourceState::Paused, true),
        (3620, SourceState::Paused, false),
        (3621, SourceState::Live, false),
    ] {
        snapshot.state.source_state = state;
        let policy = owner
            .advance(
                &snapshot,
                wall(start + elapsed),
                Duration::from_secs(elapsed.cast_unsigned()),
            )
            .expect("injected clock");
        assert_eq!(
            policy.engineer, allowed,
            "elapsed={elapsed}, state={state:?}"
        );
        assert!(
            policy.state.permits_access(),
            "signed credential still current"
        );
        assert_eq!(
            policy.state,
            if allowed && elapsed >= 20 {
                vantare_ipc::control::AccessState::Grace
            } else {
                vantare_ipc::control::AccessState::Active
            }
        );
        assert_eq!(
            policy.signed_until_ms,
            allowed.then_some((start + 20).cast_unsigned() * 1000)
        );
        assert_eq!(
            policy.grace_until_ms,
            allowed.then_some((start + 3620).cast_unsigned() * 1000)
        );
        assert_eq!(policy.live, state == SourceState::Live);
        assert_eq!(
            policy.effective_until_ms(),
            allowed.then_some((start + 3620).cast_unsigned() * 1000)
        );
    }
    drop(owner);
    clean(&root);
}

#[test]
fn leaving_or_changing_a_paused_session_discards_grace_without_reentry() {
    let start = 1_790_910_000;
    for exit in 0..4 {
        let (root, mut owner) = paused_owner(start);
        let mut snapshot = photo(true);
        snapshot.state.source_state = SourceState::Paused;
        assert!(
            owner
                .advance(&snapshot, wall(start + 21), Duration::from_secs(21))
                .expect("paused grace")
                .engineer
        );
        match exit {
            0 => snapshot.state.source_state = SourceState::Waiting,
            1 => snapshot.state.session.id.0 += 1,
            2 => snapshot.origin.source.kind = SourceKind::Replay,
            _ => owner
                .invalidate(wall(start + 21), Duration::from_secs(21))
                .expect("explicit logout"),
        }
        assert!(
            !owner
                .advance(&snapshot, wall(start + 22), Duration::from_secs(22))
                .expect("exit")
                .engineer
        );
        assert!(
            !owner
                .advance(&photo(true), wall(start + 23), Duration::from_secs(23))
                .expect("resume after exit cannot renew grace")
                .engineer
        );
        drop(owner);
        clean(&root);
    }
}

#[test]
fn paused_without_a_previous_live_entry_does_not_create_grace() {
    let start = 1_790_920_000;
    let root = test_root();
    let (credential, keys) = signed(start + 20, start - 10);
    let mut owner = Owner::open(&root, Some(&keys), devices(), 1, wall(start)).expect("owner");
    owner
        .install(credential, wall(start), Duration::ZERO)
        .expect("install");
    let mut snapshot = photo(true);
    snapshot.state.source_state = SourceState::Paused;
    owner
        .advance(&snapshot, wall(start + 5), Duration::from_secs(5))
        .expect("pause without entry");
    assert!(
        !owner
            .advance(&snapshot, wall(start + 21), Duration::from_secs(21))
            .expect("no grace created")
            .engineer
    );
    assert!(
        !owner
            .advance(&photo(true), wall(start + 22), Duration::from_secs(22))
            .expect("late entry")
            .engineer
    );
    drop(owner);
    clean(&root);
}

#[test]
fn channel_only_grace_does_not_change_the_published_catalog_state_or_deadline() {
    let start = 1_790_940_000;
    let root = test_root();
    let (credential, keys) = signed_v1(
        start - 10,
        vec![
            Capability {
                key: "vantare.channel.testers".into(),
                paid_through: wall(start + 20).to_rfc3339(),
                perpetual: false,
                scope_version: String::new(),
            },
            Capability {
                key: "vantare.plan.founders".into(),
                paid_through: String::new(),
                perpetual: true,
                scope_version: String::new(),
            },
        ],
    );
    let mut owner = Owner::open(&root, Some(&keys), devices(), 1, wall(start)).expect("owner");
    owner
        .install(credential, wall(start), Duration::ZERO)
        .expect("install");
    owner
        .advance(&photo(true), wall(start + 5), Duration::from_secs(5))
        .expect("enter live");
    let policy = owner
        .advance(&photo(true), wall(start + 21), Duration::from_secs(21))
        .expect("channel grace");
    assert_eq!(policy.state, vantare_ipc::control::AccessState::Active);
    assert_eq!(
        policy.catalog,
        vantare_ipc::control::CatalogAccess::Founders
    );
    assert_eq!(policy.signed_until_ms, None);
    assert_eq!(policy.grace_until_ms, None);
    assert!(policy.engineer);
    drop(owner);
    clean(&root);
}
