package service

import (
	"context"
	"errors"
	"testing"

	"github.com/vantare/overlays/v2/internal/engineer/delivery"
	"github.com/vantare/overlays/v2/internal/engineer/messagepolicy"
	"github.com/vantare/overlays/v2/internal/engineer/presentation"
)

type presentationAckRecorder struct {
	states []delivery.State
}

func (recorder *presentationAckRecorder) Acknowledge(state delivery.State, _ delivery.Reason) error {
	recorder.states = append(recorder.states, state)
	return nil
}

func TestProductDeliveryRejectsPresentationBeforeStarted(t *testing.T) {
	resolver, err := presentation.NewResolver()
	if err != nil {
		t.Fatal(err)
	}
	service := NewEngineerService(nil)
	reporter := &presentationAckRecorder{}
	decision := messagepolicy.Decision{
		Version: messagepolicy.ContractVersionV1, CandidateID: "candidate", Family: messagepolicy.FamilyLaps,
		Intent: "future.intent", Priority: messagepolicy.PriorityInformation, CreatedAtMS: 100, ExpiresAtMS: 200,
	}
	port := productDeliveryPort{service: service, presentationResolver: resolver, locale: presentation.LocaleSpanish}
	err = port.Deliver(context.Background(), delivery.Request{Version: delivery.ContractVersionV1, DeliveryID: "delivery", Decision: decision}, reporter)
	if !errors.Is(err, presentation.ErrUnsupportedIntent) {
		t.Fatalf("Deliver() error = %v, want unsupported intent", err)
	}
	if len(reporter.states) != 0 {
		t.Fatalf("invalid presentation acknowledged states = %v", reporter.states)
	}
	if notifications := service.RecentNotifications(); len(notifications) != 0 {
		t.Fatalf("invalid presentation published notifications = %+v", notifications)
	}
}

func TestEngineerLocaleIsValidatedBeforeStart(t *testing.T) {
	service := NewEngineerService(nil)
	if got := service.Locale(); got != presentation.LocaleSpanish {
		t.Fatalf("default locale = %q, want es", got)
	}
	if err := service.SetLocale("fr"); !errors.Is(err, presentation.ErrUnsupportedLocale) {
		t.Fatalf("SetLocale(fr) error = %v", err)
	}
	if err := service.SetLocale("en"); err != nil {
		t.Fatal(err)
	}
	if err := service.Start(context.Background()); err != nil {
		t.Fatal(err)
	}
	defer service.Stop()
	if err := service.SetLocale("it"); !errors.Is(err, ErrPresentationLocaleRunning) {
		t.Fatalf("SetLocale while running error = %v", err)
	}
}
