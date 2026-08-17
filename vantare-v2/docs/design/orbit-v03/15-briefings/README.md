# 15 · Briefings de ejecución (uno por pestaña)

Cada briefing es autocontenido y sirve como prompt para un agente. Orden recomendado y dependencias:

| # | Briefing | Depende de | Se valida en |
|---|---|---|---|
| 00 | [Fundamentos](00-fundamentos.md) — tema, tokens, sprite, fuentes | — | harness de tokens |
| 01 | [Shell](01-shell.md) — rail, columna, topbar, paleta | 00 | cualquier vista |
| 02 | [Kit de componentes](02-kit.md) | 00 | storybook/harness |
| 03 | [Inicio](03-inicio.md) | 01, 02 | `?view=inicio` |
| 04 | [Overlays Studio](04-studio.md) | 01, 02 | `?view=studio` |
| 05 | [Launcher](05-launcher.md) | 01, 02 | `?view=launcher` |
| 06 | [Carreras](06-carreras.md) | 01, 02 | `?view=carreras` |
| 07 | [Estrategia](07-estrategia.md) | 01, 02, 06 (motor de salidas) | `?view=estrategia` |
| 08 | [Ingeniero](08-ingeniero.md) | 01, 02 | `?view=ingeniero` |
| 09 | [Telemetría](09-telemetria.md) | 01, 02 | `?view=telemetria` |
| 10 | [Roadmap](10-roadmap.md) | 01, 02 | `?view=roadmap` |
| 11 | [Ajustes](11-ajustes.md) | 01, 02 | `?view=ajustes` |
| 12 | [Testing Center](12-testing-center.md) | 01, 02, 11 | `?channel=nightly&view=testing` |

Reglas comunes a todos:
1. Referencia visual = `vantare-exploration-v03-orbit.html` con el query param indicado + captura en `../evidence/`. Paridad esperada: misma estructura, medidas y estados; los datos reales sustituyen a los de muestra.
2. Tokens solo desde `orbit.tokens.css` / tema; componentes solo del kit (`12`); textos por i18n (`14`); algoritmos según `13`.
3. Entrega: PR con capturas Playwright 1920×1080 y 1920×900 en `evidence/porte/<briefing>/`, checklist `11` marcada, decisiones nuevas en `00-decisiones.md`.
4. Si algo del briefing contradice el código real (contratos, permisos, datos), **prevalece el código** y se anota la desviación en el PR.
