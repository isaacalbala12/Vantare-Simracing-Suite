// The native UI host is an isolated probe. It never starts Wails.
package main

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"flag"
	"fmt"
	"log"
	"net"
	"net/http"
	"os"
	"os/signal"
	"time"

	"github.com/vantare/overlays/v2/internal/app/telemetrytransport"
	"github.com/vantare/overlays/v2/internal/server"
	telemetrycore "github.com/vantare/overlays/v2/internal/telemetry/core"
	"github.com/vantare/overlays/v2/internal/telemetry/derive"
	"github.com/vantare/overlays/v2/internal/telemetry/drivers/lmu"
	overlayv2 "github.com/vantare/overlays/v2/internal/telemetry/projection/overlayv2"
	"github.com/vantare/overlays/v2/internal/telemetry/schema/envelope"
)

const fixtureSHA256 = "959c51421529c6157371678d8db9bcbbdc8ab3780bd5557828f2bc0d2225e5ff"

func buildUpdate(ctx context.Context, fixturePath string) (overlayv2.UpdateV2, error) {
	input, err := os.ReadFile(fixturePath)
	if err != nil {
		return overlayv2.UpdateV2{}, fmt.Errorf("read sanitized LMU capture: %w", err)
	}
	digest := sha256.Sum256(input)
	if hex.EncodeToString(digest[:]) != fixtureSHA256 {
		return overlayv2.UpdateV2{}, errors.New("sanitized LMU capture digest does not match the pinned fixture")
	}
	observation, err := lmu.ParseWithBuild(input, time.Now().UTC(), lmu.BuildEvidence{FileVersion: "1.3.0"})
	if err != nil {
		return overlayv2.UpdateV2{}, fmt.Errorf("parse sanitized LMU capture: %w", err)
	}
	if observation.Compatibility != lmu.CompatibilityKnown {
		return overlayv2.UpdateV2{}, errors.New("sanitized LMU capture has no supported build evidence")
	}
	fused := new(lmu.Fusion).Merge(observation.ReceivedUTC, 0, observation)
	reducer := telemetrycore.NewReducer()
	pipeline := derive.NewPipeline(derive.Config{})
	var final envelope.Snapshot[derive.FinalState]
	mapper := lmu.NewBatchMapper()
	err = mapper.WriteObservation(ctx, fused, telemetrycore.BatchSinkFunc(func(ctx context.Context, batch telemetrycore.Batch) error {
		observed, applyErr := reducer.Apply(batch)
		if applyErr != nil {
			return applyErr
		}
		final, applyErr = pipeline.Apply(ctx, observed)
		return applyErr
	}))
	if err != nil {
		return overlayv2.UpdateV2{}, fmt.Errorf("reduce sanitized LMU capture: %w", err)
	}
	projector := overlayv2.NewCachedProjector(overlayv2.SectionCadence{})
	update, err := projector.Project(final, overlayv2.SourceContextV2{State: "live"}, overlayv2.DefaultPreferencesV2(), 1, time.Now().UTC())
	if err != nil {
		return overlayv2.UpdateV2{}, fmt.Errorf("project Overlay V2: %w", err)
	}
	return update, nil
}

func run(ctx context.Context, fixturePath string, port uint) error {
	if port > 65535 {
		return errors.New("port must be between 0 and 65535")
	}
	update, err := buildUpdate(ctx, fixturePath)
	if err != nil {
		return err
	}
	handler, release, err := newHandler(update)
	if err != nil {
		return err
	}
	defer release()
	listener, err := net.Listen("tcp", fmt.Sprintf("127.0.0.1:%d", port))
	if err != nil {
		return fmt.Errorf("listen on loopback: %w", err)
	}
	defer listener.Close()
	httpServer := &http.Server{Handler: handler}
	done := make(chan error, 1)
	go func() { done <- httpServer.Serve(listener) }()
	fmt.Printf("native UI Go host: http://%s\n", listener.Addr())
	select {
	case <-ctx.Done():
		if err := stopHTTPServer(httpServer, 2*time.Second); err != nil {
			return fmt.Errorf("stop native UI Go host: %w", err)
		}
		return nil
	case err := <-done:
		if errors.Is(err, http.ErrServerClosed) {
			return nil
		}
		return fmt.Errorf("serve native UI Go host: %w", err)
	}
}

func stopHTTPServer(server *http.Server, timeout time.Duration) error {
	shutdownCtx, cancel := context.WithTimeout(context.Background(), timeout)
	defer cancel()
	err := server.Shutdown(shutdownCtx)
	if errors.Is(err, context.DeadlineExceeded) {
		return server.Close()
	}
	return err
}

func newHandler(update overlayv2.UpdateV2) (http.Handler, func(), error) {
	registry, err := telemetrytransport.NewPublisherRegistry(telemetrytransport.PublisherConfig{Product: telemetrytransport.ProductOverlayV2})
	if err != nil {
		return nil, nil, fmt.Errorf("create Overlay V2 publisher: %w", err)
	}
	publisher, release, err := registry.RegisterConsumer(telemetrytransport.ProductOverlayV2)
	if err != nil {
		return nil, nil, fmt.Errorf("retain Overlay V2 publisher: %w", err)
	}
	if err := publisher.PublishSnapshot(1, update); err != nil {
		release()
		return nil, nil, fmt.Errorf("publish Overlay V2 snapshot: %w", err)
	}
	return server.New(server.ServerConfig{OverlayV2Publishers: registry}).Handler(), release, nil
}

func main() {
	fixturePath := flag.String("fixture", "testdata/lmu-fixture.bin", "path to the pinned sanitized LMU capture")
	live := flag.Bool("live", false, "read the active LMU session through the production Go driver")
	port := flag.Uint("port", 0, "loopback port; 0 assigns an available port")
	flag.Parse()
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt)
	defer stop()
	var err error
	if *live {
		err = runLive(ctx, *port)
	} else {
		err = run(ctx, *fixturePath, *port)
	}
	if err != nil {
		log.Fatal(err)
	}
}
