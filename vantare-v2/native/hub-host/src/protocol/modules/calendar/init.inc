        calendar_state: crate::calendar::State::new(args.data.clone()).with_layout(args.layout.clone()),
        calendar_launch: crate::calendar::launch::Scheduler::default(),
        calendar_launch_published: None,
