//! Synthetic fixture inspection, absent from product builds.
use super::Store;
use serde::de::DeserializeOwned;
impl Store {
    pub fn fixture<T: DeserializeOwned>(&self, name: &str) -> crate::Result<T> {
        self.read(name)?.required()
    }
}
