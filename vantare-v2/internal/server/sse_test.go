package server_test

import (
	"bufio"
	"context"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/vantare/overlays/v2/internal/server"
	"github.com/vantare/overlays/v2/internal/telemetry/lmu"
	"github.com/vantare/overlays/v2/internal/telemetry/service"
)

func sseLines(ctx context.Context, url string, n int) ([]string, error) {
	req, _ := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	ch := make(chan string, n)
	go func() {
		scanner := bufio.NewScanner(resp.Body)
		for scanner.Scan() {
			ch <- scanner.Text()
		}
	}()

	var lines []string
	for i := 0; i < n; i++ {
		select {
		case line := <-ch:
			lines = append(lines, line)
		case <-ctx.Done():
			return lines, ctx.Err()
		}
	}
	return lines, nil
}

func TestTelemetryStream(t *testing.T) {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	svc := service.New(service.Config{
		ReadHz: 1000,
		EmitHz: 1000,
		Source: service.FuncSource(func() []byte {
			return lmu.BuildSyntheticBuffer()
		}),
	})
	go svc.Run(ctx)
	time.Sleep(50 * time.Millisecond)

	srv := server.New(server.ServerConfig{Svc: svc})
	s := httptest.NewServer(srv.Handler())
	defer s.Close()

	req, _ := http.NewRequestWithContext(ctx, http.MethodGet, s.URL+"/telemetry/stream", nil)
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		t.Fatalf("status = %d, want 200", resp.StatusCode)
	}
	ct := resp.Header.Get("Content-Type")
	if ct != "text/event-stream" {
		t.Fatalf("Content-Type = %s, want text/event-stream", ct)
	}
}

func TestTelemetryStreamEmitsEvents(t *testing.T) {
	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
	defer cancel()

	svc := service.New(service.Config{
		ReadHz: 1000,
		EmitHz: 100,
		Source: service.FuncSource(func() []byte {
			return lmu.BuildSyntheticBuffer()
		}),
	})
	go svc.Run(ctx)
	time.Sleep(50 * time.Millisecond)

	srv := server.New(server.ServerConfig{Svc: svc})
	s := httptest.NewServer(srv.Handler())
	defer s.Close()

	lines, err := sseLines(ctx, s.URL+"/telemetry/stream", 1)
	if err != nil {
		t.Fatalf("sseLines: %v", err)
	}
	if len(lines) == 0 {
		t.Fatal("no SSE lines received")
	}
	if !strings.HasPrefix(lines[0], "event: telemetry") {
		t.Fatalf("expected event: telemetry, got: %s", lines[0])
	}
}

func TestTelemetryStreamFormat(t *testing.T) {
	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
	defer cancel()

	svc := service.New(service.Config{
		ReadHz: 1000,
		EmitHz: 100,
		Source: service.FuncSource(func() []byte {
			return lmu.BuildSyntheticBuffer()
		}),
	})
	go svc.Run(ctx)
	time.Sleep(50 * time.Millisecond)

	srv := server.New(server.ServerConfig{Svc: svc})
	s := httptest.NewServer(srv.Handler())
	defer s.Close()

	lines, err := sseLines(ctx, s.URL+"/telemetry/stream", 2)
	if err != nil && len(lines) < 2 {
		t.Fatalf("sseLines: %v (got %d lines)", err, len(lines))
	}

	foundData := false
	for _, line := range lines {
		if strings.HasPrefix(line, "data: ") {
			foundData = true
			data := strings.TrimPrefix(line, "data: ")
			if !strings.Contains(data, "seq") || !strings.Contains(data, "snapshot") {
				t.Fatalf("SSE data missing seq/snapshot: %s", data)
			}
			break
		}
	}
	if !foundData {
		t.Fatalf("no SSE data line in %d lines", len(lines))
	}
}

func TestTelemetryStreamNoService(t *testing.T) {
	srv := server.New(server.ServerConfig{})
	req := httptest.NewRequest(http.MethodGet, "/telemetry/stream", nil)
	rr := httptest.NewRecorder()

	srv.Handler().ServeHTTP(rr, req)

	if rr.Code != http.StatusServiceUnavailable {
		t.Fatalf("status = %d, want 503", rr.Code)
	}
}
