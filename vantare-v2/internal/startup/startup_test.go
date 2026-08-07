package startup

import "testing"

func TestWantsMinimisedOnlyMatchesTheExactFlag(t *testing.T) {
	cases := []struct {
		name string
		args []string
		want bool
	}{
		{"absent", []string{"vantare.exe"}, false},
		{"present", []string{"vantare.exe", MinimisedFlag}, true},
		{"among others", []string{"vantare.exe", "--launch=abc", MinimisedFlag}, true},
		// A prefix match would fire on a future --minimised-something, and a
		// substring match would fire on a profile id that happened to contain
		// the text.
		{"prefix only", []string{"--minimisedx"}, false},
		{"embedded in another argument", []string{"--launch=--minimised"}, false},
		{"empty", nil, false},
	}
	for _, testCase := range cases {
		t.Run(testCase.name, func(t *testing.T) {
			if got := WantsMinimised(testCase.args); got != testCase.want {
				t.Fatalf("WantsMinimised(%v) = %v, want %v", testCase.args, got, testCase.want)
			}
		})
	}
}
