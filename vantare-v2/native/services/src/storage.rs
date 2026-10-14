//! Ficheros DPAPI tipados: reemplazo durable, contexto y un escritor exclusivo.
use std::fs::{self, OpenOptions};
use std::io::{Read, Write};
use std::path::{Path, PathBuf};

use serde::{Serialize, de::DeserializeOwned};
use sha2::{Digest, Sha256};
use zeroize::Zeroizing;

#[cfg(unix)]
use std::fs::File;
#[cfg(unix)]
use std::os::unix::fs::{OpenOptionsExt, PermissionsExt};

use crate::{Error, Result};

#[cfg(windows)]
mod windows;

// Tres JPEG de hasta 400 KiB, serializados y protegidos con DPAPI.
const MAX_BLOB: u64 = 2 * 1024 * 1024;

pub struct Store {
    root: PathBuf,
    context: String,
    #[cfg(windows)]
    _lock: std::os::windows::io::OwnedHandle,
    #[cfg(unix)]
    _lock: File,
}

impl Store {
    pub fn open(root: &Path, context: &str) -> Result<Self> {
        if context.is_empty() || context.len() > 2048 {
            return Err(Error::Storage);
        }
        let namespace = format!("{:x}", Sha256::digest(context.as_bytes()));
        let root = root.join(namespace);
        fs::create_dir_all(&root).map_err(|_| Error::Storage)?;
        let metadata = fs::symlink_metadata(&root).map_err(|_| Error::Storage)?;
        if !metadata.is_dir() || metadata.file_type().is_symlink() {
            return Err(Error::Storage);
        }
        // Windows devuelve el prefijo de ruta larga que necesitan las llamadas Win32.
        #[cfg(windows)]
        let root = fs::canonicalize(&root).map_err(|_| Error::Storage)?;
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
        #[cfg(unix)]
        {
            fs::set_permissions(&root, fs::Permissions::from_mode(0o700))
                .map_err(|_| Error::Storage)?;
            let lock_path = root.join("owner.lock");
            let lock = OpenOptions::new()
                .read(true)
                .write(true)
                .create(true)
                .truncate(false)
                .mode(0o600)
                .open(lock_path)
                .map_err(|_| Error::Storage)?;
            lock.set_permissions(fs::Permissions::from_mode(0o600))
                .map_err(|_| Error::Storage)?;
            lock.try_lock().map_err(|error| match error {
                std::fs::TryLockError::WouldBlock => Error::Busy,
                std::fs::TryLockError::Error(_) => Error::Storage,
            })?;
            Ok(Self {
                root,
                context: context.into(),
                _lock: lock,
            })
        }
        #[cfg(not(any(windows, unix)))]
        Err(Error::Unsupported)
    }

    fn path(&self, name: &str) -> Result<PathBuf> {
        if name.is_empty()
            || name.len() > 40
            || !name.bytes().all(|b| b.is_ascii_lowercase() || b == b'-')
        {
            return Err(Error::Storage);
        }
        #[cfg(windows)]
        let extension = "dpapi";
        #[cfg(unix)]
        let extension = "json";
        #[cfg(not(any(windows, unix)))]
        let extension = "data";
        Ok(self.root.join(format!("{name}.{extension}")))
    }

    fn load_bytes(&self, name: &str) -> Result<Zeroizing<Vec<u8>>> {
        let path = self.path(name)?;
        let info = fs::symlink_metadata(&path).map_err(|e| {
            if e.kind() == std::io::ErrorKind::NotFound {
                Error::NotFound
            } else {
                Error::Storage
            }
        })?;
        #[cfg(unix)]
        let private_permissions = info.permissions().mode() & 0o777 == 0o600;
        #[cfg(not(unix))]
        let private_permissions = true;
        if !info.is_file() || info.file_type().is_symlink() || !private_permissions {
            return Err(Error::Storage);
        }
        if info.len() > MAX_BLOB {
            return Err(Error::TooLarge);
        }
        let mut blob = Vec::new();
        fs::File::open(path)
            .map_err(|_| Error::Storage)?
            .take(MAX_BLOB + 1)
            .read_to_end(&mut blob)
            .map_err(|_| Error::Storage)?;
        if blob.len() as u64 > MAX_BLOB {
            return Err(Error::TooLarge);
        }
        unprotect(&blob, &self.context)
    }

