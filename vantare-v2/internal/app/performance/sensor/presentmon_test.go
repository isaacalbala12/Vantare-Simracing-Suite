package sensor

import (
	"context"
	"io"
	"strings"
	"sync"
	"testing"
	"time"
)

type fakeProcess struct{ killed bool }

func (*fakeProcess) Wait() error { return nil }
func (process *fakeProcess) Kill() error {
	process.killed = true
	return nil
}

type fakeRunner struct {
	mu      sync.Mutex
	queries []string
	stream  string
	process *fakeProcess
}

func (runner *fakeRunner) Output(_ context.Context, name string, args ...string) ([]byte, error) {
	runner.mu.Lock()
	defer runner.mu.Unlock()
	runner.queries = append(runner.queries, name+" "+strings.Join(args, " "))
	if len(args) > 0 && args[0] == "query" {
		return []byte("RSXTraceSession\nVantareSensor-111\nVantareSensor-222\n"), nil
	}
	return nil, nil
}
func (runner *fakeRunner) Start(_ context.Context, _ string, _ []string, stdout, _ io.Writer) (processHandle, error) {
	runner.process = &fakeProcess{}
	go func() {
		_, _ = io.WriteString(stdout, runner.stream)
		if closer, ok := stdout.(io.Closer); ok {
			_ = closer.Close()
		}
	}()
	return runner.process, nil
}

func TestPresentMonCleansOnlyVantareOrphansParsesV2AndStopsOwnSession(t *testing.T) {
	runner := &fakeRunner{stream: "Application,FrameTime,DisplayedTime\nLMU,8.25,1\n"}
	source := NewPresentMonSource("PresentMon.exe")
	source.runner = runner
	source.foreground = func() bool { return true }
	if err := source.Start(context.Background()); err != nil {
		t.Fatal(err)
	}
	deadline := time.Now().Add(time.Second)
	for !source.Sample().Available && time.Now().Before(deadline) {
		time.Sleep(time.Millisecond)
	}
	if got := source.Sample(); got.FrametimeMS != 8.25 || !got.Foreground {
		t.Fatalf("sample = %+v", got)
	}
	if err := source.Close(); err != nil {
		t.Fatal(err)
	}
	joined := strings.Join(runner.queries, "\n")
	for _, want := range []string{
		"logman query -ets",
		"logman stop VantareSensor-111 -ets",
		"logman stop VantareSensor-222 -ets",
		"logman stop " + source.sessionName + " -ets",
	} {
		if !strings.Contains(joined, want) {
			t.Errorf("missing %q in\n%s", want, joined)
		}
	}
	if strings.Contains(joined, "stop RSXTraceSession") {
		t.Fatalf("Radeon session was stopped:\n%s", joined)
	}
	if !runner.process.killed {
		t.Fatal("PresentMon process was not killed on close")
	}
}
