package sensor

import (
	"context"
	"io"
	"strings"
	"sync"
	"testing"
	"time"
)

type fakeProcess struct {
	pid        int
	killed     bool
	operations *[]string
	exited     chan struct{}
	stopped    chan struct{}
	stopOnce   sync.Once
}

func (process *fakeProcess) PID() int { return process.pid }
func (process *fakeProcess) Wait() error {
	<-process.exited
	<-process.stopped
	*process.operations = append(*process.operations, "wait:43125")
	return nil
}
func (process *fakeProcess) Kill() error {
	process.killed = true
	*process.operations = append(*process.operations, "kill:43125")
	close(process.exited)
	return nil
}

type fakeRunner struct {
	mu         sync.Mutex
	queries    []string
	stream     string
	process    *fakeProcess
	operations []string
}

func (runner *fakeRunner) Output(_ context.Context, name string, args ...string) ([]byte, error) {
	runner.mu.Lock()
	defer runner.mu.Unlock()
	runner.queries = append(runner.queries, name+" "+strings.Join(args, " "))
	if len(args) > 0 && args[0] == "stop" {
		runner.operations = append(runner.operations, "stop:"+args[1])
		if runner.process != nil {
			runner.process.stopOnce.Do(func() { close(runner.process.stopped) })
		}
	}
	if len(args) > 0 && args[0] == "query" {
		return []byte("RSXTraceSession\nVantareHuella-isa940\nVantareSensor-111\nVantareSensor-222\nVantareSensor-333\n"), nil
	}
	return nil, nil
}
func (runner *fakeRunner) Start(_ context.Context, _ string, _ []string) (processHandle, io.ReadCloser, error) {
	runner.process = &fakeProcess{
		pid:        43125,
		operations: &runner.operations,
		exited:     make(chan struct{}),
		stopped:    make(chan struct{}),
	}
	return runner.process, io.NopCloser(strings.NewReader(runner.stream)), nil
}

func TestPresentMonLeavesLiveVantareSessionsAndCleansOnlyOrphan(t *testing.T) {
	runner := &fakeRunner{stream: "Application,FrameTime,DisplayedTime\nLMU,8.25,1\n"}
	source := NewPresentMonSource("PresentMon.exe")
	source.runner = runner
	source.foreground = func() bool { return true }
	source.processAlive = func(pid int) bool { return pid == 111 || pid == 222 }
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
		"logman stop VantareSensor-333 -ets",
		"logman stop " + source.sessionName + " -ets",
	} {
		if !strings.Contains(joined, want) {
			t.Errorf("missing %q in\n%s", want, joined)
		}
	}
	for _, live := range []string{"VantareSensor-111", "VantareSensor-222"} {
		if strings.Contains(joined, "logman stop "+live+" -ets") {
			t.Fatalf("live session %s was stopped:\n%s", live, joined)
		}
	}
	if strings.Contains(joined, "stop RSXTraceSession") {
		t.Fatalf("Radeon session was stopped:\n%s", joined)
	}
	if strings.Contains(joined, "stop VantareHuella-isa940") {
		t.Fatalf("another worker session was stopped:\n%s", joined)
	}
	if count := strings.Count(joined, "logman stop "+source.sessionName+" -ets"); count != 2 {
		t.Fatalf("own session stop count = %d, want 2:\n%s", count, joined)
	}
	if !runner.process.killed {
		t.Fatal("PresentMon process was not killed on close")
	}
	if source.processPID != 43125 {
		t.Fatalf("owned PresentMon PID = %d, want 43125", source.processPID)
	}
	wantOrder := []string{
		"kill:43125",
		"stop:" + source.sessionName,
		"wait:43125",
		"stop:" + source.sessionName,
	}
	gotOrder := runner.operations[len(runner.operations)-len(wantOrder):]
	if strings.Join(gotOrder, "\n") != strings.Join(wantOrder, "\n") {
		t.Fatalf("shutdown order = %q, want %q", gotOrder, wantOrder)
	}
}

func TestMissingSessionRecognisesSpanishLogmanCollectorMessage(t *testing.T) {
	output := []byte("Error:\r\nNo se encontr\xa2 el Conjunto de recopiladores de datos.\r\n")
	if !isMissingSession(output) {
		t.Fatalf("Spanish missing-session output was not recognised: %q", output)
	}
}
