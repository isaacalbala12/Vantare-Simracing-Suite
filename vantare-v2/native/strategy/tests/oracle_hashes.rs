use serde_json::Value;
use sha2::{Digest, Sha256};

#[test]
fn frozen_files_and_manifest_have_their_reviewed_hashes() {
    let root = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("testdata/oracle");
    let bytes = std::fs::read(root.join("manifest.json")).expect("mandatory manifest");
    assert_eq!(
        format!("{:x}", Sha256::digest(&bytes)),
        "267fd632f354b35c76a794a5ea49315f5ecc6f2a92646bcb3dd6d70aad31ae4a"
    );
    let manifest: Value = serde_json::from_slice(&bytes).expect("manifest");
    let files = manifest["files"].as_object().expect("files");
    assert_eq!(
        files.len(),
        5,
        "document rules, documents, solver inputs/output, full Go results and source hashes"
    );
    for (name, expected) in files {
        let bytes = std::fs::read(root.join(name)).expect("mandatory fixture");
        assert_eq!(
            format!("{:x}", Sha256::digest(bytes)),
            expected.as_str().expect("SHA256"),
            "{name}"
        );
    }
}
