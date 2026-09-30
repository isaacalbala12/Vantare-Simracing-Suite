//! Ficheros DPAPI tipados: reemplazo durable, contexto y un escritor exclusivo.
use std::fs::{self, OpenOptions};
use std::io::{Read, Write};
use std::path::{Path, PathBuf};

use serde::{Serialize, de::DeserializeOwned};
use sha2::{Digest, Sha256};
use zeroize::Zeroizing;

use crate::{Error, Result};

#[cfg(windows)]
mod windows;

const MAX_BLOB: u64 = 128 * 1024;

pub struct Store {
    root: PathBuf,
    context: String,
    #[cfg(windows)]
    _lock: std::os::windows::io::OwnedHandle,
}

impl Store {
    pub fn open(root: &Path, context: &str) -> Result<Self> {
        if context.is_empty() || context.len() > 2048 {
            return Err(Error::Storage);
        }
        let namespace = format!("{:x}", Sha256::digest(context.as_bytes()));
        let root = root.join(namespace);
        fs::create_dir_all(&root).map_err(|_| Error::Storage)?;
        if fs::symlink_metadata(&root)
            .map_err(|_| Error::Storage)?
            .file_type()
            .is_symlink()
        {
            return Err(Error::Storage);
        }
        #[cfg(windows)]
        {
            windows::private_acl(&root)?;
            let lock = windows::exclusive(&root.join("owner.lock"))?;
            Ok(Self {
                root,
                context: context.into(),
                _lock: lock,
            })
        }
        #[cfg(not(windows))]
        Err(Error::Unsupported)
    }

    fn path(&self, name: &str) -> Result<PathBuf> {
        if name.is_empty()
            || name.len() > 40
            || !name.bytes().all(|b| b.is_ascii_lowercase() || b == b'-')
        {
            return Err(Error::Storage);
        }
        Ok(self.root.join(format!("{name}.dpapi")))
    }

    pub fn load<T: DeserializeOwned>(&self, name: &str) -> Result<T> {
        let path = self.path(name)?;
        let info = fs::symlink_metadata(&path).map_err(|e| {
            if e.kind() == std::io::ErrorKind::NotFound {
                Error::NotFound
            } else {
                Error::Storage
            }
        })?;
        if !info.is_file() || info.file_type().is_symlink() || info.len() > MAX_BLOB {
            return Err(Error::Storage);
        }
        let mut blob = Vec::new();
        fs::File::open(path)
            .map_err(|_| Error::Storage)?
            .take(MAX_BLOB + 1)
            .read_to_end(&mut blob)
            .map_err(|_| Error::Storage)?;
        if blob.len() as u64 > MAX_BLOB {
            return Err(Error::Storage);
        }
        let bytes = unprotect(&blob, &self.context)?;
        serde_json::from_slice(&bytes).map_err(|_| Error::Storage)
    }

    pub fn save(&self, name: &str, value: &impl Serialize) -> Result<()> {
        let path = self.path(name)?;
        let bytes = Zeroizing::new(serde_json::to_vec(value).map_err(|_| Error::Storage)?);
        if bytes.len() as u64 > MAX_BLOB / 2 {
            return Err(Error::TooLarge);
        }
        let encrypted = protect(&bytes, &self.context)?;
        let temporary = self.root.join(format!("{}.tmp", crate::random_id()?));
        let result = (|| {
            let mut file = OpenOptions::new()
                .create_new(true)
                .write(true)
                .open(&temporary)
                .map_err(|_| Error::Storage)?;
            file.write_all(&encrypted).map_err(|_| Error::Storage)?;
            file.sync_all().map_err(|_| Error::Storage)?;
            drop(file);
            #[cfg(windows)]
            windows::replace(&temporary, &path)?;
            #[cfg(not(windows))]
            return Err(Error::Unsupported);
            Ok(())
        })();
        if result.is_err() && fs::remove_file(&temporary).is_err() {
            // Puede quedar un blob cifrado, nunca el JSON plano. No esconder fallo.
            return Err(Error::Storage);
        }
        result
    }

    pub fn remove(&self, name: &str) -> Result<()> {
        match fs::remove_file(self.path(name)?) {
            Ok(()) => Ok(()),
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(()),
            Err(_) => Err(Error::Storage),
        }
    }
}

#[cfg(windows)]
pub use windows::{protect, unprotect};
#[cfg(not(windows))]
pub fn protect(_: &[u8], _: &str) -> Result<Vec<u8>> {
    Err(Error::Unsupported)
}
#[cfg(not(windows))]
pub fn unprotect(_: &[u8], _: &str) -> Result<Zeroizing<Vec<u8>>> {
    Err(Error::Unsupported)
}

#[cfg(all(test, windows))]
mod tests {
    use super::*;

    #[test]
    fn dpapi_corruption_and_wrong_context_fail_closed() {
        let value = crate::random_id().expect("entropía test");
        let encrypted = protect(value.as_bytes(), "test-A").expect("DPAPI");
        assert!(
            !encrypted
                .windows(value.len())
                .any(|part| part == value.as_bytes())
        );
        assert_eq!(
            &*unprotect(&encrypted, "test-A").expect("DPAPI"),
            value.as_bytes()
        );
        assert!(matches!(
            unprotect(&encrypted, "test-B"),
            Err(Error::Storage)
        ));
        let mut damaged = encrypted;
        damaged[0] ^= 1;
        assert!(unprotect(&damaged, "test-A").is_err());
    }

    #[test]
    fn atomic_store_has_one_owner_restores_and_rejects_plaintext() {
        let root = std::env::temp_dir().join(format!(
            "vantare-services-test-{}",
            crate::random_id().expect("test")
        ));
        let value = crate::random_id().expect("test");
        let store = Store::open(&root, "storage-test").expect("store");
        assert!(matches!(
            Store::open(&root, "storage-test"),
            Err(Error::Busy)
        ));
        store.save("session", &value).expect("guardar");
        store.save("session", &value).expect("reemplazar");
        let namespace = store.root.clone();
        drop(store);
        let store = Store::open(&root, "storage-test").expect("reabrir");
        assert_eq!(store.load::<String>("session").expect("restaurar"), value);
        fs::write(store.path("session").expect("ruta"), b"{\"plain\":true}")
            .expect("corrupción test");
        assert!(matches!(
            store.load::<String>("session"),
            Err(Error::Storage)
        ));
        store.remove("session").expect("borrar");
        assert!(matches!(
            store.load::<String>("session"),
            Err(Error::NotFound)
        ));
        assert!(store.save("../escape", &value).is_err());
        drop(store);
        fs::remove_file(namespace.join("owner.lock")).expect("lock test");
        fs::remove_dir(namespace).expect("namespace test");
        fs::remove_dir(root).expect("root test");
    }
}
