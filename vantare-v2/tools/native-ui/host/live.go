package main

import (
	"context"
	"errors"
	"fmt"
	"net"
	"net/http"
	"time"

	"github.com/vantare/overlays/v2/internal/app/telemetrytransport"
	"github.com/vantare/overlays/v2/internal/server"
	telemetrycore "github.com/vantare/overlays/v2/internal/telemetry/core"
	"github.com/vantare/overlays/v2/internal/telemetry/derive"
	"github.com/vantare/overlays/v2/internal/telemetry/drivers/lmu"
	overlayv2 "github.com/vantare/overlays/v2/internal/telemetry/projection/overlayv2"
)

// liveSink follows the same LMU -> batch -> reducer -> derive -> Overlay V2
// route as the fixture host. The driver serializes calls to WriteObservation.
type liveSink struct {
	driver    *lmu.Driver
	mapper    *lmu.BatchMapper
	reducer   *telemetrycore.Reducer
	pipeline  *derive.Pipeline
	projector *overlayv2.CachedProjector
	publisher *telemetrytransport.Publisher
	revision  uint64
}

func newLiveSink(driver *lmu.Driver, publisher *telemetrytransport.Publisher) *liveSink {
	return &liveSink{
		driver: driver, mapper: lmu.NewBatchMapper(), reducer: telemetrycore.NewReducer(),
		pipeline:  derive.NewPipeline(derive.Config{}),
		projector: overlayv2.NewCachedProjector(overlayv2.SectionCadence{}),
		publisher: publisher,
	}
}

func (sink *liveSink) WriteObservation(ctx context.Context, observation lmu.Observation) error {
	if observation.Compatibility != lmu.CompatibilityKnown {
		return fmt.Errorf("LMU build is not supported by the Go driver: %s", observation.Fingerprint)
	}
	err := sink.mapper.WriteObservation(ctx, observation, telemetrycore.BatchSinkFunc(func(ctx context.Context, batch telemetrycore.Batch) error {
		observed, err := sink.reducer.Apply(batch)
		if err != nil {
			return err
		}
		final, err := sink.pipeline.Apply(ctx, observed)
		if err != nil {
			return err
		}
		next := sink.revision + 1
		update, err := sink.projector.Project(final, overlayv2.SourceContextV2{State: sink.driver.RuntimeSnapshot().State.String()}, overlayv2.DefaultPreferencesV2(), next, time.Now().UTC())
		if err != nil {
			return err
		}
		if err := sink.publisher.PublishSnapshot(next, update); err != nil {
			return err
		}
		sink.revision = next
		if next == 1 && update.Frame != nil {
			fmt.Printf("native UI live Go projection: %d cars\n", len(update.Frame.Standings))
		}
		return nil
	}))
	if lmu.IsUnmappableFrame(err) {
		return nil
	}
	return err
}

func runLive(ctx context.Context, port uint) error {
	if port > 65535 {
		return errors.New("port must be between 0 and 65535")
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
	fmt.Printf("native UI live Go host: http://%s\n", listener.Addr())

	driverCtx, stopDriver := context.WithCancel(ctx)
	defer stopDriver()
	driver := lmu.New()
	driverDone := make(chan error, 1)
	go func() { driverDone <- driver.Run(driverCtx, newLiveSink(driver, publisher)) }()

	var result error
	driverFinished := false
	select {
	case <-ctx.Done():
	case err := <-driverDone:
		driverFinished = true
		if err != nil && !errors.Is(err, context.Canceled) {
			result = fmt.Errorf("read live LMU: %w", err)
		}
	case err := <-serveDone:
		if !errors.Is(err, http.ErrServerClosed) {
			result = fmt.Errorf("serve native UI live host: %w", err)
		}
	}
	stopDriver()
	if !driverFinished {
		if err := <-driverDone; err != nil && !errors.Is(err, context.Canceled) {
			result = errors.Join(result, fmt.Errorf("stop live LMU driver: %w", err))
		}
	}
	if err := stopHTTPServer(httpServer, 2*time.Second); err != nil {
		result = errors.Join(result, fmt.Errorf("stop native UI live host: %w", err))
	}
	return result
}
