        launcher_reader: crate::launcher::Reader::new(args.launcher.clone()),
        reserved_profile: None,
        profile_step_keys: crate::launcher::editor::StepKeys::default(),
        app_picker: crate::launcher::apps::Picker::default(),
