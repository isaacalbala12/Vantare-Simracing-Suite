//go:build windows

package main

import (
	"embed"
	"flag"
	"io/fs"
	"log"
	"net/url"
	"time"

	"github.com/wailsapp/wails/v3/pkg/application"
)

//go:embed assets/dist/*
var assets embed.FS

func main() {
	mode := flag.String("mode", "control", "control or overlay")
	showGap := flag.Bool("show-gap", true, "show the interval column")
	autoClose := flag.Duration("auto-close", 0, "close automatically after this duration")
	flag.Parse()

	if *mode != "control" && *mode != "overlay" {
		log.Fatalf("unsupported mode %q", *mode)
	}
	public, err := fs.Sub(assets, "assets/dist")
	if err != nil {
		log.Fatal(err)
	}
	app := application.New(application.Options{
		Name:   "Vantare UI native bakeoff · Wails reference",
		Assets: application.AssetOptions{Handler: application.BundledAssetFileServer(public)},
	})
	query := url.Values{"mode": {*mode}, "showGap": {boolText(*showGap)}}
	options := application.WebviewWindowOptions{
		Title:  "Vantare Bakeoff · Wails Control",
		Width:  720,
		Height: 650,
		URL:    "/?" + query.Encode(),
	}
	if *mode == "overlay" {
		options.Title = "Vantare Bakeoff · Wails Overlay"
		options.Width = 560
		options.Height = 430
		options.Frameless = true
		options.AlwaysOnTop = true
		options.IgnoreMouseEvents = true
		options.BackgroundType = application.BackgroundTypeTransparent
		options.BackgroundColour = application.NewRGBA(0, 0, 0, 0)
	}
	window := app.Window.NewWithOptions(options)
	if *autoClose > 0 {
		time.AfterFunc(*autoClose, func() { window.Close() })
	}
	if err := app.Run(); err != nil {
		log.Fatal(err)
	}
}

func boolText(value bool) string {
	if value {
		return "1"
	}
	return "0"
}
