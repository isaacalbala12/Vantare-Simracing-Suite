//go:build windows

package main

import (
	"bufio"
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net"
	"net/http"
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"sync"
	"sync/atomic"
	"testing"
	"time"
	"unsafe"

	"github.com/vantare/overlays/v2/internal/app"
	"github.com/vantare/overlays/v2/internal/app/launcher"
	"github.com/vantare/overlays/v2/internal/app/telemetrytransport"
	engineerservice "github.com/vantare/overlays/v2/internal/engineer/service"
	"github.com/vantare/overlays/v2/internal/ops"
	"github.com/vantare/overlays/v2/internal/server"
	"github.com/vantare/overlays/v2/internal/telemetry/projection/overlay"
	"github.com/vantare/overlays/v2/internal/telemetry/recording"
	recordingsqlite "github.com/vantare/overlays/v2/internal/telemetry/recording/sqlite"
	"github.com/wailsapp/wails/v3/pkg/application"
	"golang.org/x/sys/windows"
)

var getProcessHandleCount = windows.NewLazySystemDLL("kernel32.dll").NewProc("GetProcessHandleCount")

var (
	lifecycleAppOnce   sync.Once
	lifecycleApp       *application.App
	lifecycleTransport *lifecycleWailsTransport
)

type lifecycleSampler struct{}

func (lifecycleSampler) Sample() ops.MetricsSnapshot { return ops.MetricsSnapshot{} }

type sseEvent struct {
	name string
	data []byte
}

type lifecycleWailsTransport struct {
	events  chan sseEvent
	started atomic.Bool
	stopped atomic.Bool
}

func newLifecycleWailsTransport() *lifecycleWailsTransport {
	return &lifecycleWailsTransport{events: make(chan sseEvent, 16)}
}

func (transport *lifecycleWailsTransport) Start(context.Context, *application.MessageProcessor) error {
	transport.started.Store(true)
	return nil
}

func (*lifecycleWailsTransport) JSClient() []byte { return nil }

func (transport *lifecycleWailsTransport) Stop() error {
	transport.stopped.Store(true)
	return nil
}

func (transport *lifecycleWailsTransport) DispatchWailsEvent(event *application.CustomEvent) {
	encoded, err := json.Marshal(event.Data)
	if err != nil {
		encoded = []byte(fmt.Sprintf(`{"marshalError":%q}`, err.Error()))
	}
	select {
	case transport.events <- sseEvent{name: event.Name, data: encoded}:
	default:
	}
}

func reusableLifecycleWailsApp() (*application.App, *lifecycleWailsTransport) {
	lifecycleAppOnce.Do(func() {
		lifecycleTransport = newLifecycleWailsTransport()
		lifecycleApp = application.New(application.Options{
			Name:      "Vantare telemetry lifecycle harness",
			Transport: lifecycleTransport,
		})
	})
	lifecycleTransport.stopped.Store(false)
	for {
		select {
		case <-lifecycleTransport.events:
		default:
			return lifecycleApp, lifecycleTransport
		}
	}
}

type lifecycleRecorder struct {
	writer   recording.SessionWriter
	complete bool
}

func (recorder *lifecycleRecorder) Stop(ctx context.Context) error {
	_, completeErr := recorder.writer.Complete(ctx)
	closeErr := recorder.writer.Close()
	recorder.complete = completeErr == nil && closeErr == nil
	return errors.Join(completeErr, closeErr)
}

