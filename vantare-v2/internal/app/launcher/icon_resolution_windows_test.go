//go:build windows

package launcher

import (
	"bytes"
	"errors"
	"image"
	"image/png"
	"os"
	"path/filepath"
	"testing"
)

// ---------------------------------------------------------------------------
// Iconos a maxima resolucion y activos correctos (ISA-369, bloque C).
// ---------------------------------------------------------------------------

// solidIconPNG devuelve un PNG cuadrado opaco de `size` px: simula el icono de
// un ejecutable que si trae la resolucion pedida.
func solidIconPNG(t *testing.T, size int) []byte {
	t.Helper()
	img := image.NewRGBA(image.Rect(0, 0, size, size))
	for i := 0; i < len(img.Pix); i += 4 {
		img.Pix[i], img.Pix[i+1], img.Pix[i+2], img.Pix[i+3] = 0x20, 0x40, 0x80, 0xff
	}
	var buf bytes.Buffer
	if err := png.Encode(&buf, img); err != nil {
		t.Fatalf("encode: %v", err)
	}
	return buf.Bytes()
}

// cornerIconPNG devuelve un lienzo de `canvas` px con contenido opaco solo en
// los `content` px de la esquina superior izquierda: es lo que entrega
// SHIL_JUMBO cuando el ejecutable no tiene un icono de 256 px.
func cornerIconPNG(t *testing.T, canvas, content int) []byte {
	t.Helper()
	img := image.NewRGBA(image.Rect(0, 0, canvas, canvas))
	for y := 0; y < content; y++ {
		for x := 0; x < content; x++ {
			off := y*img.Stride + x*4
			img.Pix[off], img.Pix[off+1], img.Pix[off+2], img.Pix[off+3] = 0xff, 0x00, 0x00, 0xff
		}
	}
	var buf bytes.Buffer
	if err := png.Encode(&buf, img); err != nil {
		t.Fatalf("encode: %v", err)
	}
	return buf.Bytes()
}

// TestTrimIconCanvasPaddingRecortaElIconoDeLaEsquina cubre el motivo real del
// "los logos no estan a maxima resolucion": un icono de 32 px metido en la
// esquina de un lienzo de 256 medía 256, pasaba todos los controles de tamano y
// llegaba a la losa reducido a unos pocos pixeles.
func TestTrimIconCanvasPaddingRecortaElIconoDeLaEsquina(t *testing.T) {
	trimmed := trimIconCanvasPadding(cornerIconPNG(t, 256, 32))
	if got := pngWidth(trimmed); got != 32 {
		t.Fatalf("el lienzo debe recortarse al contenido: got %d, want 32", got)
	}
}

// TestTrimIconCanvasPaddingRespetaElIconoCompleto: un icono que ocupa el lienzo
// entero (lo normal) no se toca, y tampoco uno que solo deja un margen.
func TestTrimIconCanvasPaddingRespetaElIconoCompleto(t *testing.T) {
	full := solidIconPNG(t, 256)
	if !bytes.Equal(trimIconCanvasPadding(full), full) {
		t.Fatal("un icono de borde a borde debe devolverse intacto")
	}
	wide := cornerIconPNG(t, 256, 200)
	if !bytes.Equal(trimIconCanvasPadding(wide), wide) {
		t.Fatal("solo se recorta el caso claro de la esquina")
	}
}

// TestIconPickPrefiereLaMayorResolucion: la primera ruta que responde ya no
// gana solo por llegar antes si trae 32 px y una posterior trae 256.
func TestIconPickPrefiereLaMayorResolucion(t *testing.T) {
	var pick iconPick
	if pick.offer(solidIconPNG(t, 32), nil) {
		t.Fatal("32 px no debe aceptarse como definitivo: hay que seguir buscando")
	}
	big := solidIconPNG(t, 256)
	if !pick.offer(big, nil) {
		t.Fatal("256 px debe aceptarse y cortar la busqueda")
	}
	if !bytes.Equal(pick.data, big) {
		t.Fatal("debe quedarse con el mayor")
	}
}

// TestIconPickSeQuedaConLoMejorCuandoNadaLlegaAlMinimo: si ninguna ruta alcanza
// el minimo, se devuelve la mayor vista en vez de nada.
func TestIconPickSeQuedaConLoMejorCuandoNadaLlegaAlMinimo(t *testing.T) {
	var pick iconPick
	pick.offer(solidIconPNG(t, 16), nil)
	pick.offer(nil, errors.New("ruta sin icono"))
	pick.offer(solidIconPNG(t, 48), nil)
	if got := pngWidth(pick.data); got != 48 {
		t.Fatalf("debe conservar el mayor visto: got %d, want 48", got)
	}
}

