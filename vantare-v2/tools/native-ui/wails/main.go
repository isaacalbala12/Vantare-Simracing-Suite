//go:build windows

// Wails baseline for VAN-776. The Go telemetry host remains a separate process.
package main

import (
	"context"
	"embed"
	"encoding/json"
	"errors"
	"flag"
	"fmt"
	"io/fs"
	"log"
	"net"
	"net/http"
	"net/http/httputil"
	"net/url"
	"os"
	"sync/atomic"
	"time"

	"github.com/wailsapp/wails/v3/pkg/application"
)

const projectionRoute = "/telemetry/overlay-v2/projection"

var errInvalidEndpoint = errors.New("endpoint must be a loopback Overlay V2 projection URL")

//go:embed assets
var assets embed.FS

func loopbackEndpoint(value string) (*url.URL, error) {
	parsed, err := url.Parse(value)
	if err != nil {
		return nil, err
	}
	if parsed.Scheme != "http" || parsed.Path != projectionRoute || parsed.RawQuery != "" || parsed.Fragment != "" {
		return nil, errInvalidEndpoint
	}
	host := net.ParseIP(parsed.Hostname())
	if host == nil || !host.IsLoopback() || parsed.Port() == "" {
		return nil, errInvalidEndpoint
	}
	return parsed, nil
}

func main() {
	endpointFlag := flag.String("endpoint", "", "loopback Overlay V2 SSE endpoint")
	mode := flag.String("mode", "control", "control, editor or overlay")
	autoClose := flag.Duration("auto-close", 0, "close automatically after this duration")
	expectRows := flag.Int("expect-rows", 0, "require this many Go standings rows before closing")
	debugPort := flag.Uint("debug-port", 0, "optional loopback CDP port for visual trial inspection")
	flag.Parse()

	endpoint, err := loopbackEndpoint(*endpointFlag)
	if err != nil {
		log.Fatalf("invalid --endpoint: %v", err)
	}
	if *mode != "control" && *mode != "editor" && *mode != "overlay" {
		log.Fatalf("unsupported mode %q", *mode)
	}
	if *debugPort > 65535 {
		log.Fatal("debug port must be between 0 and 65535")
	}
	public, err := fs.Sub(assets, "assets/dist")
	if err != nil {
		log.Fatalf("build Wails trial frontend before launch: %v", err)
	}
	target := &url.URL{Scheme: endpoint.Scheme, Host: endpoint.Host}
	proxy := httputil.NewSingleHostReverseProxy(target)
	proxy.FlushInterval = -1
	mux := http.NewServeMux()
	mux.HandleFunc(projectionRoute, func(writer http.ResponseWriter, request *http.Request) {
		log.Printf("projection request: %s", request.URL)
		proxy.ServeHTTP(writer, request)
	})
	ready := make(chan int, 1)
	mux.HandleFunc("/native-trial/ready", func(writer http.ResponseWriter, request *http.Request) {
		log.Printf("ready request: %s", request.Method)
		if request.Method != http.MethodPost {
			http.Error(writer, "POST required", http.StatusMethodNotAllowed)
			return
		}
		var report struct {
			Rows int `json:"rows"`
		}
		if err := json.NewDecoder(http.MaxBytesReader(writer, request.Body, 1024)).Decode(&report); err != nil {
			http.Error(writer, "invalid report", http.StatusBadRequest)
			return
		}
		select {
		case ready <- report.Rows:
		default:
		}
		writer.WriteHeader(http.StatusNoContent)
	})
	mux.Handle("/", http.FileServer(http.FS(public)))
	listener, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		log.Fatal(err)
	}
	webServer := &http.Server{Handler: mux}
	go func() {
		if err := webServer.Serve(listener); err != nil && !errors.Is(err, http.ErrServerClosed) {
			log.Printf("Wails trial HTTP server: %v", err)
		}
	}()
	defer func() {
		ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
		defer cancel()
		if err := webServer.Shutdown(ctx); err != nil {
			log.Printf("stop Wails trial HTTP server: %v", err)
		}
	}()
	baseURL := "http://" + listener.Addr().String()
	appOptions := application.Options{
		Name: "Vantare Native Go Trial Wails Baseline",
	}
	if *debugPort > 0 {
		appOptions.Windows.AdditionalBrowserArgs = []string{
			"--remote-debugging-address=127.0.0.1",
			fmt.Sprintf("--remote-debugging-port=%d", *debugPort),
		}
	}
	app := application.New(appOptions)
	options := application.WebviewWindowOptions{
		Title: "Vantare Native Trial Wails Control",
		Width: 1060, Height: 720, URL: baseURL + "/?mode=" + *mode,
	}
	if *expectRows > 0 {
		options.URL += "&expectRows=" + fmt.Sprint(*expectRows)
	}
	if *mode == "editor" {
		options.Title = "Vantare Native Trial Wails Editor"
		options.Width = 1280
	}
	if *mode == "overlay" {
		options.Title = "Vantare Native Trial Wails Overlay"
		options.Width, options.Height = 520, 500
		options.Frameless = true
		options.AlwaysOnTop = true
		options.IgnoreMouseEvents = true
		options.BackgroundType = application.BackgroundTypeTransparent
		options.BackgroundColour = application.NewRGBA(0, 0, 0, 0)
	}
	window := app.Window.NewWithOptions(options)
	var matched atomic.Bool
	if *expectRows > 0 {
		go func() {
			select {
			case rows := <-ready:
				matched.Store(rows == *expectRows)
			case <-time.After(10 * time.Second):
				log.Printf("timed out waiting for %d Go rows in WebView", *expectRows)
			}
			window.Close()
		}()
	}
	if *autoClose > 0 {
		time.AfterFunc(*autoClose, func() { window.Close() })
	}
	if err := app.Run(); err != nil {
		log.Fatal(err)
	}
	if *expectRows > 0 && !matched.Load() {
		log.Printf("WebView did not render %d Go rows", *expectRows)
		os.Exit(6)
	}
}