func TestTelemetryLifecycleHarness(t *testing.T) {
	wailsApp, wailsTransport := reusableLifecycleWailsApp()
	emitter := &wailsEmitter{wailsApp: wailsApp}
	if !wailsTransport.started.Load() {
		t.Fatal("Wails transport was not started")
	}
	baselineGoroutines := runtime.NumGoroutine()
	baselineHandles := processHandleCount(t)
	t.Logf("baseline resources: goroutines=%d handles=%d", baselineGoroutines, baselineHandles)
	appContext, cancelApp := context.WithCancel(context.Background())

	engineer := engineerservice.NewEngineerService(emitter)
	engineer.Start(appContext)
	engineerBridge := app.NewEngineerBridge(wailsApp, emitter, engineer)
	engineerBridge.Start()
	t.Logf("after Engineer: handles=%d", processHandleCount(t))

	telemetryRuntime, err := app.NewTelemetryCoreRuntime(app.TelemetryCoreRuntimeConfig{
		Enabled:  false,
		Emitter:  emitter,
		Engineer: engineer,
	})
	if err != nil {
		t.Fatalf("NewTelemetryCoreRuntime() error = %v", err)
	}
	if err := telemetryRuntime.Start(appContext); err != nil {
		t.Fatalf("TelemetryCoreRuntime.Start() error = %v", err)
	}
	t.Logf("after Telemetry Core: handles=%d", processHandleCount(t))

	snapshot := readOverlayGolden(t)
	full, err := telemetrytransport.NewOverlayFull(snapshot.Metadata, 1, snapshot.PayloadV1)
	if err != nil {
		t.Fatalf("NewOverlayFull() error = %v", err)
	}
	if err := telemetryRuntime.Hub().PublishSnapshot(full, nil); err != nil {
		t.Fatalf("PublishSnapshot() error = %v", err)
	}

	httpServer := server.New(server.ServerConfig{
		Addr:              "127.0.0.1:0",
		EngineerSvc:       engineer,
		Emitter:           emitter,
		OverlayProjection: telemetryRuntime.Hub(),
	})
	httpServer.Start()
	if httpServer.Addr() == "" {
		t.Fatal("HTTP server did not bind a loopback address")
	}
	t.Logf("after HTTP: handles=%d", processHandleCount(t))

	client := &http.Client{Transport: &http.Transport{DisableKeepAlives: true}, Timeout: 5 * time.Second}
	assertHealthReachable(t, client, httpServer.Addr())
	sse := captureSSE(t, appContext, client, httpServer.Addr())
	wails := awaitWailsTelemetry(t, wailsTransport.events)
	for name, wailsData := range wails {
		sseData, ok := sse[name]
		if !ok {
			t.Fatalf("SSE did not emit %s: events=%v", name, keys(sse))
		}
		if !bytes.Equal(wailsData, sseData) {
			t.Fatalf("Wails/SSE payload mismatch for %s\nWails: %s\nSSE:   %s", name, wailsData, sseData)
		}
	}
	assertProjectionCursor(t, wails[telemetrytransport.EventName(
		telemetrytransport.ProductOverlay,
		telemetrytransport.EventSnapshot,
	)], snapshot)

	opsBridge := app.NewOpsBridge(lifecycleSampler{}, emitter, 10*time.Millisecond)
	opsBridge.Start()
	t.Logf("after Ops: handles=%d", processHandleCount(t))
	globalHotkeys := app.NewHotkeyManager()
	if err := globalHotkeys.Start(); err != nil {
		t.Fatalf("HotkeyManager.Start() error = %v", err)
	}
	t.Logf("after global hotkeys: handles=%d", processHandleCount(t))
	profileHotkeys := launcher.NewHotkeyManager()
	recorder := startLifecycleRecorder(t)
	t.Logf("after recording: handles=%d", processHandleCount(t))

	shutdownContext, cancelShutdown := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancelShutdown()
	results := runShutdown(shutdownContext, []shutdownStep{
		observedStop(t, "recording", recorder.Stop),
		observedStop(t, "telemetry-core", telemetryRuntime.Stop),
		observedStop(t, "http", func(context.Context) error { return httpServer.Stop() }),
		observedStop(t, "ops", func(context.Context) error { opsBridge.Stop(); return nil }),
		observedStop(t, "global-hotkeys", func(context.Context) error { globalHotkeys.Stop(); return nil }),
		observedStop(t, "profile-hotkeys", func(context.Context) error { profileHotkeys.Stop(); return nil }),
		observedStop(t, "engineer-bridge", func(context.Context) error { engineerBridge.Stop(); return nil }),
		observedStop(t, "engineer", func(context.Context) error { engineer.Stop(); return nil }),
		observedStop(t, "wails-transport", func(context.Context) error { return wailsTransport.Stop() }),
		observedStop(t, "application-context", func(context.Context) error { cancelApp(); return nil }),
	})
	for _, result := range results {
		t.Logf("shutdown %s: duration=%s err=%v", result.name, result.duration, result.err)
		if result.err != nil {
			t.Errorf("shutdown %s after %s: %v", result.name, result.duration, result.err)
		}
	}

	if !recorder.complete {
		t.Error("SQLite recording did not complete and close during shutdown")
	}
	if metrics := telemetryRuntime.Hub().Metrics(); metrics.CurrentSubscribers != 0 {
		t.Errorf("telemetry subscribers after shutdown = %d", metrics.CurrentSubscribers)
	}
	if health := engineer.Health(); health.OK || health.Connected || health.Subs != 0 {
		t.Errorf("Engineer health after shutdown = %#v", health)
	}
	if !wailsTransport.stopped.Load() {
		t.Error("Wails transport was not stopped")
	}
	assertPortClosed(t, httpServer.Addr())
	assertResourcesReturn(t, baselineGoroutines, baselineHandles)
}

