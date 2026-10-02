# Plan: compacto iRacing con visual Eficiencia

1. Revisar el renderer y tokens actuales de `vantare-iracing`.
2. Sustituir la composición iRacing por el panel funcional de Eficiencia, manteniendo el view-model y sus toggles.
3. Retirar el volante visible y conservar `steering` únicamente en el contrato de datos.
4. Añadir/ajustar tests del renderer para valores, estados, toggles y ausencia del SVG.
5. Ejecutar tests específicos, typecheck, build y comprobaciones visuales responsive.
6. Integrar solo los archivos/hunks propios después de revisar el diff.
