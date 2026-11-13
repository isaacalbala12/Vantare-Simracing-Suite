use super::*;
use vantare_ipc::control::{AccessState, Policy};
use vantare_launcher::{Document, Profile};

struct Fixture {root:crate::test_support::Root,path:std::path::PathBuf,target:ResidentRemoveTarget,status:native::Status}
impl Fixture {
    fn new()->Self {
        let root=crate::test_support::Root::new(); let path=root.path.join("launcher.json");
        let mut document=Document::default(); document.profiles.push(Profile::new("qa".into(),"QA".into()));
        let bytes=serde_json::to_vec(&document).unwrap(); std::fs::write(&path,&bytes).unwrap();
        let revision=vantare_services::content_hash(&bytes);
        let target=ResidentRemoveTarget{instance:"b".repeat(64),account_generation:"a".repeat(64),profile:"qa".into(),revision:revision.clone()};
        let mut extension=native::execution::ExecutionStatus::new(target.instance.clone().try_into().unwrap());
        extension.capabilities.push(native::execution::Capability::LiveProfileOwnership);
        extension.ownership=Some(wire::Ownership::Known{revision,profiles:vec![wire::ProfileOwnership{profile:"qa".into(),owned_live:false}]});
        let status=native::Status{version:native::VERSION,updated_ms:native::now_ms(),extension:Some(extension),..Default::default()};
        let value=Self{root,path,target,status}; value.save(); value
    }
    fn save(&self){std::fs::write(native::status_path(&self.path),serde_json::to_vec(&self.status).unwrap()).unwrap();}
}
fn observed()->AccountObservation {AccountObservation{generation:"a".repeat(64).try_into().unwrap(),policy:Policy{version:vantare_ipc::control::VERSION,epoch:1,revision:1,checked_at_ms:10_000,state:AccessState::Active,..Default::default()}}}
#[test]
fn projection_is_scoped_by_fresh_authority_never_by_legacy_policy_or_discovery() {
    let f=Fixture::new(); let extension=f.status.extension.as_ref(); let account=observed();
    assert!(matches!(project(extension,Some(&account),11_999),ResidentOwnership::Known{account_generation,profiles,..} if account_generation=="a".repeat(64) && !profiles[0].owned_live));
    assert_eq!(project(extension,Some(&account),12_000),ResidentOwnership::Unknown);
    assert_eq!(project(extension,None,10_000),ResidentOwnership::Unknown);
    assert_eq!(project(None,Some(&account),10_000),ResidentOwnership::Unsupported);
    let mut revoked=account; revoked.policy.state=AccessState::Revoked;
    assert_eq!(project(extension,Some(&revoked),10_000),ResidentOwnership::Unknown);
}
#[test]
fn queue_does_not_delete_and_exact_values_reach_the_closed_mailbox() {
    let f=Fixture::new(); let original=std::fs::read(&f.path).unwrap();
    let super::super::ResidentQueued::Queued{request}=remove_with_clock(&f.path,Some(&observed()),&f.target,||Ok(10_000)).unwrap();
    assert_eq!(std::fs::read(&f.path).unwrap(),original);
    let native::Request::RemoveProfileChecked(command)=serde_json::from_slice(&std::fs::read(native::request_path(&f.path)).unwrap()).unwrap() else {panic!("checked removal")};
    assert_eq!(String::from(command.request),request); assert_eq!(command.profile,f.target.profile);
    assert_eq!(String::from(command.account),f.target.account_generation); assert_eq!(command.revision,f.target.revision);
    assert_eq!(remove_with_clock(&f.path,Some(&observed()),&f.target,||Ok(10_000)),Err(HostError::Busy));
    assert!(f.root.path.exists());
}
#[test]
fn old_missing_unknown_busy_owned_or_other_account_never_falls_back_to_delete() {
    for case in 0..6 {
        let mut f=Fixture::new();
        let expected=match case {
            0=>{f.status.extension=None;HostError::Unsupported}
            1=>{std::fs::remove_file(native::status_path(&f.path)).unwrap();HostError::Unsupported}
            2=>{f.status.extension.as_mut().unwrap().ownership=Some(wire::Ownership::Unknown);rejected(wire::RemovalRejection::OwnershipUnknown)}
            3=>{f.status.running=true;rejected(wire::RemovalRejection::Busy)}
            4=>{let Some(wire::Ownership::Known{profiles,..})=&mut f.status.extension.as_mut().unwrap().ownership else{panic!()};profiles[0].owned_live=true;rejected(wire::RemovalRejection::OwnedLive)}
            _=>{f.target.account_generation="f".repeat(64);rejected(wire::RemovalRejection::AccountChanged)}
        };
        if case!=1 {f.save();}
        let original=std::fs::read(&f.path).unwrap();
        assert_eq!(remove_with_clock(&f.path,Some(&observed()),&f.target,||Ok(10_000)),Err(expected));
        assert_eq!(std::fs::read(&f.path).unwrap(),original); assert!(!native::request_path(&f.path).exists());
        assert_eq!(crate::launcher::actions::remove(&f.path,"qa",&f.target.revision),Err(HostError::Unsupported));
    }
}
