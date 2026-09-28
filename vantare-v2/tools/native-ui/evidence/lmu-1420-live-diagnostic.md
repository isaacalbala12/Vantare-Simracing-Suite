# LMU 1.4.2.0: diagnóstico vivo del 28/09/2026

Con LMU abierto en una sesión de práctica de Circuit de la Sarthe, el endpoint
REST `/rest/watch/sessionInfo` respondió y su tiempo de evento avanzó. La
memoria compartida `LMU_Data` también estaba disponible. El test opt-in
`TestCaptureLMUFixturesOptIn`, usando el sanitizador del repositorio, obtuvo
cuatro pares de capturas compartida/REST con `player=true`, 18 coches y REST
`status=live`. No se guardaron bytes crudos ni se tocaron perfiles del usuario.

| Captura | Tiempo de origen | SHA-256 de memoria compartida sanitizada | SHA-256 de REST sanitizado |
|---|---:|---|---|
| Inicial | 215,000 s | `7ddd923cddcc2653f2ceee5c6e6c26bbb8d28a7df80e59bb1791b4f49e1c8ae5` | `53d2722743187f7366a1a504f57c741903c5bc67d6624b302cba454c3efb6e6f` |
| Ronda 1 | 246,400 s | `191f1491fcb74f77afa57a773ecb207f4831a0e80ee7c474c391451fa12c2ab4` | `6a84337a016524b1fbb4f7728b6a8af587d2cfbfad1a13cc224fa34f0986e9e4` |
| Ronda 2 | 249,000 s | `48ee2f0993b3574bdf6cfc8d1f6e59dc5d2f1f02b4fdd42c7feeb8195cfbe689` | `88ff4a14eaf3c5b508771df1f54a0018536218258e1d9912d5bf9eb6b1c91847` |
| Ronda 3 | 251,800 s | `45b2f7007ab8c5cb30be8dde914a847656ad2cd2c87a8d5aadbf71d85a32c4b9` | `f3c428882f227d65f9d3c6125259e554154fc62373f001085aae534be29c232c` |

Los ficheros sanitizados están solo en `C:\tmp\vantare-lmu-1420-probe`, fuera
del PR. La entrada temporal de `diagnosticLMUVersions` con el par exacto
FileVersion/ProductVersion 1.4.2.0 se trasladó a la tarea separada
[VAN-777](https://app.notion.com/p/3e9e51695c65813ba4e8c2c8aa013dd1?pvs=204)
([PR borrador #1413](https://github.com/isaacalbala12/Vantare-Simracing-Suite/pull/1413));
no está en esta PR ni cambia `supportedLMUVersions`.
`TestLiveLMUSharedMemoryOptIn` sigue fallando
intencionadamente para esta build con
`evidence=unsupported;build=1.4.2.0`: falta una captura de menú y la
verificación completa para admitirla en el driver productivo. Por tanto, este
diagnóstico acredita datos reales cambiantes, pero no un flujo Overlay V2 vivo,
paridad UI, ahorro de CPU ni elección de stack.
