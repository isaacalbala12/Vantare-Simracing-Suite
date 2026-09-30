use serde_json::Value;
use sha2::{Digest, Sha256};

#[test]
fn frozen_files_and_manifest_have_their_reviewed_hashes() {
    let root = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("testdata/oracle");
    let bytes = std::fs::read(root.join("manifest.json")).expect("mandatory manifest");
    assert_eq!(
        format!("{:x}", Sha256::digest(&bytes)),
        "69ca450636c31fd5849849cbbc2a132f83c613ac8949d58b8f3e84ecdfd418c3"
    );
    let manifest: Value = serde_json::from_slice(&bytes).expect("manifest");
    let files = manifest["files"].as_object().expect("files");
    assert_eq!(
        files.len(),
        6,
        "document rules, documents, current Go solver results, legacy solver inputs/output, full Go results and source hashes"
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
