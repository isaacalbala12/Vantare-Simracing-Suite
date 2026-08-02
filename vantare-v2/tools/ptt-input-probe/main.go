package main

import (
	"context"
	"errors"
	"flag"
	"fmt"
	"os"
	"time"

	"github.com/vantare/overlays/v2/internal/engineer/ptt"
)

func main() {
	kind := flag.String("kind", string(ptt.DeviceKeyboard), "keyboard, gamepad or hid")
	device := flag.String("device", "keyboard-0", "keyboard-0, xinput-N or joy-N")
	control := flag.String("control", "f24", "canonical control name")
	scope := flag.String("scope", string(ptt.ScopeGlobal), "global or local")
	duration := flag.Duration("duration", 2*time.Second, "probe duration")
	window := flag.Uint64("window", 0, "target Windows HWND for local scope")
	flag.Parse()

	binding := ptt.Binding{
		DeviceKind: ptt.DeviceKind(*kind),
		DeviceID:   *device,
		Control:    *control,
		Scope:      ptt.BindingScope(*scope),
	}
	reader := ptt.NewPlatformReader(uintptr(*window))
	ctx, cancel := context.WithTimeout(context.Background(), *duration)
	defer cancel()

	ticker := time.NewTicker(ptt.DefaultPollInterval)
	defer ticker.Stop()
	var previous ptt.DeviceSample
	initialized := false
	for {
		sample, err := reader.Read(ctx, binding)
		if err != nil {
			if errors.Is(err, context.Canceled) || errors.Is(err, context.DeadlineExceeded) {
				return
			}
			fmt.Fprintf(os.Stderr, "PTT probe failed: %v\n", err)
			os.Exit(1)
		}
		if !initialized || sample != previous {
			fmt.Printf("connected=%t pressed=%t focused=%t\n", sample.Connected, sample.Pressed, sample.Focused)
			previous = sample
			initialized = true
		}
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
		}
	}
}
