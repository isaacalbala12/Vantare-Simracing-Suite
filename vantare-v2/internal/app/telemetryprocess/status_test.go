package telemetryprocess

import (
	"bytes"
	"errors"
	"testing"
)

func TestDecodeRustStatusAndStop(t *testing.T) {
	wire := append([]byte{46, 0, 0, 0, 1, 0, 8, 0}, []byte(`{"heartbeat":1,"state":"live","sourceAgeNs":0}`)...)
	frame, err := DecodeFrame(wire)
	if err != nil {
		t.Fatal(err)
	}
	status, err := DecodeStatus(frame)
	if err != nil || status.Heartbeat != 1 || status.State != "live" || status.SourceAgeNS == nil || *status.SourceAgeNS != 0 {
		t.Fatalf("status = %#v, err = %v", status, err)
	}
	var tracker StatusTracker
	if _, err := tracker.Accept(frame); err != nil {
		t.Fatal(err)
	}
	if _, err := tracker.Accept(frame); !errors.Is(err, ErrInvalidStatus) {
		t.Fatalf("duplicate heartbeat: %v", err)
	}
	next := Frame{Kind: KindStatus, Payload: []byte(`{"heartbeat":2,"state":"stale","sourceAgeNs":500000000}`)}
	if _, err := new(StatusTracker).Accept(next); !errors.Is(err, ErrInvalidStatus) {
		t.Fatalf("missing first heartbeat: %v", err)
	}
	skipped := Frame{Kind: KindStatus, Payload: []byte(`{"heartbeat":3,"state":"stale","sourceAgeNs":500000000}`)}
	if _, err := tracker.Accept(skipped); !errors.Is(err, ErrInvalidStatus) {
		t.Fatalf("skipped heartbeat: %v", err)
	}
	if _, err := tracker.Accept(next); err != nil {
		t.Fatal(err)
	}
	if _, err := tracker.Accept(frame); !errors.Is(err, ErrInvalidStatus) {
		t.Fatalf("regressed heartbeat: %v", err)
	}
	if _, err := new(StatusTracker).Accept(frame); err != nil {
		t.Fatalf("new child tracker: %v", err)
	}
	counted := Frame{Kind: KindStatus, Payload: []byte(`{"heartbeat":1,"state":"live","sourceAgeNs":0,"shmTicks":60,"restReports":4,"restBatches":4,"restHttpFresh":3,"restState":"live"}`)}
	var counts StatusTracker
	first, err := counts.Accept(counted)
	if err != nil || first.SHMTicks == nil || *first.SHMTicks != 60 || first.RESTBatches == nil || *first.RESTBatches != 4 {
		t.Fatalf("counted status = %#v, err = %v", first, err)
	}
	regressed := Frame{Kind: KindStatus, Payload: []byte(`{"heartbeat":2,"state":"live","sourceAgeNs":0,"shmTicks":59,"restReports":5,"restBatches":4,"restHttpFresh":4}`)}
	if _, err := counts.Accept(regressed); !errors.Is(err, ErrInvalidStatus) {
		t.Fatalf("regressed source counters: %v", err)
	}
	advanced := Frame{Kind: KindStatus, Payload: []byte(`{"heartbeat":2,"state":"live","sourceAgeNs":0,"shmTicks":61,"restReports":5,"restBatches":5,"restHttpFresh":4}`)}
	if _, err := counts.Accept(advanced); err != nil {
		t.Fatalf("advanced source counters: %v", err)
	}
	for _, payload := range [][]byte{
		[]byte(`{}`),
		[]byte(`{"heartbeat":1,"state":"detecting"}`),
		[]byte(`{"heartbeat":0,"state":"live","sourceAgeNs":0}`),
		[]byte(`{"heartbeat":1,"state":"live","sourceAgeNs":null}`),
		[]byte(`{"heartbeat":1,"state":"unknown","sourceAgeNs":0}`),
		[]byte(`{"heartbeat":1,"state":"live","sourceAgeNs":0,"extra":1}`),
		[]byte(`{"heartbeat":1,"state":"live","sourceAgeNs":0,"shmTicks":1}`),
		[]byte(`{"heartbeat":1,"state":"live","sourceAgeNs":0,"shmTicks":1,"restReports":1,"restBatches":2}`),
		[]byte(`{"heartbeat":1,"state":"live","sourceAgeNs":0,"shmTicks":1,"restReports":1,"restBatches":1,"restHttpFresh":2}`),
		[]byte(`{"heartbeat":1,"state":"live","sourceAgeNs":0,"restState":"unknown"}`),
		[]byte(`{"heartbeat":1,"state":"live","sourceAgeNs":0} trailing`),
		bytes.Repeat([]byte("x"), MaxStatusPayload+1),
	} {
		if _, err := DecodeStatus(Frame{Kind: KindStatus, Payload: payload}); !errors.Is(err, ErrInvalidStatus) {
			t.Fatalf("payload %q: err = %v", payload, err)
		}
	}
	if err := DecodeStop(Frame{Kind: KindStop}); err != nil {
		t.Fatal(err)
	}
	if err := DecodeStop(Frame{Kind: KindStop, Payload: []byte("x")}); !errors.Is(err, ErrInvalidStatus) {
		t.Fatalf("nonempty stop: %v", err)
	}
}
