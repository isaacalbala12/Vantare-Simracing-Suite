use std::path::PathBuf;
use vantare_ipc::paths::{Error, Root};

pub fn default_data_dir() -> Result<PathBuf, &'static str> {
    Root::from_env()
        .map(|root| root.base().to_owned())
        .map_err(Error::message)
}

#[cfg(test)]
mod tests {
    use super::default_data_dir;
    use std::{env, path::PathBuf};

    #[test]
    fn default_data_dir_uses_the_validated_qa_override() {
        let actual = default_data_dir().expect("directorio de datos");
        let expected = PathBuf::from(env::var_os("VANTARE_NATIVE_DATA_ROOT").expect("override QA"));
        assert!(expected.is_absolute());
        assert_eq!(actual, expected);
    }
}
