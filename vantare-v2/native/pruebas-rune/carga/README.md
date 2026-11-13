# Carga GPU de VANTA-141

Solo compilar en servidor por la cola; ejecutar únicamente en el PC.
D3D11 hardware sin WARP, monitor principal a --hz 60 o 144, salida nueva
--output y duración --seconds 20..180. Calibra diez segundos para ≈70% del
periodo, congela iteraciones y verifica GPU entre segundos 12 y 14.
La escena y resolución no cambian durante el proceso.

La campaña primero ejecuta una calibración SIN overlays y guarda
frozen_iterations del CSV y su hash. Todas las observaciones de esa misma
resolución/frecuencia usan --iterations N con ESE MISMO valor. No recalibrar
adaptativamente para cada motor: ocultaría parte de su impacto sobre la carga.
La variante fija comprueba que sigue cerca de 70% sin cambiar su trabajo.
--ready archivo-nuevo.json publica disponibilidad validada a partir de 14 s;
la interfaz se inicia después de esa marca. ready=false invalida la ronda.

--control-stdin exige un pipe del controlador. Su EOF cierra de forma normal
y guarda el CSV, sin hilo lector ni procesos abandonados. Escape/cierre manual
invalidan la ejecución. El CSV conserva iteraciones, reloj y todos los frames.
Calibración, repetibilidad y cierre solo se verificarán en el PC, sin ejecutar
este programa ni sondas de versión en el servidor.
