# Temas compartidos del Hub y Workshop (#1470)

Los cuatro JSON son la fuente de los tokens del nuevo Hub. Ajustes → Apariencia
guarda la selección en `appearance.json`, en el directorio de datos de la instancia.
Los estilos de los widgets siguen siendo independientes.

Release incorpora los JSON mediante `include_str!` y no lee estos archivos del disco.
La API pública es `vantare_ui::theme::{Design, Tokens, LiveTheme}`.
`LiveTheme::new` lee disco en builds debug; producto Release/prueba usa los
JSON incorporados. `LiveTheme::for_authoring` habilita autoría explícita también
en Workshop `--dev` construido en perfil prueba. `poll(design)` devuelve si
hay cambio; el consumidor instala `value`, actualiza su ventana y presenta
`error` si existe. `register_fonts(cx)` añade Rajdhani y Space Mono desde `native/ui/assets/fonts/`
(con sus licencias OFL); se llama después del registro Inter ya existente.
No hace falta depender del crate Hub.

En desarrollo, el Hub observa su fecha de modificación desde `native/ui/themes/`;
`VANTARE_UI_THEMES` permite indicar otra carpeta de autoría. Se aplica un cambio
válido sin reiniciar. Una escritura parcial o inválida conserva el último tema
válido y muestra el error. Colores RGB: enteros `0xRRGGBB` expresados en decimal
JSON; bordes: `0xRRGGBBAA`. Radios, tipografía, sombras y geometría se validan.

Grafito carmín corresponde a la especificación aprobada de ronda 8. Harness (id
`deepseek-harness`, conservado por compatibilidad) usa los neutros de la referencia oficial proporcionada en el brief;
Noche Le Mans y Piedra cálida son alternativas oscuras. No hay líneas verticales
de acento: la selección usa superficie, borde, luz superior y color.

Inicio usa los renderizadores productivos de `vantare-ui::Overlay` para las
miniaturas. Los datos de captura y replay son ejemplos de QA, nunca evidencia de
LMU en vivo ni medidas de CPU. La navegación beta usa el indicador de rol de la
política verificada del núcleo; comprar el módulo Calendario no concede rol tester.

Para revisar: cambiar tema, volver a Inicio, reiniciar y comprobar la selección;
editar el JSON en desarrollo y comprobar actualización y recuperación tras un
error de sintaxis; usar Ctrl+B y Ctrl+L; revisar 1440/1920/2560 con la escala de
Windows. Toda compilación de esta campaña pasa por `C:/tmp/fase2/compilar.ps1`.