    pub fn load<T: DeserializeOwned>(&self, name: &str) -> Result<T> {
        serde_json::from_slice(&self.load_bytes(name).map_err(|error| {
            if error == Error::TooLarge {
                Error::Storage
            } else {
                error
            }
        })?)
        .map_err(|_| Error::Storage)
    }

    /// Recuperación de JSON inválido o excesivo; los errores de E/S se propagan.
    pub fn load_for_restore<T: DeserializeOwned>(&self, name: &str) -> Result<Option<T>> {
        let bytes = match self.load_bytes(name) {
            Ok(bytes) => bytes,
            Err(Error::TooLarge) => {
                self.quarantine(name);
                return Ok(None);
            }
            Err(error) => return Err(error),
        };
        if let Ok(value) = serde_json::from_slice(&bytes) {
            Ok(Some(value))
        } else {
            self.quarantine(name);
            Ok(None)
        }
    }

    /// Aparta un documento que no valida para que el servicio pueda arrancar.
    ///
    /// Todas las `restore` comparten la misma forma: si el documento no valida
    /// devuelven `Err`, lo que deja el servicio muerto en CADA arranque y obliga
    /// a que alguien borre el fichero a mano. Renombrarlo conserva la evidencia
    /// para diagnostico y permite seguir con el valor por defecto.
    ///
    /// Es a proposito que NO se use con `installation`, pero el motivo verificado
    /// NO es que regale un dispositivo limpio: en la configuracion desplegada
    /// borrar ese fichero no da nada -no hay re-enrolamiento, el servidor rechaza
    /// cualquier campo extra, `devices.user_id` es UNIQUE y gana el primer
    /// dispositivo, y `binding`/`authority` viven en OTRO almacen-. El motivo real
    /// es que aqui el unico camino a una identidad nueva es ENOENT: 14 formas
    /// de corrupcion devuelven `Err` y ninguna acuna identidad. El nucleo carga
    /// `legacy` y `installation` por separado para conservar el camino v1 si
    /// falla v2. La recuperacion de v2 sigue pendiente de un reenrolamiento
    /// autenticado en el servidor; cuarentena sola no permite volver a vincular.
    /// Tampoco se usa con el recargado posterior al login, que no es un `restore`.
    pub fn quarantine(&self, name: &str) {
        let Ok(path) = self.path(name) else {
            return;
        };
        let aside = self.root.join(format!("{name}.corrupto"));
        let _ = fs::remove_file(&aside);
        if let Err(error) = fs::rename(&path, &aside) {
            eprintln!("apartar {name} ilegible: {error}");
        }
    }

    /// Recuperación explícita: conservar cada copia y no seguir si no se pudo apartar.
    #[cfg(any(feature = "network", test))]
    pub fn quarantine_preserving(&self, name: &str) -> Result<()> {
        let path = self.path(name)?;
        let aside = self
            .root
            .join(format!("{name}-{}.corrupto", crate::random_id()?));
        fs::rename(path, aside).map_err(|_| Error::Storage)
    }

