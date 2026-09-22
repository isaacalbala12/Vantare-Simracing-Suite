package main

import (
	"embed"
	"fmt"
	"log"
	"os"
	"strings"
	"sync/atomic"
	"time"

	"github.com/wailsapp/wails/v3/pkg/application"
)

//go:embed assets
var assets embed.FS

const frameCount = 120

func main() {
	app := application.New(application.Options{
		Name:   "Vantare Streams Spike",
		Assets: application.AssetOptions{Handler: application.BundledAssetFileServer(assets)},
		Mac:    application.MacOptions{ApplicationShouldTerminateAfterLastWindowClosed: true},
	})
	var passed atomic.Bool
	app.HandleStream("overlay-probe", func(conn *application.StreamConn) {
		defer conn.Close()
		if conn.Window() == nil {
			log.Print("FAIL: stream is not bound to a window")
			app.Quit()
			return
		}
		payload := strings.Repeat("x", 64*1024)
		for sequence := 1; sequence <= frameCount; sequence++ {
			var request struct {
				Ack int `json:"ack"`
			}
			if err := conn.ReceiveJSON(&request); err != nil {
				log.Printf("FAIL: receive acknowledgement %d: %v", sequence-1, err)
				app.Quit()
				return
			}
			if request.Ack != sequence-1 {
				log.Printf("FAIL: acknowledgement %d, expected %d", request.Ack, sequence-1)
				app.Quit()
				return
			}
			if err := conn.SendJSON(map[string]any{"sequence": sequence, "payload": payload}); err != nil {
				log.Printf("FAIL: send frame %d: %v", sequence, err)
				app.Quit()
				return
			}
		}
		var final struct {
			Ack int `json:"ack"`
		}
		if err := conn.ReceiveJSON(&final); err != nil || final.Ack != frameCount {
			log.Printf("FAIL: final acknowledgement %d: %v", final.Ack, err)
			app.Quit()
			return
		}
		passed.Store(true)
		log.Printf("PASS: %d frames of %d bytes, ordered with one frame per acknowledgement", frameCount, len(payload))
		app.Quit()
	})
	app.Window.NewWithOptions(application.WebviewWindowOptions{Title: "Vantare Streams Spike", Width: 480, Height: 240, URL: "/"})
	timer := time.AfterFunc(30*time.Second, func() { log.Print("FAIL: timeout"); app.Quit() })
	defer timer.Stop()
	if err := app.Run(); err != nil {
		log.Fatal(err)
	}
	if !passed.Load() {
		fmt.Fprintln(os.Stderr, "Streams spike failed")
		os.Exit(1)
	}
}
