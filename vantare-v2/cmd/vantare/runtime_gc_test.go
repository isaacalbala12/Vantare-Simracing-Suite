package main

import "testing"

func TestRuntimeGCDefaultHonoursExplicitConfiguration(t *testing.T) {
	for _, test := range []struct {
		name, value string
		configured  bool
		calls       int
	}{
		{"default", "", false, 1}, {"user-value", "100", true, 0},
		{"user-off", "off", true, 0}, {"user-empty", "", true, 0},
	} {
		t.Run(test.name, func(t *testing.T) {
			calls := 0
			configureRuntimeGC(func(name string) (string, bool) {
				if name != "GOGC" {
					t.Fatalf("unexpected variable %s", name)
				}
				return test.value, test.configured
			}, func(percent int) int {
				calls++
				if percent != 300 {
					t.Fatalf("percent %d", percent)
				}
				return 100
			})
			if calls != test.calls {
				t.Fatalf("GC changes %d, want %d", calls, test.calls)
			}
		})
	}
}