    pub fn save(&self, name: &str, value: &impl Serialize) -> Result<()> {
        let path = self.path(name)?;
        let bytes = Zeroizing::new(serde_json::to_vec(value).map_err(|_| Error::Storage)?);
        // Base64 de tres JPEG de 400 KiB, miniaturas y JSON caben en 2 MiB.
        // Reservar margen para DPAPI sin ampliar los demás documentos.
        let limit = if matches!(name, "report-images" | "report-attempt") {
            MAX_BLOB - 64 * 1024
        } else {
            MAX_BLOB / 2
        };
        if bytes.len() as u64 > limit {
            return Err(Error::TooLarge);
        }
        let stored = Zeroizing::new(protect(&bytes, &self.context)?);
        if stored.len() as u64 > MAX_BLOB {
            return Err(Error::TooLarge);
        }
        let temporary = self.root.join(format!("{}.tmp", crate::random_id()?));
        let result = (|| {
            let mut options = OpenOptions::new();
            options.create_new(true).write(true);
            #[cfg(unix)]
            options.mode(0o600);
            let mut file = options.open(&temporary).map_err(|_| Error::Storage)?;
            #[cfg(unix)]
            file.set_permissions(fs::Permissions::from_mode(0o600))
                .map_err(|_| Error::Storage)?;
            file.write_all(&stored).map_err(|_| Error::Storage)?;
            file.sync_all().map_err(|_| Error::Storage)?;
            drop(file);
            #[cfg(windows)]
            windows::replace(&temporary, &path)?;
            #[cfg(unix)]
            {
                fs::rename(&temporary, &path).map_err(|_| Error::Storage)?;
                File::open(&self.root)
                    .and_then(|directory| directory.sync_all())
                    .map_err(|_| Error::Storage)?;
            }
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
#[cfg(not(any(windows, unix)))]
pub fn protect(_: &[u8], _: &str) -> Result<Vec<u8>> {
    Err(Error::Unsupported)
}
#[cfg(not(any(windows, unix)))]
pub fn unprotect(_: &[u8], _: &str) -> Result<Zeroizing<Vec<u8>>> {
    Err(Error::Unsupported)
}

#[cfg(unix)]
pub fn protect(bytes: &[u8], _: &str) -> Result<Vec<u8>> {
    Ok(bytes.to_vec())
}
#[cfg(unix)]
pub fn unprotect(bytes: &[u8], _: &str) -> Result<Zeroizing<Vec<u8>>> {
    Ok(Zeroizing::new(bytes.to_vec()))
}

#[cfg(all(test, windows))]
mod tests {
    use super::*;

    #[test]
    fn metadata_quarantine_preserves_copies_and_stops_on_a_move_failure() {
        use std::os::windows::fs::OpenOptionsExt;
        let (root, store) = crate::test_store("metadata-quarantine");
        store.save("oauth-metadata", &1).expect("metadata fixture");
        let path = store.path("oauth-metadata").expect("path");
        let original = fs::read(&path).expect("protected fixture");
        let lock = OpenOptions::new()
            .read(true)
            .share_mode(1)
            .open(&path)
            .expect("deny rename");
        assert_eq!(
            store.quarantine_preserving("oauth-metadata"),
            Err(Error::Storage)
        );
        assert!(fs::read(&path).expect("preserved") == original);
        drop(lock);
        store
            .quarantine_preserving("oauth-metadata")
            .expect("first copy");
        store
            .save("oauth-metadata", &2)
            .expect("next metadata fixture");
        store
            .quarantine_preserving("oauth-metadata")
            .expect("second copy");
        let copies: Vec<_> = fs::read_dir(&store.root)
            .expect("namespace")
            .flatten()
            .filter(|entry| {
                entry
                    .path()
                    .extension()
                    .is_some_and(|extension| extension == "corrupto")
            })
            .collect();
        assert_eq!(copies.len(), 2);
        assert!(
            copies
                .iter()
                .any(|entry| fs::read(entry.path()).expect("saved copy") == original)
        );
        assert!(!path.exists());
        drop(store);
        fs::remove_dir_all(root).expect("cleanup QA");
    }

    #[test]
    fn restore_quarantines_invalid_json_but_preserves_documents_on_io_errors() {
        use std::os::windows::fs::OpenOptionsExt;
        let (root, store) = crate::test_store("restore-io-errors");
        let oauth: crate::account::OAuth = serde_json::from_value(serde_json::json!({
            "issuer":"https://fixture.test/", "client_id":"public-fixture",
            "redirect":"http://127.0.0.1:0/callback", "authorization":"https://fixture.test/authorize",
            "token":"https://fixture.test/token", "userinfo":"https://fixture.test/userinfo"
        })).expect("OAuth de test");
        for name in ["account", "authority", "report-attempt", "roadmap"] {
            store
                .save(name, &serde_json::json!({}))
                .expect("documento invÃ¡lido protegido");
            let path = store.path(name).expect("ruta");
            let original = fs::read(&path).expect("bytes protegidos");
            let restore = || match name {
                "account" => crate::account::Account::restore(oauth.clone(), &store).map(|_| ()),
                "authority" => crate::license::authority::Authority::restore(&store).map(|_| ()),
                "report-attempt" => crate::report::Reports::restore(&store).map(|_| ()),
                _ => crate::roadmap::Roadmap::restore(&store).map(|_| ()),
            };
            let lock = OpenOptions::new()
                .read(true)
                .share_mode(0)
                .open(&path)
                .expect("simular E/S bloqueada");
            assert!(
                matches!(restore(), Err(Error::Storage)),
                "{name}: no convertir E/S en valores por defecto"
            );
            assert!(!store.root.join(format!("{name}.corrupto")).exists());
            drop(lock);
            assert_eq!(fs::read(&path).expect("preservado"), original);
            restore().expect("JSON invÃ¡lido recuperado");
            assert!(!path.exists());
            assert!(store.root.join(format!("{name}.corrupto")).exists());
        }
        drop(store);
        fs::remove_dir_all(root).expect("limpiar");
    }

    #[test]
    fn beta_generation_supports_long_dpapi_paths() {
        let root = std::env::temp_dir().join(format!(
            "vantare-beta-installed-data-{}",
            crate::random_id().expect("test")
        ));
        let data = root
            .join("generations")
            .join("g".repeat(32))
            .join("data/Vantare/native/services");
        let store = Store::open(&data, "beta-long-path").expect("abrir generación beta");
        store.save("session", &"fixture").expect("guardar DPAPI");
        store.save("session", &"updated").expect("reemplazar DPAPI");
        drop(store);
        let store = Store::open(&data, "beta-long-path").expect("reabrir");
        assert_eq!(
            store.load::<String>("session").expect("restaurar"),
            "updated"
        );
        drop(store);
        fs::remove_dir_all(root).expect("cleanup");
    }

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

#[cfg(all(test, unix))]
mod unix_tests {
    use super::*;

    #[test]
    fn session_files_are_private_atomic_and_single_owner() {
        let root = std::env::temp_dir().join(format!(
            "vantare-services-test-{}",
            crate::random_id().expect("test entropy")
        ));
        let value = crate::random_id().expect("test value");
        let store = Store::open(&root, "storage-test").expect("store");
        assert!(matches!(
            Store::open(&root, "storage-test"),
            Err(Error::Busy)
        ));
        store.save("session", &value).expect("guardar");
        store.save("session", &value).expect("reemplazar");
        let path = store.path("session").expect("ruta");
        let info = fs::symlink_metadata(&path).expect("fichero");
        assert_eq!(info.permissions().mode() & 0o777, 0o600);
        assert_eq!(
            fs::read_to_string(&path).expect("JSON plano"),
            format!("\"{value}\"")
        );
        drop(store);

        let store = Store::open(&root, "storage-test").expect("reabrir");
        assert_eq!(store.load::<String>("session").expect("restaurar"), value);
        store.remove("session").expect("borrar");
        assert!(matches!(
            store.load::<String>("session"),
            Err(Error::NotFound)
        ));
        drop(store);
        fs::remove_dir_all(root).expect("limpiar");
    }
}
