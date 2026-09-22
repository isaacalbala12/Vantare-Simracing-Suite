package main

import (
	"context"
	"embed"
	"encoding/json"
	"fmt"
	"log"
	"net"
	"net/http"
	"os"
	"runtime"
	"sort"
	"sync/atomic"
	"syscall"
	"time"

	"github.com/coder/websocket"
	"github.com/wailsapp/wails/v3/pkg/application"
)

//go:embed assets
var benchmarkAssets embed.FS

const framesPerRun = 120

type benchmarkRequest struct {
	Size      int       `json:"size"`
	Ack       int       `json:"ack"`
	Latencies []float64 `json:"latencies,omitempty"`
}
type benchmarkFrame struct {
	Sequence int    `json:"sequence"`
	Payload  string `json:"payload"`
}
type runStats struct {
	Mode          string  `json:"mode"`
	Size          int     `json:"size"`
	Frames        int     `json:"frames"`
	WallMS        float64 `json:"wall_ms"`
	CPUMS         float64 `json:"cpu_ms"`
	GoHeapPeakMiB float64 `json:"go_heap_peak_mib"`
	P50MS         float64 `json:"p50_ms"`
	P95MS         float64 `json:"p95_ms"`
	P99MS         float64 `json:"p99_ms"`
}

func processCPU() time.Duration {
	var usage syscall.Rusage
	if err := syscall.Getrusage(syscall.RUSAGE_SELF, &usage); err != nil {
		return 0
	}
	return time.Duration(usage.Utime.Sec+usage.Stime.Sec)*time.Second + time.Duration(usage.Utime.Usec+usage.Stime.Usec)*time.Microsecond
}
func percentile(values []float64, p float64) float64 {
	if len(values) == 0 {
		return 0
	}
	sorted := append([]float64(nil), values...)
	sort.Float64s(sorted)
	index := int(float64(len(sorted)-1)*p + 0.5)
	return sorted[index]
}
func main() {
	listener, err := net.Listen("tcp4", "127.0.0.1:0")
	if err != nil {
		log.Fatal(err)
	}
	var finished atomic.Int32
	app := application.New(application.Options{Name: "Vantare Transport Benchmark", Assets: application.AssetOptions{Handler: application.BundledAssetFileServer(benchmarkAssets)}, Mac: application.MacOptions{ApplicationShouldTerminateAfterLastWindowClosed: true}})
	record := func(mode string, size int, started time.Time, cpuBefore time.Duration, heapPeak uint64, latencies []float64) {
		result := runStats{Mode: mode, Size: size, Frames: framesPerRun, WallMS: float64(time.Since(started).Microseconds()) / 1000, CPUMS: float64((processCPU() - cpuBefore).Microseconds()) / 1000, GoHeapPeakMiB: float64(heapPeak) / (1024 * 1024), P50MS: percentile(latencies, .50), P95MS: percentile(latencies, .95), P99MS: percentile(latencies, .99)}
		data, _ := json.Marshal(result)
		fmt.Println(string(data))
		if finished.Add(1) == 6 {
			go func() { time.Sleep(300 * time.Millisecond); app.Quit() }()
		}
	}
	run := func(mode string, receive func(*benchmarkRequest) error, send func(benchmarkFrame) error) error {
		var first benchmarkRequest
		if err := receive(&first); err != nil {
			return err
		}
		if first.Ack != 0 || (first.Size != 8192 && first.Size != 65536) {
			return fmt.Errorf("invalid initial request: %+v", first)
		}
		payload := make([]byte, first.Size)
		for i := range payload {
			payload[i] = 'x'
		}
		frame := benchmarkFrame{Payload: string(payload)}
		start := time.Now()
		cpuBefore := processCPU()
		var mem runtime.MemStats
		runtime.ReadMemStats(&mem)
		peak := mem.HeapAlloc
		for seq := 1; seq <= framesPerRun; seq++ {
			frame.Sequence = seq
			if err := send(frame); err != nil {
				return err
			}
			var ack benchmarkRequest
			if err := receive(&ack); err != nil {
				return err
			}
			if ack.Ack != seq {
				return fmt.Errorf("ack %d, expected %d", ack.Ack, seq)
			}
			runtime.ReadMemStats(&mem)
			if mem.HeapAlloc > peak {
				peak = mem.HeapAlloc
			}
			if seq == framesPerRun {
				if len(ack.Latencies) != framesPerRun {
					return fmt.Errorf("got %d latencies", len(ack.Latencies))
				}
				record(mode, first.Size, start, cpuBefore, peak, ack.Latencies)
			}
		}
		return nil
	}
	app.HandleStream("benchmark", func(conn *application.StreamConn) {
		defer conn.Close()
		if conn.Window() == nil {
			log.Print("stream has no window")
			return
		}
		if err := run("stream", func(v *benchmarkRequest) error { return conn.ReceiveJSON(v) }, func(v benchmarkFrame) error { return conn.SendJSON(v) }); err != nil {
			log.Printf("stream failed: %v", err)
			app.Quit()
		}
	})
	server := &http.Server{Handler: http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Header.Get("Origin") != "wails://localhost" {
			http.Error(w, "forbidden", 403)
			return
		}
		conn, err := websocket.Accept(w, r, &websocket.AcceptOptions{InsecureSkipVerify: true})
		if err != nil {
			return
		}
		defer conn.Close(websocket.StatusNormalClosure, "")
		err = run("socket", func(v *benchmarkRequest) error {
			ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
			defer cancel()
			_, data, e := conn.Read(ctx)
			if e != nil {
				return e
			}
			return json.Unmarshal(data, v)
		}, func(v benchmarkFrame) error {
			data, e := json.Marshal(v)
			if e != nil {
				return e
			}
			ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
			defer cancel()
			return conn.Write(ctx, websocket.MessageText, data)
		})
		if err != nil {
			log.Printf("socket failed: %v", err)
			app.Quit()
		}
	})}
	go func() {
		if err := server.Serve(listener); err != nil && err != http.ErrServerClosed {
			log.Printf("server: %v", err)
		}
	}()
	defer server.Close()
	app.Window.NewWithOptions(application.WebviewWindowOptions{Title: "Vantare Transport Benchmark", Width: 500, Height: 300, URL: "/?socket=ws://" + listener.Addr().String()})
	timer := time.AfterFunc(3*time.Minute, func() { log.Print("benchmark timeout"); app.Quit() })
	defer timer.Stop()
	if err := app.Run(); err != nil {
		log.Fatal(err)
	}
	if finished.Load() != 6 {
		fmt.Fprintf(os.Stderr, "benchmark incomplete: %d/6\n", finished.Load())
		os.Exit(1)
	}
}
