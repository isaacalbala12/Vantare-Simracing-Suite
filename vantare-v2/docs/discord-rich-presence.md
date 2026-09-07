# Discord Rich Presence

Vantare muestra una actividad opcional en Discord Desktop cuando se ejecuta en
Windows. La actividad publica únicamente:

- `Vantare Simracing Suite` como nombre de la aplicación.
- `Hub activo`, `Telemetría conectada` o `Telemetría desconectada`.
- La hora de arranque de Vantare para que Discord muestre el tiempo transcurrido.

La integración usa el IPC local de Discord. No lee canales, no usa bots, no
envía datos de carrera, identidad ni credenciales, y no impide iniciar Vantare
si Discord está cerrado. El cliente reintenta la conexión y borra la actividad
al salir.

## Configuración

La aplicación pública de Discord de Vantare usa el Client ID
`1546608423485972571`. Los assets de Rich Presence son opcionales: si se
configuran en el portal de desarrolladores, pueden añadirse más adelante sin
cambiar el contrato del cliente.

Para desactivar la presencia en una sesión de Windows:

```text
VANTARE_DISCORD_RPC=0
```

## Verificación manual

1. Abrir Discord Desktop e iniciar Vantare.
2. Comprobar en el perfil de Discord que aparece `Vantare Simracing Suite` como actividad.
3. Arrancar con LMU disponible y verificar el estado `Telemetría conectada`.
4. Cerrar LMU o dejarlo sin telemetría y verificar `Telemetría desconectada`.
5. Cerrar Vantare y comprobar que la actividad desaparece.
6. Repetir con `VANTARE_DISCORD_RPC=0` y comprobar que Vantare funciona sin actividad.
