use super::super::read_request;
use std::io::{Cursor, ErrorKind};
use vantare_services::protocol::{self, Command, Request};

#[test]
fn eof_between_complete_requests_is_a_normal_disconnect() {
    let mut bytes = Vec::new();
    for sequence in 1..=2 {
        protocol::write(
            &mut bytes,
            &Request {
                version: protocol::VERSION,
                sequence,
                nonce: "framing-fixture".into(),
                command: Command::Status,
            },
        )
        .expect("trama completa");
    }
    let mut input = Cursor::new(bytes);
    for sequence in 1..=2 {
        let request = read_request(&mut input)
            .expect("lectura")
            .expect("petición");
        assert_eq!(request.sequence, sequence);
        assert!(matches!(request.command, Command::Status));
    }
    assert!(
        read_request(&mut input)
            .expect("desconexión normal")
            .is_none()
    );
    assert!(
        read_request(&mut Cursor::new([]))
            .expect("EOF inicial")
            .is_none()
    );
}

#[test]
fn eof_inside_header_or_payload_and_malformed_requests_remain_errors() {
    let mut bytes = Vec::new();
    protocol::write(
        &mut bytes,
        &Request {
            version: protocol::VERSION,
            sequence: 1,
            nonce: "framing-fixture".into(),
            command: Command::Status,
        },
    )
    .expect("trama completa");
    for length in 1..bytes.len() {
        assert_eq!(
            read_request(&mut &bytes[..length])
                .err()
                .expect("trama truncada")
                .kind(),
            ErrorKind::UnexpectedEof,
            "prefijo de {length} bytes"
        );
    }
    let mut malformed = Vec::new();
    protocol::write(&mut malformed, &"no es una petición").expect("trama con JSON válido");
    assert_eq!(
        read_request(&mut malformed.as_slice())
            .err()
            .expect("petición inválida")
            .kind(),
        ErrorKind::InvalidData
    );
}