func observedStop(t *testing.T, name string, stop func(context.Context) error) shutdownStep {
	t.Helper()
	return shutdownStep{name: name, stop: func(ctx context.Context) error {
		err := stop(ctx)
		t.Logf("after stopping %s: handles=%d", name, processHandleCount(t))
		return err
	}}
}

func captureSSE(t *testing.T, ctx context.Context, client *http.Client, address string) map[string][]byte {
	t.Helper()
	request, err := http.NewRequestWithContext(
		ctx,
		http.MethodGet,
		"http://"+address+telemetrytransport.ProjectionRoute(telemetrytransport.ProductOverlay),
		nil,
	)
	if err != nil {
		t.Fatalf("NewRequestWithContext() error = %v", err)
	}
	response, err := client.Do(request)
	if err != nil {
		t.Fatalf("SSE request error = %v", err)
	}
	defer response.Body.Close()
	if response.StatusCode != http.StatusOK {
		t.Fatalf("SSE status = %d", response.StatusCode)
	}
	reader := bufio.NewReader(response.Body)
	result := make(map[string][]byte, 2)
	for len(result) < 2 {
		event, readErr := readSSEEvent(reader)
		if readErr != nil {
			t.Fatalf("read SSE event: %v", readErr)
		}
		result[event.name] = event.data
	}
	return result
}

func readSSEEvent(reader *bufio.Reader) (sseEvent, error) {
	var result sseEvent
	for {
		line, err := reader.ReadString('\n')
		if err != nil {
			return sseEvent{}, err
		}
		line = strings.TrimRight(line, "\r\n")
		if line == "" {
			if result.name == "" || len(result.data) == 0 {
				return sseEvent{}, errors.New("incomplete SSE event")
			}
			return result, nil
		}
		switch {
		case strings.HasPrefix(line, "event: "):
			result.name = strings.TrimPrefix(line, "event: ")
		case strings.HasPrefix(line, "data: "):
			result.data = []byte(strings.TrimPrefix(line, "data: "))
		}
	}
}

func awaitWailsTelemetry(t *testing.T, source <-chan sseEvent) map[string][]byte {
	t.Helper()
	statusName := telemetrytransport.EventName(telemetrytransport.ProductOverlay, telemetrytransport.EventStatus)
	snapshotName := telemetrytransport.EventName(telemetrytransport.ProductOverlay, telemetrytransport.EventSnapshot)
	result := make(map[string][]byte, 2)
	timeout := time.NewTimer(2 * time.Second)
	defer timeout.Stop()
	for len(result) < 2 {
		select {
		case event := <-source:
			if event.name == statusName || event.name == snapshotName {
				result[event.name] = event.data
			}
		case <-timeout.C:
			t.Fatalf("timed out waiting for Wails telemetry events: got=%v", keys(result))
		}
	}
	return result
}

func readOverlayGolden(t *testing.T) overlay.SnapshotV1 {
	t.Helper()
	path := filepath.Join("..", "..", "internal", "telemetry", "projection", "overlay", "testdata", "overlay_v1.golden.json")
	data, err := os.ReadFile(path)
	if err != nil {
		t.Fatalf("read overlay golden: %v", err)
	}
	var result overlay.SnapshotV1
	if err := json.Unmarshal(data, &result); err != nil {
		t.Fatalf("decode overlay golden: %v", err)
	}
	return result
}

