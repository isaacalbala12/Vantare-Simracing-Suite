



        remote: None,

        subscriptions: std::collections::BTreeSet::new(),



        exit_code: 0,
        launcher: args.launcher.clone(),
        core,
        settings,
        confirmation: ready::Ready::from_executable(&executable)?,
        current: protocol::CoreStatus::default(),
        last: None,
        last_event: None,
        closing: None,
        handshaken: false,
    