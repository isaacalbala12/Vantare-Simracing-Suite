/** `roadmap.*` catalogue for Command Orbit v0.3 (`docs/design/orbit-v03/14-i18n.md`).
    "What's next" view (D-R3-F-1): a single narrative column NOW / NEXT / DONE.
    Labels only: phases and milestones come from `docs/roadmap/roadmap.json`. */
export const roadmapOrbitEn: Record<string, string> = {
  "roadmap.eyebrow": "Product direction",
  "roadmap.title": "Roadmap",
  "roadmap.lead":
    "What is being worked on now, what comes next and what already shipped, exactly as docs/roadmap/plan.md declares it.",

  "roadmap.source.loading": "Loading the source…",
  "roadmap.source.ok": "Source available · {{version}}",
  "roadmap.source.fallback": "Bundled copy · {{version}}",

  "roadmap.channel.stable": "Stable",
  "roadmap.channel.testers": "Testers",
  "roadmap.channel.nightly": "Nightly",

  "roadmap.state.done": "Completed",
  "roadmap.state.active": "In progress",
  "roadmap.state.planned": "To plan",
  "roadmap.state.future": "Future",

  "roadmap.now.title": "Now",
  "roadmap.now.position": "Phase {{n}} of {{total}}",
  "roadmap.now.none": "The source declares no phase in progress.",
  "roadmap.now.anchored": "Milestones in this phase",

  "roadmap.next.title": "Next",
  "roadmap.next.none": "The source declares no phase left to plan.",
  "roadmap.next.plans": "Declared plans",

  "roadmap.done.title": "Done",
  "roadmap.done.accordion": "Completed phases and shipped milestones",
  "roadmap.done.summary": "{{phases}} phases · {{releases}} shipped",
  "roadmap.done.none": "The source declares no completed phase.",
  "roadmap.done.released": "Shipped",

  "roadmap.delivered.title": "Delivered recently",
  "roadmap.delivered.note":
    "{{n}} changes read from the commits already merged into nightly, not from the plan.",
  "roadmap.delivered.kind.feat": "Feature",
  "roadmap.delivered.kind.fix": "Fix",
  "roadmap.delivered.kind.perf": "Performance",
  "roadmap.delivered.kind.docs": "Docs",
  "roadmap.delivered.kind.change": "Change",

  "roadmap.derived": "derived",
  "roadmap.derivedNote":
    "The source does not say which phase a milestone belongs to: the grouping comes from its type.",

  "roadmap.context.title": "Roadmap",
  "roadmap.context.nowSub": "the phase in progress",
  "roadmap.context.nextSub": "to plan and future",
  "roadmap.context.doneSub": "completed and shipped",
  "roadmap.context.hint": "Click a section to jump to it.",
};
