struct Session {

    remote: Option<(u32, RemoteKind)>,
    subscriptions: std::collections::BTreeSet<Topic>,
    exit_code: u8,
    launcher: PathBuf,
    core: Core,
    settings: Settings,
    confirmation: Option<ready::Ready>,
    current: protocol::CoreStatus,
    last: Option<protocol::CoreStatus>,
    last_event: Option<Instant>,
    closing: Option<(CloseReason, Instant)>,
    handshaken: bool,

@FIELDS@
}
