use serde_json::Value;
use sha2::{Digest, Sha256};

// Git fija eol=lf; el hash publicado se calcula sobre esos bytes canónicos.
// Un checkout Windows anterior puede conservar CRLF. Solo se normalizan los
// saltos del JSON; el corpus gzip se verifica byte a byte sin transformación.
fn frozen_bytes(path: &std::path::Path) -> Vec<u8> {
    let bytes = std::fs::read(path).expect("mandatory frozen file");
    if path
        .extension()
        .is_some_and(|extension| extension == "json")
    {
        String::from_utf8(bytes)
            .expect("JSON UTF-8")
            .replace("\r\n", "\n")
            .into_bytes()
    } else {
        bytes
    }
}

#[test]
fn frozen_files_and_manifest_have_their_reviewed_hashes() {
    let root = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("testdata/oracle");
    let bytes = frozen_bytes(&root.join("manifest.json"));
    assert_eq!(
        format!("{:x}", Sha256::digest(&bytes)),
        "948fbaf7ff4cd2e556e58f2c161e80c793fbfc18246d8e645ab032df84d2876a"
    );
    let manifest: Value = serde_json::from_slice(&bytes).expect("manifest");
    let files = manifest["files"].as_object().expect("files");
    assert_eq!(
        files.len(),
        6,
        "document rules, documents, current Go solver results, legacy solver inputs/output, full Go results and source hashes"
    );
    for (name, expected) in files {
        let bytes = frozen_bytes(&root.join(name));
        assert_eq!(
            format!("{:x}", Sha256::digest(bytes)),
            expected.as_str().expect("SHA256"),
            "{name}"
        );
    }
}
