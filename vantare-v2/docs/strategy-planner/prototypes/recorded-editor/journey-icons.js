// Pictogramas del prototipo, acotados al asistente y las vistas en revisión.
function journeyIcon(name) {
  const paths={
    swap:'<path d="M3 7h17m-5-5 5 5-5 5M21 17H4m5-5-5 5 5 5"/>',
    boxes:'<path d="M3 21V9l9-7 9 7v12M7 21V10h10v11M7 14h10M7 18h10"/>',
    warning:'<path d="m12 2 11 19H1ZM12 8v6M12 18h.01"/>',
    calendar:'<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M7 2v6M17 2v6"/>',
    wand:'<path d="m3 21 13-13 3 3L6 24M14 10l3 3M5 3v4M3 5h4M19 1v4M17 3h4M21 16v4M19 18h4"/>',
    lock:'<rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V6a4 4 0 0 1 8 0v4M12 14v3"/>',
    search:'<circle cx="10" cy="10" r="7"/><path d="m15 15 7 7"/>',
    shield:'<path d="m12 2 9 4v6c0 5-5 8-9 10-4-2-9-5-9-10V6Z"/>',
    flag:'<path d="M4 22V3M4 4c5-5 10 5 17 0v12c-7 5-12-5-17 0"/>',
    save:'<path d="M3 2h14l4 4v16H3ZM7 2v7h10V2M7 22v-8h10v8M13 3v4"/>',
    sliders:'<path d="M2 5h5M11 5h11M2 12h12M18 12h4M2 19h3M9 19h13"/><circle cx="9" cy="5" r="2"/><circle cx="16" cy="12" r="2"/><circle cx="7" cy="19" r="2"/>',
    gear:'<path d="m9 2-1 3-3 1-3 4 2 2-1 4 3 3 3-1 3 3 3-1 1-3 3-1 2-4-2-2 1-4-3-2-3 1-2-3Z"/><circle cx="12" cy="12" r="4"/>',
    platform:'<circle cx="12" cy="12" r="9"/><path d="m4 16 6 3 8-9M5 17l6 2M15 6l4 4"/><circle cx="17" cy="8" r="3"/>',
    check:'<circle cx="12" cy="12" r="10"/><path d="m6 12 4 4 8-9"/>',
    history:'<path d="M3 10a9 9 0 1 1 0 6M3 3v7h7M12 6v7l4 2"/>',
    file:'<path d="M5 2h9l5 5v15H5ZM14 2v6h5"/>',
  };
  return paths[name]?`<svg aria-hidden="true" viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">${paths[name]}</svg>`:detailIcon(name);
}
