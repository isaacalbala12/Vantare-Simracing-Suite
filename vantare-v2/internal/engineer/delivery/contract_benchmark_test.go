package delivery

import "testing"

func BenchmarkSessionLifecycle(b *testing.B) {
	clock := &testClock{now: 1_010}
	metrics := NewMetrics(128)
	b.ReportAllocs()
	for index := 0; index < b.N; index++ {
		request := requestFixture()
		request.DeliveryID = "delivery-benchmark"
		session, err := NewSession(request, clock, metrics, nil)
		if err != nil {
			b.Fatal(err)
		}
		if err := session.Acknowledge(StateQueued, ReasonNone); err != nil {
			b.Fatal(err)
		}
		if err := session.Acknowledge(StateStarted, ReasonNone); err != nil {
			b.Fatal(err)
		}
		if err := session.Acknowledge(StateCompleted, ReasonNone); err != nil {
			b.Fatal(err)
		}
	}
}
