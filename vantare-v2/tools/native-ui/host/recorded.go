package main

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"fmt"
	"net"
	"net/http"
	"os"
	"path/filepath"
	"time"

	"github.com/vantare/overlays/v2/internal/app/telemetrytransport"
	"github.com/vantare/overlays/v2/internal/server"
	"github.com/vantare/overlays/v2/internal/telemetry/drivers/lmu"
)

// These are three distinct, real LMU 1.4.0.0 frames already pinned by the
// driver's menu/track/pit sequence test. Replay changes only their delivery time.
const recordedInterval = 6 * time.Second

var recordedFrames = []struct {
	name   string
	digest string
}{
	{"lmu-1.4-pre-pit-track-fixture.bin", "eb79ec2a7806e217d4ef16dd2a93f3795b98234adbcb0dddba984651a5fd6fcc"},
	{"lmu-1.4-pit-fixture.bin", "262700e53e722b46e1b03940e13be83cf4aa73bf9f5ebdd8b9814b7161c9ede1"},
	{"lmu-1.4-outlap-fixture.bin", "c495da06882b2ab8addef5778151201e8b7daf46e8b5ca15f6f2c86a6715e4a6"},
}

func loadRecordedFrames(root string) ([]lmu.Observation, error) {
	observations := make([]lmu.Observation, 0, len(recordedFrames))
	for _, fixture := range recordedFrames {
		input, err := os.ReadFile(filepath.Join(root, fixture.name))
		if err != nil {
			return nil, fmt.Errorf("read sanitized LMU frame %s: %w", fixture.name, err)
		}
		digest := sha256.Sum256(input)
		if hex.EncodeToString(digest[:]) != fixture.digest {
			return nil, fmt.Errorf("sanitized LMU frame %s digest mismatch", fixture.name)
		}
		observation, err := lmu.ParseWithBuild(input, time.Now().UTC(), lmu.BuildEvidence{
			FileVersion: "1.4.0.0", ProductVersion: "1.4.0.0",
		})
		if err != nil {
			return nil, fmt.Errorf("parse sanitized LMU frame %s: %w", fixture.name, err)
		}
		if observation.Compatibility != lmu.CompatibilityKnown {
			return nil, fmt.Errorf("sanitized LMU frame %s is not compatible", fixture.name)
		}
		observations = append(observations, observation)
	}
	return observations, nil
}

func runRecorded(ctx context.Context, root string, port uint, interval time.Duration, cycles int) error {
	if interval <= 0 {
		return fmt.Errorf("recorded interval must be positive")
	}
	if cycles <= 0 {
		return fmt.Errorf("recorded cycles must be positive")
	}
	if port > 65535 {
		return errors.New("port must be between 0 and 65535")
	}
	observations, err := loadRecordedFrames(root)
	if err != nil {
		return err
	}
	registry, err := telemetrytransport.NewPublisherRegistry(telemetrytransport.PublisherConfig{Product: telemetrytransport.ProductOverlayV2})
	if err != nil {
		return fmt.Errorf("create Overlay V2 publisher: %w", err)
	}
	publisher, release, err := registry.RegisterConsumer(telemetrytransport.ProductOverlayV2)
	if err != nil {
		return fmt.Errorf("retain Overlay V2 publisher: %w", err)
	}
	defer release()
	listener, err := net.Listen("tcp", fmt.Sprintf("127.0.0.1:%d", port))
	if err != nil {
		return fmt.Errorf("listen on loopback: %w", err)
	}
	defer listener.Close()
	httpServer := &http.Server{Handler: server.New(server.ServerConfig{OverlayV2Publishers: registry}).Handler()}
	serveDone := make(chan error, 1)
	go func() { serveDone <- httpServer.Serve(listener) }()
	fmt.Printf("native UI recorded Go host: http://%s\n", listener.Addr())

	sink := newLiveSink(lmu.New(), publisher)
	fusion := new(lmu.Fusion)
	var result error
	for index := 0; index < len(observations)*cycles; index++ {
		if index > 0 {
			select {
			case <-ctx.Done():
			case <-time.After(interval):
			}
		}
		if ctx.Err() != nil {
			break
		}
		frame := index % len(observations)
		if err := sink.WriteObservation(ctx, fusion.Merge(time.Now().UTC(), time.Duration(index)*interval, observations[frame])); err != nil {
			result = fmt.Errorf("publish recorded LMU frame %s: %w", recordedFrames[frame].name, err)
			break
		}
		if cycles == 1 || (index+1)%100 == 0 {
			fmt.Printf("native UI recorded Go snapshot %d/%d\n", index+1, len(observations)*cycles)
		}
	}
	if result == nil && ctx.Err() == nil {
		select {
		case <-ctx.Done():
		case err := <-serveDone:
			if !errors.Is(err, http.ErrServerClosed) {
				result = fmt.Errorf("serve native UI recorded host: %w", err)
			}
		}
	}
	if err := stopHTTPServer(httpServer, 2*time.Second); err != nil {
		result = errors.Join(result, fmt.Errorf("stop native UI recorded host: %w", err))
	}
	return result
}
