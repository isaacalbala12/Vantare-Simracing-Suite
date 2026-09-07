package discordpresence

import (
	"bytes"
	"context"
	"encoding/binary"
	"encoding/json"
	"io"
	"sync"
	"testing"
	"time"
)

type captureConn struct {
	mu     sync.Mutex
	buffer bytes.Buffer
	done   chan struct{}
}

func newCaptureConn() *captureConn {
	return &captureConn{done: make(chan struct{})}
}

func (c *captureConn) Read([]byte) (int, error) { return 0, io.EOF }

func (c *captureConn) Write(data []byte) (int, error) {
	c.mu.Lock()
	defer c.mu.Unlock()
	return c.buffer.Write(data)
}

func (c *captureConn) Close() error {
	select {
	case <-c.done:
	default:
		close(c.done)
	}
	return nil
}

func (c *captureConn) bytes() []byte {
	c.mu.Lock()
	defer c.mu.Unlock()
	return append([]byte(nil), c.buffer.Bytes()...)
}

func TestClientPublishesHandshakeAndActivityAndClearsOnClose(t *testing.T) {
	conn := newCaptureConn()
	dialed := make(chan struct{}, 1)
	client := New(Config{
		ClientID:       "1546608423485972571",
		PID:            42,
		RetryInterval:  time.Hour,
		ConnectTimeout: time.Millisecond,
		Dial: func(context.Context, string) (io.ReadWriteCloser, error) {
			dialed <- struct{}{}
			return conn, nil
		},
	})
	client.SetActivity(Activity{
		Details:        "Vantare Simracing Suite",
		State:          "Hub activo",
		StartTimestamp: 123,
	})
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	if err := client.Start(ctx); err != nil {
		t.Fatal(err)
	}
	select {
	case <-dialed:
	case <-time.After(time.Second):
		t.Fatal("Discord pipe was not attempted")
	}

	waitForBytes(t, conn, func(data []byte) bool {
		frames, err := decodeFrames(data)
		return err == nil && len(frames) >= 2
	})
	if err := client.Close(); err != nil {
		t.Fatal(err)
	}

	frames, err := decodeFrames(conn.bytes())
	if err != nil {
		t.Fatal(err)
	}
	if len(frames) < 3 {
		t.Fatalf("frame count=%d want at least 3 (handshake, set, clear)", len(frames))
	}
	if frames[0].Opcode != opHandshake || frames[1].Opcode != opFrame || frames[len(frames)-1].Opcode != opFrame {
		t.Fatalf("unexpected opcodes: %#v", frames)
	}
	var activity rpcCommand
	if err := json.Unmarshal(frames[1].Body, &activity); err != nil {
		t.Fatal(err)
	}
	if activity.Cmd != "SET_ACTIVITY" {
		t.Fatalf("command=%q", activity.Cmd)
	}
	args, ok := activity.Args.(map[string]any)
	if !ok || args["pid"] != float64(42) {
		t.Fatalf("args=%#v", activity.Args)
	}
	var cleared rpcCommand
	if err := json.Unmarshal(frames[len(frames)-1].Body, &cleared); err != nil {
		t.Fatal(err)
	}
	clearArgs, ok := cleared.Args.(map[string]any)
	if !ok || clearArgs["activity"] != nil {
		t.Fatalf("clear args=%#v", cleared.Args)
	}
}

func TestWriteFrameUsesDiscordLittleEndianHeader(t *testing.T) {
	var buffer bytes.Buffer
	if err := writeFrame(&buffer, opFrame, map[string]string{"ok": "yes"}); err != nil {
		t.Fatal(err)
	}
	data := buffer.Bytes()
	if got := binary.LittleEndian.Uint32(data[:4]); got != uint32(opFrame) {
		t.Fatalf("opcode=%d", got)
	}
	if got := binary.LittleEndian.Uint32(data[4:8]); got != uint32(len(data)-8) {
		t.Fatalf("length=%d want %d", got, len(data)-8)
	}
}

type frame struct {
	Opcode int
	Body   []byte
}

func decodeFrames(data []byte) ([]frame, error) {
	var frames []frame
	for len(data) > 0 {
		if len(data) < 8 {
			return nil, io.ErrUnexpectedEOF
		}
		opcode := int(binary.LittleEndian.Uint32(data[:4]))
		length := int(binary.LittleEndian.Uint32(data[4:8]))
		if len(data) < 8+length {
			return nil, io.ErrUnexpectedEOF
		}
		frames = append(frames, frame{Opcode: opcode, Body: append([]byte(nil), data[8:8+length]...)})
		data = data[8+length:]
	}
	return frames, nil
}

func waitForBytes(t *testing.T, conn *captureConn, predicate func([]byte) bool) {
	t.Helper()
	deadline := time.NewTimer(time.Second)
	ticker := time.NewTicker(time.Millisecond)
	defer deadline.Stop()
	defer ticker.Stop()
	for {
		if predicate(conn.bytes()) {
			return
		}
		select {
		case <-deadline.C:
			t.Fatal("timed out waiting for Discord RPC frames")
		case <-ticker.C:
		}
	}
}
