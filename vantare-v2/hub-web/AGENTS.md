# Hub web — VANTA-138 / ADR 0107

Leer el diseño aprobado en `D:/VantareServer/evidence/hub-web/DISENO.md`.
El núcleo y los documentos pertenecen al anfitrión Rust. Electron solo pinta.
No recuperar el frontend retirado. No editar `native/hub` salvo el exportador autorizado.

- Versiones exactas, Bun 1.4.4. node_modules, Electron y cachés en D:.
- Sin Node, red ni secretos en el renderer. Mantener sandbox, CSP y fuses.
- Los tipos del puente se generan desde Rust en el paso 3; no duplicar contratos.
- `design/tokens.json` será la fuente única tras el paso 2a.
- Tailwind sin valores predeterminados: `--*: initial` y solo tokens Vantare.
- `lint:design` rechaza colores sueltos, valores arbitrarios y estilos visuales en pantallas.
- Las pantallas componen `ui/`, sin estilos propios. Textos visibles en `i18n/es.ts`.
- Foco visible interior, semántica nativa, teclado y pruebas reales Windows.
- Gates: typecheck, lint, test, build; empaquetado y smoke Electron local con datos QA.
- No publicar ni integrar canales; un PR draft por paso.
