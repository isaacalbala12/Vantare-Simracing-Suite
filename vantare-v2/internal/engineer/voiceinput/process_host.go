package voiceinput

import (
	"bufio"
	"bytes"
	"context"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"os"
	"os/exec"
	"sync"
	"time"
)

const maxProtocolLine = 64 * 1024

type CommandFactory func(nonce string) (*exec.Cmd, error)

type ProcessHost struct {
	mu      sync.Mutex
	factory CommandFactory
	cmd     *exec.Cmd
	stdin   io.WriteCloser
	reader  *bufio.Reader
	nonce   string
}

func NewProcessHost(factory CommandFactory) *ProcessHost {
	if factory == nil {
		factory = func(nonce string) (*exec.Cmd, error) {
			executable, err := os.Executable()
			if err != nil {
				return nil, err
			}
			return exec.Command(executable, "-engineer-voice-host-child", "-engineer-voice-host-nonce="+nonce), nil
		}
	}
	return &ProcessHost{factory: factory}
}

type hostReady struct {
	Protocol  string `json:"protocol"`
	PID       int    `json:"pid"`
	Nonce     string `json:"nonce"`
	Available bool   `json:"available"`
}

type hostRequest struct {
	Protocol  string `json:"protocol"`
	Nonce     string `json:"nonce"`
	Operation string `json:"operation"`
	CaptureID string `json:"captureId,omitempty"`
	MaxMS     int64  `json:"maxMs,omitempty"`
}

type hostResponse struct {
	Protocol string `json:"protocol"`
	Nonce    string `json:"nonce"`
	OK       bool   `json:"ok"`
	Text     string `json:"text,omitempty"`
}

func (host *ProcessHost) Start(ctx context.Context) error {
	if host == nil || ctx == nil {
		return ErrHostProtocol
	}
	host.mu.Lock()
	defer host.mu.Unlock()
	if host.cmd != nil {
		return ErrHostProtocol
	}
	nonce, err := randomNonce()
	if err != nil {
		return fmt.Errorf("create voice-host nonce: %w", err)
	}
	cmd, err := host.factory(nonce)
	if err != nil {
		return fmt.Errorf("create voice-host command: %w", err)
	}
	if cmd == nil {
		return fmt.Errorf("create voice-host command: %w", ErrHostProtocol)
	}
	cmd.Stderr = io.Discard
	stdin, err := cmd.StdinPipe()
	if err != nil {
		return fmt.Errorf("open voice-host stdin: %w", err)
	}
	stdout, err := cmd.StdoutPipe()
	if err != nil {
		_ = stdin.Close()
		return fmt.Errorf("open voice-host stdout: %w", err)
	}
	prepareHiddenProcess(cmd)
	if err := cmd.Start(); err != nil {
		_ = stdin.Close()
		return fmt.Errorf("start voice-host: %w", err)
	}
	if err := lowerProcessPriority(cmd.Process.Pid); err != nil {
		_ = cmd.Process.Kill()
		_ = waitProcessOnce(cmd, time.Second, false)
		return fmt.Errorf("lower voice-host priority: %w", err)
	}
	host.cmd, host.stdin, host.reader, host.nonce = cmd, stdin, bufio.NewReaderSize(stdout, maxProtocolLine), nonce
	readyLine, err := readLine(ctx, host.reader)
	if err != nil {
		host.stopLocked(time.Second)
		return fmt.Errorf("read voice-host readiness: %w", err)
	}
	var ready hostReady
	if decodeStrict(readyLine, &ready) != nil || ready.Protocol != ProtocolV1 || ready.PID != cmd.Process.Pid || ready.Nonce != nonce {
		host.stopLocked(time.Second)
		return ErrHostProtocol
	}
	if !ready.Available {
		host.stopLocked(time.Second)
		return ErrHostUnavailable
	}
	return nil
}

func (host *ProcessHost) Begin(ctx context.Context, capture Capture) error {
	_, err := host.request(ctx, hostRequest{Operation: "begin", CaptureID: capture.ID, MaxMS: capture.MaxWindow.Milliseconds()})
	return err
}

func (host *ProcessHost) Finish(ctx context.Context, capture Capture) (string, error) {
	response, err := host.request(ctx, hostRequest{Operation: "finish", CaptureID: capture.ID})
	return response.Text, err
}

func (host *ProcessHost) Cancel(ctx context.Context, capture Capture) error {
	_, err := host.request(ctx, hostRequest{Operation: "cancel", CaptureID: capture.ID})
	return err
}

func (host *ProcessHost) WakeEvents() <-chan string { return nil }

