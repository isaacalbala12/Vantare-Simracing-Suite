use super::*;
use base64::{Engine, engine::general_purpose::STANDARD};
use ed25519_dalek::{Signer, SigningKey};
#[cfg(feature="hub-update-qa")]
use std::cell::Cell;

fn offer() -> Offer {
    Offer { schema: 2, product: "vantare-hub".into(), channel: "beta".into(),
        version: "0.0.990".into(), url: format!("https://github.com/{REPO}/releases/download/hub-beta-v0.0.990/vantare-native-amd64-package.zip"),
        sha256: "a".repeat(64), notes: "Actualización para José".into(), compressed_bytes: ZIP_LIMIT, expanded_bytes: EXPANDED_LIMIT }
}
fn signed(value: &Offer) -> Vec<u8> {
    let bytes=serde_json::to_vec(value).unwrap();
    let key=SigningKey::from_bytes(&[42;32]); // Existing public matrix TEST seed, never production.
    serde_json::to_vec(&serde_json::json!({"payload":STANDARD.encode(&bytes),"signature":STANDARD.encode(key.sign(&bytes).to_bytes())})).unwrap()
}
fn qa_root() -> std::path::PathBuf {
    let base=if std::env::var("CI").as_deref()==Ok("true") {std::path::PathBuf::from(std::env::var_os("RUNNER_TEMP").unwrap())}else{std::path::PathBuf::from("D:/VantareServer/qa/isa-1995")};
    let root=base.join(format!("hub-feed-{}", disk::id().unwrap()));
    vantare_installer::engine::context::qa_path(&root).unwrap(); root
}
#[test]
fn signed_bounds_accept_exact_and_reject_one_more_or_zero_without_large_payloads() {
    let valid=offer(); valid.validate().unwrap();
    for (compressed,expanded) in [(ZIP_LIMIT+1,EXPANDED_LIMIT),(ZIP_LIMIT,EXPANDED_LIMIT+1),(0,1),(1,0)] {
        let mut bad=valid.clone(); bad.compressed_bytes=compressed;bad.expanded_bytes=expanded;
        assert!(bad.validate().is_err());
    }
}
#[test]
fn schema_product_namespace_and_fields_are_closed() {
    let value=serde_json::to_value(offer()).unwrap();
    for (field,bad) in [("schema",serde_json::json!(1)),("product",serde_json::json!("vantare-native")),("channel",serde_json::json!("nightly")),("version",serde_json::json!("01.0.990")),("url",serde_json::json!("https://example.invalid/x.zip")),("sha256",serde_json::json!("f")),("notes",serde_json::json!("x".repeat(8193)))] {
        let mut changed=value.clone();changed[field]=bad;
        assert!(serde_json::from_value::<Offer>(changed).unwrap().validate().is_err());
    }
    let mut legacy=value.clone(); legacy["url"]=serde_json::json!(offer().url.replace("hub-beta-v","native-beta-v"));
    assert!(serde_json::from_value::<Offer>(legacy).unwrap().validate().is_err());
    for (field,bad) in [("surprise",serde_json::json!(true)),("compressed_bytes",serde_json::json!(-1)),("expanded_bytes",serde_json::json!(1.5))] {
        let mut changed=value.clone();changed[field]=bad;assert!(serde_json::from_value::<Offer>(changed).is_err());
    }
    for tag in ["native-beta-v0.0.990","hub-beta-v0.0.989","hub-beta-v0.0.991"] {assert!(!tag_matches(tag,&offer()));}
    let release=Release {draft:false,tag_name:"hub-beta-v0.0.990".into()};
    assert_eq!(eligible(&release,[0,0,989],None),Some([0,0,990]));
    assert_eq!(eligible(&release,[0,0,990],None),None);
    assert_eq!(eligible(&release,[0,0,991],None),None);
    assert_eq!(eligible(&release,[0,0,989],Some("0.0.990")),None);
}
#[cfg(not(feature="hub-update-qa"))]
#[test]
fn distribution_client_rejects_a_valid_qa_signed_hub_offer() { assert!(Offer::verify(&signed(&offer())).is_err()); }
#[cfg(feature="hub-update-qa")]
#[test]
fn authenticated_preflight_makes_zero_zip_requests_and_no_staging_when_oversized() {
    for (compressed,expanded,want_download) in [(ZIP_LIMIT,EXPANDED_LIMIT,true),(ZIP_LIMIT+1,EXPANDED_LIMIT,false),(ZIP_LIMIT,EXPANDED_LIMIT+1,false)] {
        let mut candidate=offer();candidate.compressed_bytes=compressed;candidate.expanded_bytes=expanded;
        let envelope=signed(&candidate);
        let root=qa_root();let downloads=Cell::new(0);
        let result=check_with("0.0.989",&root,&AtomicBool::new(false),None, |url,_| {
            if url.contains("api.github.com") {Ok(br#"[{"draft":false,"tag_name":"hub-beta-v0.0.990"}]"#.to_vec())}else{assert!(url.ends_with("/vantare-hub-beta.json"));Ok(envelope.clone())}
        }, |_,_,_| {downloads.set(downloads.get()+1);Err(failure("Test stops before a large ZIP request"))});
        assert!(result.is_err());assert_eq!(downloads.get(),usize::from(want_download));
        assert_eq!(root.exists(),want_download);
        if root.exists(){fs::remove_dir_all(root).unwrap();}
    }
}
#[cfg(feature="hub-update-qa")]
#[test]
fn isolated_authority_accepts_qa_signature_and_rejects_modified_payload() {
    let valid=signed(&offer());Offer::verify(&valid).unwrap();
    let mut changed:serde_json::Value=serde_json::from_slice(&valid).unwrap();
    let mut other=offer();other.notes="changed".into();changed["payload"]=serde_json::json!(STANDARD.encode(serde_json::to_vec(&other).unwrap()));
    assert!(Offer::verify(&serde_json::to_vec(&changed).unwrap()).is_err());
}
#[test]
fn download_requires_exact_signed_length_and_hash() {
    use std::{net::TcpListener,time::Instant};
    for (length,wrong_hash) in [(4,false),(5,false),(6,false),(5,true)] {
        let listener=TcpListener::bind("127.0.0.1:0").unwrap();listener.set_nonblocking(true).unwrap();
        let url=format!("http://{}",listener.local_addr().unwrap());
        let server=std::thread::spawn(move || {
            // Bounded test watchdog: the fixture also exits if the client never connects.
            let until=Instant::now()+Duration::from_secs(5);
            loop { match listener.accept() {
                Ok((mut stream,_))=>{stream.set_read_timeout(Some(Duration::from_secs(3))).unwrap();let mut request=[0;1024];let _=stream.read(&mut request);let _=stream.write_all(b"HTTP/1.1 200 OK\r\nContent-Length: 5\r\nConnection: close\r\n\r\nhello");break;},
                Err(error) if error.kind()==io::ErrorKind::WouldBlock=>{assert!(Instant::now()<until);std::thread::sleep(Duration::from_millis(1));},
                Err(error)=>panic!("{error}")
            }}
        });
        let root=qa_root();fs::create_dir_all(&root).unwrap();let target=root.join("package.download");
        let mut expected=offer();expected.url=url;expected.compressed_bytes=length;expected.sha256=format!("{:x}",sha2::Sha256::digest(b"hello"));
        if wrong_hash {expected.sha256="0".repeat(64);}
        let result=download(&agent(Duration::from_secs(3)),&expected,&target,&AtomicBool::new(false));
        server.join().unwrap();assert_eq!(result.is_ok(),length==5 && !wrong_hash);fs::remove_dir_all(root).unwrap();
    }
}

#[test]
fn extracted_total_and_compressed_length_must_match_the_signed_sizes() {
    let root=qa_root();fs::create_dir_all(&root).unwrap();
    let raw=serde_json::to_vec(&serde_json::json!({"schema":1,"product":"vantare-native","candidate":true,"architecture":"windows-x64","version":"0.0.990","channel":"beta","data_schema":"opaque-v1","source_sha":"a".repeat(40),"source_dirty":false,"build_profile":"Debug","engine":2,"files":[{"path":"assets/test.txt","size":5,"sha256":"a".repeat(64)}]})).unwrap();
    let manifest=Manifest::decode(&raw).unwrap();fs::write(root.join("manifest.json"),&raw).unwrap();
    let mut expected=offer();expected.expanded_bytes=u64::try_from(raw.len()).unwrap()+5;
    expected.verify_expanded(&root,&manifest).unwrap();expected.expanded_bytes+=1;
    assert!(expected.verify_expanded(&root,&manifest).is_err());
    let archive=root.join("archive.zip");fs::write(&archive,b"small").unwrap();expected.compressed_bytes=5;
    expected.verify_archive_length(&archive).unwrap();expected.compressed_bytes=6;
    assert!(expected.verify_archive_length(&archive).is_err());fs::remove_dir_all(root).unwrap();
}
