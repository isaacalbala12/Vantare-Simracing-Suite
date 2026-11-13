//! Same typed contract and framing as the host; no mirrored DTOs.
use std::io::{self, Read, Write};
use vantare_hub_host::{
    frame,
    protocol::{self, HostToUi, UiToHost},
};
#[derive(Default)]
pub struct Client {
    reader: frame::Reader,
    hello: bool,
}
impl Client {
    pub fn authenticate(output: &mut impl Write, token: &str) -> io::Result<()> {
        frame::write(
            output,
            &serde_json::json!({"kind":"authenticate", "token":token}),
        )
    }
    pub fn receive(&mut self, pipe: &mut (impl Read + Write)) -> io::Result<Option<HostToUi>> {
        let Some(message) = self.reader.next::<HostToUi>(pipe)? else {
            return Ok(None);
        };
        if let HostToUi::Hello { version, .. } = &message {
            if self.hello || *version != protocol::VERSION {
                return Err(io::ErrorKind::InvalidData.into());
            }
            frame::write(
                pipe,
                &UiToHost::Hello {
                    version: protocol::VERSION,
                },
            )?;
            self.hello = true;
        } else if !self.hello {
            return Err(io::ErrorKind::InvalidData.into());
        }
        if matches!(message, HostToUi::CloseRequested { .. }) {
            // This read-only frame has no pending document writes to veto closing.
            self.send(pipe, &UiToHost::CloseAnswer { allow: true })?;
        }
        Ok(Some(message))
    }
    pub fn send(&self, output: &mut impl Write, message: &UiToHost) -> io::Result<()> {
        if !self.hello || matches!(message, UiToHost::Hello { .. }) {
            return Err(io::ErrorKind::PermissionDenied.into());
        }
        frame::write(output, message)
    }
}
#[cfg(test)]
mod tests {
    use super::*;
    struct Memory {
        input: std::io::Cursor<Vec<u8>>,
        output: Vec<u8>,
    }
    impl Read for Memory {
        fn read(&mut self, out: &mut [u8]) -> io::Result<usize> {
            self.input.read(out)
        }
    }
    impl Write for Memory {
        fn write(&mut self, b: &[u8]) -> io::Result<usize> {
            self.output.write(b)
        }
        fn flush(&mut self) -> io::Result<()> {
            Ok(())
        }
    }
    #[test]
    fn authentication_hello_ready_and_close_use_host_frames() {
        let hello: HostToUi =
            serde_json::from_str(include_str!("../../hub-web/fixtures/ajustes-base.json")).unwrap();
        let mut bytes = Vec::new();
        frame::write(&mut bytes, &hello).unwrap();
        frame::write(
            &mut bytes,
            &HostToUi::CloseRequested {
                reason: protocol::CloseReason::ControlEof,
            },
        )
        .unwrap();
        let mut pipe = Memory {
            input: std::io::Cursor::new(bytes),
            output: Vec::new(),
        };
        let mut client = Client::default();
        assert!(client.send(&mut pipe, &UiToHost::Ready {}).is_err());
        Client::authenticate(&mut pipe, "a").unwrap();
        assert!(matches!(
            client.receive(&mut pipe).unwrap(),
            Some(HostToUi::Hello { .. })
        ));
        client.send(&mut pipe, &UiToHost::Ready {}).unwrap();
        client
            .send(
                &mut pipe,
                &UiToHost::Request {
                    id: 0,
                    request: protocol::Request::WindowClose {},
                },
            )
            .unwrap();
        assert!(matches!(
            client.receive(&mut pipe).unwrap(),
            Some(HostToUi::CloseRequested { .. })
        ));
        let mut input = pipe.output.as_slice();
        let mut reader = frame::Reader::default();
        assert_eq!(
            reader
                .next::<serde_json::Value>(&mut input)
                .unwrap()
                .unwrap()["kind"],
            "authenticate"
        );
        assert!(matches!(
            reader.next::<UiToHost>(&mut input).unwrap(),
            Some(UiToHost::Hello { .. })
        ));
        assert!(matches!(
            reader.next::<UiToHost>(&mut input).unwrap(),
            Some(UiToHost::Ready {})
        ));
        assert!(matches!(
            reader.next::<UiToHost>(&mut input).unwrap(),
            Some(UiToHost::Request {
                id: 0,
                request: protocol::Request::WindowClose {}
            })
        ));
        assert!(matches!(
            reader.next::<UiToHost>(&mut input).unwrap(),
            Some(UiToHost::CloseAnswer { allow: true })
        ));
    }
    #[test]
    fn incompatible_hello_never_allows_ready() {
        let mut value: serde_json::Value =
            serde_json::from_str(include_str!("../../hub-web/fixtures/ajustes-base.json")).unwrap();
        value["version"] = 0.into();
        let mut bytes = Vec::new();
        frame::write(&mut bytes, &value).unwrap();
        let mut pipe = Memory {
            input: std::io::Cursor::new(bytes),
            output: Vec::new(),
        };
        let mut client = Client::default();
        assert_eq!(
            client.receive(&mut pipe).unwrap_err().kind(),
            io::ErrorKind::InvalidData
        );
        assert!(client.send(&mut pipe, &UiToHost::Ready {}).is_err());
        assert!(pipe.output.is_empty());
    }
    #[test]
    fn all_shared_contract_samples_roundtrip_without_a_window() {
        let directory = std::path::Path::new(env!("CARGO_MANIFEST_DIR"))
            .join("../hub-web/src/contract/generated/corpus");
        for entry in std::fs::read_dir(directory).unwrap() {
            let path = entry.unwrap().path();
            if path.extension().is_none_or(|e| e != "json") {
                continue;
            }
            let corpus: serde_json::Value =
                serde_json::from_slice(&std::fs::read(path).unwrap()).unwrap();
            for value in corpus["host"].as_array().unwrap() {
                let typed: HostToUi = serde_json::from_value(value.clone()).unwrap();
                let mut bytes = Vec::new();
                frame::write(&mut bytes, &typed).unwrap();
                assert_eq!(
                    frame::Reader::default()
                        .next::<HostToUi>(&mut bytes.as_slice())
                        .unwrap(),
                    Some(typed)
                );
            }
            for value in corpus["ui"].as_array().unwrap() {
                let typed: UiToHost = serde_json::from_value(value.clone()).unwrap();
                let mut bytes = Vec::new();
                frame::write(&mut bytes, &typed).unwrap();
                assert_eq!(
                    frame::Reader::default()
                        .next::<UiToHost>(&mut bytes.as_slice())
                        .unwrap(),
                    Some(typed)
                );
            }
        }
    }
}