// TestResolveSquirrelIconSource cubre Discord: el ejecutable registrado es el
// stub `Update.exe`, que no lleva icono propio (el shell devolvia el icono
// generico de Windows y la losa parecia vacia), y el logotipo real esta al lado.
func TestResolveSquirrelIconSource(t *testing.T) {
	root := filepath.Join(t.TempDir(), "Discord")
	if err := os.MkdirAll(filepath.Join(root, "app-1.0.9253"), 0o755); err != nil {
		t.Fatalf("mkdir: %v", err)
	}
	update := filepath.Join(root, "Update.exe")
	if err := os.WriteFile(update, []byte("stub"), 0o644); err != nil {
		t.Fatalf("write: %v", err)
	}

	if got := resolveSquirrelIconSource(update); got != "" {
		t.Fatalf("sin activos al lado no debe inventarse una fuente, got %q", got)
	}

	realExe := filepath.Join(root, "app-1.0.9253", "Discord.exe")
	if err := os.WriteFile(realExe, []byte("app"), 0o644); err != nil {
		t.Fatalf("write: %v", err)
	}
	if got := resolveSquirrelIconSource(update); got != realExe {
		t.Fatalf("got %q, want %q", got, realExe)
	}

	ico := filepath.Join(root, "app.ico")
	if err := os.WriteFile(ico, []byte("ico"), 0o644); err != nil {
		t.Fatalf("write: %v", err)
	}
	if got := resolveSquirrelIconSource(update); got != ico {
		t.Fatalf("el app.ico del instalador manda: got %q, want %q", got, ico)
	}

	if got := resolveSquirrelIconSource(realExe); got != "" {
		t.Fatalf("solo aplica al stub de Squirrel, got %q", got)
	}
}

// TestSaveIconToDiskSinFicheroPrevio cubre la instalacion nueva: sin fichero de
// cache, guardar el primer icono reventaba con "assignment to entry in nil map"
// y mataba la goroutine de extraccion en pleno escaneo.
func TestSaveIconToDiskSinFicheroPrevio(t *testing.T) {
	probe := filepath.Join(t.TempDir(), "vantare-nil-map-probe.exe")
	if err := os.WriteFile(probe, []byte("exe"), 0o644); err != nil {
		t.Fatalf("write: %v", err)
	}
	iconDiskCacheFileOverride = filepath.Join(t.TempDir(), "no-existe", "icons-cache-v2.json")
	defer func() { iconDiskCacheFileOverride = "" }()

	iconDiskMu.Lock()
	iconDiskLoaded = false
	iconDiskData = iconDiskCache{}
	iconDiskMu.Unlock()

	saveIconToDisk(probe, solidIconPNG(t, 64))

	iconDiskMu.Lock()
	stored := len(iconDiskData.Icons)
	iconDiskMu.Unlock()
	if stored != 1 {
		t.Fatalf("el icono debe quedar guardado, got %d entradas", stored)
	}
}

// TestSaveIconToDiskConCacheEnDiscoDegradada (ISA-681) cubre las rutas de carga
// que no pasan por la instalacion nueva: un fichero corrupto, uno de version
// antigua y uno valido pero con los mapas a null. En las tres, la carga sale
// antes de deserializar el mapa y `saveIconToDisk` escribia sobre un mapa nil,
// reventando la goroutine de extraccion de iconos en pleno escaneo.
func TestSaveIconToDiskConCacheEnDiscoDegradada(t *testing.T) {
	casos := map[string]string{
		"json corrupto":   "{no es json",
		"version antigua": `{"version":1,"icons":{"x":{"path":"x"}},"shortcuts":{}}`,
		"mapas nulos":     `{"version":2,"icons":null,"shortcuts":null}`,
		"mapas ausentes":  `{"version":2}`,
		"fichero vacio":   "",
	}
	for nombre, contenido := range casos {
		t.Run(nombre, func(t *testing.T) {
			dir := t.TempDir()
			probe := filepath.Join(dir, "vantare-nil-map-probe.exe")
			if err := os.WriteFile(probe, []byte("exe"), 0o644); err != nil {
				t.Fatalf("write exe: %v", err)
			}
			cacheFile := filepath.Join(dir, "icons-cache-v2.json")
			if err := os.WriteFile(cacheFile, []byte(contenido), 0o644); err != nil {
				t.Fatalf("write cache: %v", err)
			}
			iconDiskCacheFileOverride = cacheFile
			defer func() { iconDiskCacheFileOverride = "" }()

			iconDiskMu.Lock()
			iconDiskLoaded = false
			iconDiskData = iconDiskCache{}
			iconDiskMu.Unlock()

			// No debe entrar en panico ni al leer ni al escribir.
			if icon := loadIconFromDisk(probe); icon != nil {
				t.Fatalf("una cache degradada no puede devolver icono, got %d bytes", len(icon))
			}
			saveIconToDisk(probe, solidIconPNG(t, 64))

			iconDiskMu.Lock()
			stored := len(iconDiskData.Icons)
			shortcutsNil := iconDiskData.Shortcuts == nil
			iconDiskMu.Unlock()
			if stored != 1 {
				t.Fatalf("el icono debe quedar guardado, got %d entradas", stored)
			}
			if shortcutsNil {
				t.Fatal("el mapa de shortcuts debe quedar inicializado tras la carga")
			}
		})
	}
}
