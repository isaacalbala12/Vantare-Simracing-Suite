
13/11: los siete tests específicos de medición pasan. El guard de procedencia
ignora únicamente el módulo temporal exacto que electron-vite 6 crea al cargar
su configuración; cualquier cambio versionado u otro archivo nuevo sigue
bloqueando el paquete. No se ignoran fuentes sin commit. La primera ejecución
de empaquetado se detuvo por ese temporal antes de generar ningún Hub listo.
Tipos de aplicación/scripts ya PASS. Repetición por cola pendiente, sin Electron
ni GPUI ejecutados en servidor.