func (host *ProcessHost) Stop(ctx context.Context) error {
	if host == nil || ctx == nil {
		return ErrHostProtocol
	}
	host.mu.Lock()
	defer host.mu.Unlock()
	if host.cmd == nil {
		return nil
	}
	request := hostRequest{Protocol: ProtocolV1, Nonce: host.nonce, Operation: "shutdown"}
	if data, err := json.Marshal(request); err == nil {
		_, _ = host.stdin.Write(append(data, '\n'))
	}
	timeout := time.Second
	if deadline, ok := ctx.Deadline(); ok {
		timeout = time.Until(deadline)
		if timeout <= 0 {
			timeout = time.Millisecond
		}
	}
	return host.stopLocked(timeout)
}

func (host *ProcessHost) request(ctx context.Context, request hostRequest) (hostResponse, error) {
	host.mu.Lock()
	defer host.mu.Unlock()
	if host.cmd == nil || host.cmd.Process == nil {
		return hostResponse{}, ErrHostUnavailable
	}
	request.Protocol, request.Nonce = ProtocolV1, host.nonce
	data, err := json.Marshal(request)
	if err != nil {
		return hostResponse{}, ErrHostProtocol
	}
	if _, err := host.stdin.Write(append(data, '\n')); err != nil {
		return hostResponse{}, fmt.Errorf("write voice-host request: %w", err)
	}
	line, err := readLine(ctx, host.reader)
	if err != nil {
		_ = host.stopLocked(time.Second)
		return hostResponse{}, fmt.Errorf("read voice-host response: %w", err)
	}
	var response hostResponse
	if decodeStrict(line, &response) != nil || response.Protocol != ProtocolV1 || response.Nonce != host.nonce || !response.OK {
		_ = host.stopLocked(time.Second)
		return hostResponse{}, ErrHostProtocol
	}
	return response, nil
}

func (host *ProcessHost) stopLocked(timeout time.Duration) error {
	cmd := host.cmd
	if cmd == nil {
		return nil
	}
	_ = host.stdin.Close()
	err := waitProcessOnce(cmd, timeout, true)
	host.cmd, host.stdin, host.reader, host.nonce = nil, nil, nil, ""
	return err
}

func randomNonce() (string, error) {
	value := make([]byte, 16)
	if _, err := rand.Read(value); err != nil {
		return "", err
	}
	return hex.EncodeToString(value), nil
}

func readLine(ctx context.Context, reader *bufio.Reader) ([]byte, error) {
	type result struct {
		line []byte
		err  error
	}
	done := make(chan result, 1)
	go func() {
		line, err := reader.ReadSlice('\n')
		if err == bufio.ErrBufferFull || len(line) > maxProtocolLine {
			err = ErrHostProtocol
		}
		done <- result{line: append([]byte(nil), line...), err: err}
	}()
	select {
	case <-ctx.Done():
		return nil, ctx.Err()
	case result := <-done:
		return result.line, result.err
	}
}

func decodeStrict(data []byte, target any) error {
	decoder := json.NewDecoder(bytes.NewReader(data))
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(target); err != nil {
		return err
	}
	if err := decoder.Decode(&struct{}{}); err != io.EOF {
		return ErrHostProtocol
	}
	return nil
}

func waitProcessOnce(cmd *exec.Cmd, timeout time.Duration, killOnTimeout bool) error {
	done := make(chan error, 1)
	go func() { done <- cmd.Wait() }()
	select {
	case err := <-done:
		if err != nil {
			if _, ok := err.(*exec.ExitError); ok {
				return nil
			}
			return err
		}
		return nil
	case <-time.After(timeout):
		if !killOnTimeout {
			return context.DeadlineExceeded
		}
		if err := cmd.Process.Kill(); err != nil {
			return err
		}
		select {
		case <-done:
			return nil
		case <-time.After(time.Second):
			return context.DeadlineExceeded
		}
	}
}

// RunUnavailableChild is the shipped F5 child entrypoint. It proves the
// process boundary without pretending that a WASAPI/Whisper backend is bundled.
func RunUnavailableChild(nonce string, output io.Writer) error {
	if len(nonce) != 32 {
		return ErrHostProtocol
	}
	if _, err := hex.DecodeString(nonce); err != nil {
		return ErrHostProtocol
	}
	return json.NewEncoder(output).Encode(hostReady{Protocol: ProtocolV1, PID: os.Getpid(), Nonce: nonce, Available: false})
}

func ChildNonceFromArgs(args []string) (string, bool) {
	child := false
	nonce := ""
	for _, argument := range args {
		if argument == "-engineer-voice-host-child" {
			child = true
		}
		const prefix = "-engineer-voice-host-nonce="
		if len(argument) > len(prefix) && argument[:len(prefix)] == prefix {
			nonce = argument[len(prefix):]
		}
	}
	return nonce, child
}
