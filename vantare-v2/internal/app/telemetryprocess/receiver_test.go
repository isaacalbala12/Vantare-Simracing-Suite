package telemetryprocess

import (
	"encoding/json"
	"errors"
	"os"
	"path/filepath"
	"testing"
)

func receiverFixture(t *testing.T, name string) Frame {
	t.Helper()
	wire, err := os.ReadFile(filepath.Join("..", "..", "..", "rust", "telemetry", "testdata", name))
	if err != nil {
		t.Fatal(err)
	}
	frame, err := DecodeFrame(wire)
	if err != nil {
		t.Fatal(err)
	}
	return frame
}

func TestReceiverRejectsUnrequestedAndStaleProducts(t *testing.T) {
	configuration := receiverFixture(t, "configuration-frame-go-v1.bin")
	var policy ConfigurationV1
	if err := json.Unmarshal(configuration.Payload, &policy); err != nil {
		t.Fatal(err)
	}
	receiver := NewReceiver()
	if _, err := receiver.Accept(receiverFixture(t, "engineer-snapshot-frame-rust-v1.bin")); !errors.Is(err, ErrReceiverProtocol) {
		t.Fatalf("snapshot before ACK: %v", err)
	}
	if _, err := receiver.Configure(policy); err != nil {
		t.Fatal(err)
	}
	if _, err := receiver.Configure(policy); !errors.Is(err, ErrReceiverProtocol) {
		t.Fatalf("duplicate pending configuration: %v", err)
	}
	ack := Frame{Kind: KindConfigurationAck, Payload: []byte(`{"revision":7,"epoch":1,"sequence":1,"factStream":15,"factSequence":11}`)}
	if _, err := receiver.Accept(ack); err != nil {
		t.Fatal(err)
	}
	if _, err := receiver.Accept(ack); !errors.Is(err, ErrReceiverProtocol) {
		t.Fatalf("unrequested ACK: %v", err)
	}
	engineer := receiverFixture(t, "engineer-snapshot-frame-rust-v1.bin")
	if event, err := receiver.Accept(engineer); err != nil || event.Engineer == nil || len(event.Engineer.Vehicles) != 44 {
		t.Fatalf("engineer = %+v, %v", event.Engineer, err)
	}
	if _, err := receiver.Accept(engineer); !errors.Is(err, ErrReceiverProtocol) {
		t.Fatalf("duplicate engineer: %v", err)
	}
	if _, err := receiver.Accept(receiverFixture(t, "strategy-snapshot-frame-rust-v1.bin")); !errors.Is(err, ErrReceiverProtocol) {
		t.Fatalf("unrequested strategy: %v", err)
	}
	fact := receiverFixture(t, "engineer-fact-frame-rust-v1.bin")
	first, err := receiver.Accept(fact)
	if err != nil || !first.FactAdded || first.FactACK == nil {
		t.Fatalf("first fact = %+v, %v", first, err)
	}
	duplicate, err := receiver.Accept(fact)
	if err != nil || duplicate.FactAdded || duplicate.FactACK == nil {
		t.Fatalf("duplicate fact = %+v, %v", duplicate, err)
	}
	if facts := receiver.DrainFacts(); len(facts) != 1 {
		t.Fatalf("retained facts = %d", len(facts))
	}
	if facts := receiver.DrainFacts(); len(facts) != 0 {
		t.Fatalf("redelivered facts = %d", len(facts))
	}
	policy.Revision++
	policy.Consumers = ConsumersV1{Strategy: true}
	if _, err := receiver.Configure(policy); err != nil {
		t.Fatal(err)
	}
	badACK := Frame{Kind: KindConfigurationAck, Payload: []byte(`{"revision":8,"epoch":1,"sequence":2,"factStream":15,"factSequence":11}`)}
	if _, err := receiver.Accept(badACK); !errors.Is(err, ErrReceiverProtocol) {
		t.Fatalf("regressed fact baseline: %v", err)
	}
	goodACK := Frame{Kind: KindConfigurationAck, Payload: []byte(`{"revision":8,"epoch":1,"sequence":2,"factStream":15,"factSequence":12}`)}
	if _, err := receiver.Accept(goodACK); err != nil {
		t.Fatal(err)
	}
	if _, err := receiver.Accept(fact); !errors.Is(err, ErrReceiverProtocol) {
		t.Fatalf("fact after Engineer demand withdrawn: %v", err)
	}
	if _, err := receiver.Accept(engineer); !errors.Is(err, ErrReceiverProtocol) {
		t.Fatalf("engineer after demand withdrawn: %v", err)
	}
	if stopped, err := receiver.Accept(Frame{Kind: KindStop}); err != nil || !stopped.Stopped {
		t.Fatalf("stop = %+v, %v", stopped, err)
	}
	if _, err := receiver.Accept(Frame{Kind: KindStop}); !errors.Is(err, ErrReceiverProtocol) {
		t.Fatalf("duplicate stop: %v", err)
	}
	if _, err := receiver.Configure(policy); !errors.Is(err, ErrReceiverProtocol) {
		t.Fatalf("configuration after stop: %v", err)
	}
}

func TestReceiverAcceptsSuppressedFactBaselineWhenEngineerDemandWasOff(t *testing.T) {
	configuration := receiverFixture(t, "configuration-frame-go-v1.bin")
	var policy ConfigurationV1
	if err := json.Unmarshal(configuration.Payload, &policy); err != nil {
		t.Fatal(err)
	}
	policy.Consumers = ConsumersV1{}
	receiver := NewReceiver()
	if _, err := receiver.Configure(policy); err != nil {
		t.Fatal(err)
	}
	first := Frame{Kind: KindConfigurationAck, Payload: []byte(`{"revision":7,"epoch":1,"sequence":1,"factStream":15,"factSequence":11}`)}
	if _, err := receiver.Accept(first); err != nil {
		t.Fatal(err)
	}
	policy.Revision++
	policy.Consumers.OverlayV2 = true
	if _, err := receiver.Configure(policy); err != nil {
		t.Fatal(err)
	}
	// The child generated and suppressed a fact while Engineer was off.
	second := Frame{Kind: KindConfigurationAck, Payload: []byte(`{"revision":8,"epoch":1,"sequence":2,"factStream":15,"factSequence":12}`)}
	if _, err := receiver.Accept(second); err != nil {
		t.Fatalf("suppressed fact baseline rejected: %v", err)
	}
	if receiver.facts.last != 12 {
		t.Fatalf("next Engineer fact baseline = %d, want 12", receiver.facts.last)
	}
}

func TestSnapshotProductDispatchRetainsReorderedJSONCompatibility(t *testing.T) {
	for _, name := range []string{"overlay-snapshot-frame-rust-v1.bin", "engineer-snapshot-frame-rust-v1.bin", "strategy-snapshot-frame-rust-v1.bin"} {
		frame := receiverFixture(t, name)
		var envelope struct {
			Product string `json:"product"`
		}
		if err := json.Unmarshal(frame.Payload, &envelope); err != nil {
			t.Fatal(err)
		}
		got, err := snapshotProduct(frame.Payload)
		if err != nil || got != envelope.Product {
			t.Fatalf("%s product = %q, %v; want %q", name, got, err, envelope.Product)
		}
	}
	got, err := snapshotProduct([]byte(`{"snapshot":{}, "product" : "engineer-v1"}`))
	if err != nil || got != ProductEngineerV1 {
		t.Fatalf("reordered legacy envelope product = %q, %v", got, err)
	}
}
