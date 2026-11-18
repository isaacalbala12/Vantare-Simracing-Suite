# Licencia Owner de QA en otro PC

1. En el PC de QA, ejecuta `vantare-qa-license fingerprint` y pasa la huella al servidor.
2. En el servidor, ejecuta `vantare-qa-license sign --key <priv> --fingerprint <huella> --out <cred.json>`. Guarda el JSON fuera de Git y de la carpeta de la clave privada. Usa rutas absolutas locales.
3. Compila el CLI y el núcleo QA con la feature `qa-license`, la misma entrada pública `qa-…` en `VANTARE_LICENSE_PUBLIC_KEYS` y canal `nightly` para el núcleo. En el PC, ejecuta `vantare-qa-license install-credential --credential <cred.json> --qa-root <raíz QA nueva>` antes de arrancar el núcleo con esa raíz.

Transfiere solo el JSON firmado y los binarios QA. La privada se queda en el servidor. La credencial dura hasta 24 horas y se guarda fuera de Git y de los PR.

`install --key …` se conserva exclusivamente para pruebas en el mismo equipo.
