package spotter

import (
	"fmt"
	"testing"
)

func TestSituationTransitionMatrixKeepsCurrentState(t *testing.T) {
	t.Parallel()
	situations := []struct {
		name        string
		left, right bool
		intent      string
	}{
		{"all-clear", false, false, IntentAllClear},
		{"left", true, false, IntentCarLeft},
		{"right", false, true, IntentCarRight},
		{"three-wide", true, true, IntentThreeWide},
	}
	for _, before := range situations {
		for _, after := range situations {
			t.Run(fmt.Sprintf("%s-to-%s", before.name, after.name), func(t *testing.T) {
				var policy Policy
				intent, emitted := policy.Evaluate(1_000, before.left, before.right)
				if before.intent == IntentAllClear {
					if emitted {
						t.Fatalf("initial all-clear emitted %s", intent)
					}
				} else if !emitted || intent != before.intent {
					t.Fatalf("initial = %q/%t, want %s", intent, emitted, before.intent)
				}
				intent, emitted = policy.Evaluate(1_500, after.left, after.right)
				if before.name == after.name {
					if emitted {
						t.Fatalf("unchanged state emitted %s", intent)
					}
					return
				}
				// Clear transitions are delayed; a second observation fires them.
				if !emitted {
					intent, emitted = policy.Evaluate(1_650, after.left, after.right)
				}
				if !emitted {
					t.Fatalf("transition produced no current message")
				}
				want, _ := selfContainedIntent(situationFor(after.left, after.right))
				if intent != want && !(before.name == "three-wide" && after.name == "left" && intent == IntentClearRight) &&
					!(before.name == "three-wide" && after.name == "right" && intent == IntentClearLeft) {
					t.Fatalf("transition intent = %s, want current %s", intent, want)
				}
			})
		}
	}
}

func TestPendingLessSpecificWarningIsSupersededByThreeWide(t *testing.T) {
	t.Parallel()
	var policy Policy
	intent, ok := policy.Evaluate(1_000, true, false)
	if !ok || intent != IntentCarLeft {
		t.Fatalf("first = %q/%t", intent, ok)
	}
	intent, ok = policy.Evaluate(1_001, true, true)
	if !ok || intent != IntentThreeWide {
		t.Fatalf("supersession = %q/%t, want three-wide", intent, ok)
	}
}

func TestClearRequiresStartedAcknowledgement(t *testing.T) {
	t.Parallel()
	for _, test := range []struct {
		name        string
		beforeLeft  bool
		beforeRight bool
		afterLeft   bool
		afterRight  bool
		initial     string
		wantClear   string
		wantSafe    string
	}{
		{"left-to-none", true, false, false, false, IntentCarLeft, IntentClearLeft, IntentAllClear},
		{"right-to-none", false, true, false, false, IntentCarRight, IntentClearRight, IntentAllClear},
		{"both-to-left", true, true, true, false, IntentThreeWide, IntentClearRight, IntentCarLeft},
		{"both-to-right", true, true, false, true, IntentThreeWide, IntentClearLeft, IntentCarRight},
	} {
		t.Run(test.name, func(t *testing.T) {
			var withoutACK Policy
			intent, _ := withoutACK.Evaluate(1_000, test.beforeLeft, test.beforeRight)
			if intent != test.initial {
				t.Fatalf("initial = %s", intent)
			}
			withoutACK.Evaluate(1_400, test.afterLeft, test.afterRight)
			intent, ok := withoutACK.Evaluate(1_550, test.afterLeft, test.afterRight)
			if !ok || intent != test.wantSafe {
				t.Fatalf("without ACK = %q/%t, want %s", intent, ok, test.wantSafe)
			}

			var started Policy
			intent, _ = started.Evaluate(1_000, test.beforeLeft, test.beforeRight)
			started.Started(intent, 4_000, 1_001)
			started.Evaluate(1_400, test.afterLeft, test.afterRight)
			intent, ok = started.Evaluate(1_550, test.afterLeft, test.afterRight)
			if !ok || intent != test.wantClear {
				t.Fatalf("with ACK = %q/%t, want %s", intent, ok, test.wantClear)
			}
		})
	}
}

func TestStillThereDoesNotRenewStartedContext(t *testing.T) {
	t.Parallel()
	var policy Policy
	intent, _ := policy.Evaluate(1_000, true, false)
	policy.Started(intent, 4_500, 1_001)
	intent, ok := policy.Evaluate(4_000, true, false)
	if !ok || intent != IntentStillThere {
		t.Fatalf("reminder = %q/%t", intent, ok)
	}
	policy.Started(intent, 8_000, 4_001)
	policy.Evaluate(4_900, false, false)
	intent, ok = policy.Evaluate(5_050, false, false)
	if !ok || intent != IntentAllClear {
		t.Fatalf("expired original context = %q/%t, want all-clear", intent, ok)
	}
}

func TestResetExpiresDeliveryAndOccupancyContext(t *testing.T) {
	t.Parallel()
	var policy Policy
	intent, _ := policy.Evaluate(1_000, true, true)
	policy.Started(intent, 5_000, 1_001)
	policy.Reset()
	intent, ok := policy.Evaluate(1_100, true, false)
	if !ok || intent != IntentCarLeft {
		t.Fatalf("after reset = %q/%t, want fresh car-left", intent, ok)
	}
}