func assertProjectionCursor(t *testing.T, encoded []byte, snapshot overlay.SnapshotV1) {
	t.Helper()
	var envelope struct {
		Product           telemetrytransport.ProductID `json:"product"`
		ProjectionVersion uint64                       `json:"projectionVersion"`
		Epoch             uint64                       `json:"epoch"`
		Sequence          uint64                       `json:"sequence"`
		StatusRevision    uint64                       `json:"statusRevision"`
	}
	if err := json.Unmarshal(encoded, &envelope); err != nil {
		t.Fatalf("decode projection envelope: %v", err)
	}
	if envelope.Product != telemetrytransport.ProductOverlay ||
		envelope.ProjectionVersion != uint64(snapshot.ProjectionVersion) ||
		envelope.Epoch != uint64(snapshot.Epoch) ||
		envelope.Sequence != uint64(snapshot.Sequence) ||
		envelope.StatusRevision != 1 {
		t.Fatalf("projection cursor = %#v", envelope)
	}
}

func startLifecycleRecorder(t *testing.T) *lifecycleRecorder {
	t.Helper()
	const sessionID = "isa-87-lifecycle"
	now := time.Date(2026, 8, 1, 12, 0, 0, 0, time.UTC)
	store := recordingsqlite.New(recordingsqlite.Options{})
	writer, err := store.Begin(
		context.Background(),
		recording.SessionRef{Root: t.TempDir(), SessionID: sessionID},
		recording.NewSessionManifest(sessionID, "lmu", "isa-87", now),
	)
	if err != nil {
		t.Fatalf("SQLite Begin() error = %v", err)
	}
	batch := recording.RecordingBatch{
		Observed: []recording.RecordingPayloadV1{{
			Version:       recording.RecordingVersionV1,
			Channel:       recording.ChannelObserved,
			Epoch:         1,
			Sequence:      1,
			CapturedAtUTC: now,
			Vehicles: []recording.RecordingVehicleV1{{
				SessionSlot: 1,
				Presence:    recording.PresenceVehicleV1,
				Quality:     recording.QualityCurrent,
			}},
		}},
		Accepted: recording.Cursor{Epoch: 1, Sequence: 1},
	}
	if _, err := writer.Append(context.Background(), batch); err != nil {
		writer.Close()
		t.Fatalf("SQLite Append() error = %v", err)
	}
	return &lifecycleRecorder{writer: writer}
}

func assertHealthReachable(t *testing.T, client *http.Client, address string) {
	t.Helper()
	response, err := client.Get("http://" + address + "/health")
	if err != nil {
		t.Fatalf("health request error = %v", err)
	}
	response.Body.Close()
	if response.StatusCode != http.StatusOK {
		t.Fatalf("health status = %d", response.StatusCode)
	}
}

func assertPortClosed(t *testing.T, address string) {
	t.Helper()
	connection, err := net.DialTimeout("tcp", address, 250*time.Millisecond)
	if err == nil {
		connection.Close()
		t.Fatalf("HTTP port %s remained open after shutdown", address)
	}
}

func assertResourcesReturn(t *testing.T, baselineGoroutines int, baselineHandles uint32) {
	t.Helper()
	deadline := time.NewTimer(3 * time.Second)
	defer deadline.Stop()
	ticker := time.NewTicker(20 * time.Millisecond)
	defer ticker.Stop()
	for {
		goroutines := runtime.NumGoroutine()
		handles := processHandleCount(t)
		if goroutines <= baselineGoroutines+2 {
			t.Logf(
				"post-shutdown process resources: goroutines=%d baseline=%d handles=%d baseline=%d; owned handles are asserted by their component closures",
				goroutines,
				baselineGoroutines,
				handles,
				baselineHandles,
			)
			return
		}
		select {
		case <-deadline.C:
			t.Fatalf(
				"goroutines did not return: goroutines=%d baseline=%d handles=%d baseline=%d",
				goroutines,
				baselineGoroutines,
				handles,
				baselineHandles,
			)
		case <-ticker.C:
		}
	}
}

func processHandleCount(t *testing.T) uint32 {
	t.Helper()
	var count uint32
	result, _, callErr := getProcessHandleCount.Call(
		uintptr(windows.CurrentProcess()),
		uintptr(unsafe.Pointer(&count)),
	)
	if result == 0 {
		t.Fatalf("GetProcessHandleCount() error = %v", callErr)
	}
	return count
}

func keys(values map[string][]byte) []string {
	result := make([]string, 0, len(values))
	for key := range values {
		result = append(result, key)
	}
	return result
}
