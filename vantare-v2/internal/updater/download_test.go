package updater

import (
	"context"
	"fmt"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"testing"
	"time"
)

// trickleServer sends size bytes in chunks, pausing between them, announcing
// the full length up front like GitHub does.
func trickleServer(size, chunk int, pause time.Duration) *httptest.Server {
	payload := make([]byte, chunk)
	return httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Length", fmt.Sprint(size))
		w.WriteHeader(http.StatusOK)
		flusher, _ := w.(http.Flusher)
		for sent := 0; sent < size; {
			n := chunk
			if size-sent < n {
				n = size - sent
			}
			if _, err := w.Write(payload[:n]); err != nil {
				return
			}
			if flusher != nil {
				flusher.Flush()
			}
			sent += n
			time.Sleep(pause)
		}
	}))
}

// El instalador real de la ultima nightly. El tope de 30 s que compartia con la
// API exigia sostener ~375 KB/s de principio a fin para poder actualizar.
const realInstallerSize = 11_258_041

func TestDownloadClientHasNoTotalDeadline(t *testing.T) {
	u := newTestUpdater(t, "v0.1.0.7")

	if u.downloadClient.Timeout != 0 {
		t.Fatalf(
			"el cliente de descarga tiene un tope total de %s: eso es una apuesta sobre el ancho de banda del usuario, no un timeout",
			u.downloadClient.Timeout,
		)
	}
	transport, ok := u.downloadClient.Transport.(*http.Transport)
	if !ok {
		t.Fatalf("el cliente de descarga necesita su propio transporte, no %T", u.downloadClient.Transport)
	}
	if transport.ResponseHeaderTimeout == 0 {
		t.Fatal("sin ResponseHeaderTimeout, un servidor muerto deja la descarga esperando para siempre")
	}
	if u.httpClient.Timeout == 0 {
		t.Fatal("el cliente de la API si debe tener tope total: solo mueve kilobytes")
	}
}

func TestDownloadSurvivesALineSlowerThanTheOldDeadline(t *testing.T) {
	// 64 KiB cada 20 ms sobre 2 MiB: mas de 600 ms de cuerpo. Con el tope total
	// anterior escalado al instalador real, esta misma proporcion moria; aqui
	// debe terminar entera.
	server := trickleServer(2<<20, 64<<10, 20*time.Millisecond)
	defer server.Close()

	u := newTestUpdater(t, "v0.1.0.7")
	dest := filepath.Join(t.TempDir(), "vantare-installer.exe")
	percent := 0
	if err := u.downloadFile(context.Background(), server.URL, dest, func(p int) { percent = p }); err != nil {
		t.Fatalf("descarga lenta fallo: %v", err)
	}

	info, err := os.Stat(dest)
	if err != nil {
		t.Fatalf("stat: %v", err)
	}
	if info.Size() != 2<<20 {
		t.Fatalf("descargados %d bytes, esperados %d", info.Size(), 2<<20)
	}
	if percent != 100 {
		t.Fatalf("progreso final %d%%, esperado 100%%", percent)
	}
}

func TestDownloadGivesUpWhenTheServerStopsSending(t *testing.T) {
	previous := downloadStallTimeout
	downloadStallTimeout = 150 * time.Millisecond
	defer func() { downloadStallTimeout = previous }()

	released := make(chan struct{})
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Length", fmt.Sprint(realInstallerSize))
		w.WriteHeader(http.StatusOK)
		if flusher, ok := w.(http.Flusher); ok {
			_, _ = w.Write(make([]byte, 1024))
			flusher.Flush()
		}
		// Cuelga sin mandar el resto: la conexion sigue viva y muda.
		<-released
	}))
	// El orden importa: `Close` espera a que el handler vuelva, asi que hay que
	// soltarlo primero. Los `defer` corren al reves de como se declaran.
	defer server.Close()
	defer close(released)

	u := newTestUpdater(t, "v0.1.0.7")
	dest := filepath.Join(t.TempDir(), "vantare-installer.exe")
	start := time.Now()
	err := u.downloadFile(context.Background(), server.URL, dest, nil)
	if err == nil {
		t.Fatal("una descarga que dejo de recibir bytes debe fallar, no esperar indefinidamente")
	}
	if elapsed := time.Since(start); elapsed > 5*time.Second {
		t.Fatalf("tardo %s en rendirse; el guardian de inactividad no esta actuando", elapsed)
	}
	if _, statErr := os.Stat(dest); !os.IsNotExist(statErr) {
		t.Fatal("el fichero a medias debe borrarse al fallar la descarga")
	}
}

func TestDownloadStallTimerRestartsWithEveryChunk(t *testing.T) {
	previous := downloadStallTimeout
	// Mas corto que la descarga entera pero mas largo que la pausa entre
	// trozos: solo termina si cada trozo rearma el guardian.
	downloadStallTimeout = 200 * time.Millisecond
	defer func() { downloadStallTimeout = previous }()

	server := trickleServer(512<<10, 32<<10, 50*time.Millisecond)
	defer server.Close()

	u := newTestUpdater(t, "v0.1.0.7")
	dest := filepath.Join(t.TempDir(), "vantare-installer.exe")
	start := time.Now()
	if err := u.downloadFile(context.Background(), server.URL, dest, nil); err != nil {
		t.Fatalf("descarga con pausas cortas fallo: %v", err)
	}
	if elapsed := time.Since(start); elapsed < downloadStallTimeout {
		t.Fatalf("la descarga duro %s, menos que el propio guardian: la prueba no demuestra nada", elapsed)
	}
}
