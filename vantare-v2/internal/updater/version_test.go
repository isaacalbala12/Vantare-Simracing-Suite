package updater

import "testing"

func TestParseVersion(t *testing.T) {
	cases := []struct {
		in                         string
		major, minor, patch, build int
		suffix                     string
	}{
		{"v0.1.4-prealpha", 0, 1, 4, 0, "prealpha"},
		{"1.2.3", 1, 2, 3, 0, ""},
		{"v2.0", 2, 0, 0, 0, ""},
		{"v0.1.0-alpha.1", 0, 1, 0, 0, "alpha.1"},
		{"0.3.10.0", 0, 3, 10, 0, ""},
		{"0.3.10.1", 0, 3, 10, 1, ""},
		{"0.3.10.1-alpha", 0, 3, 10, 1, "alpha"},
	}
	for _, c := range cases {
		v := ParseVersion(c.in)
		if v.Major != c.major || v.Minor != c.minor || v.Patch != c.patch || v.Build != c.build || v.Suffix != c.suffix {
			t.Fatalf("parse %s: got %+v", c.in, v)
		}
	}
}

func TestCompare(t *testing.T) {
	cases := []struct {
		a, b string
		want int
	}{
		{"v0.1.4", "v0.1.3", 1},
		{"v0.1.3", "v0.1.4", -1},
		{"v0.1.4", "v0.1.4", 0},
		{"v0.1.4-prealpha", "v0.1.4", -1},
		{"v0.1.4", "v0.1.4-prealpha", 1},
		{"v0.2.0", "v0.10.0", -1},
		// 4-digit specific tests
		{"0.3.10.0", "0.3.10", 0},
		{"0.3.10.1", "0.3.10.0", 1},
		{"0.3.10.0", "0.3.10.1", -1},
		{"0.3.10.1", "0.3.10", 1},
		{"0.3.11.0", "0.3.10.1", 1},
		{"0.4.0.0", "0.3.11.0", 1},
		{"0.3.10.1-alpha", "0.3.10.1", -1},
		{"0.3.10.1", "0.3.10.1-alpha", 1},
	}
	for _, c := range cases {
		a := ParseVersion(c.a)
		b := ParseVersion(c.b)
		got := a.Compare(b)
		if got != c.want {
			t.Fatalf("compare %s vs %s: got %d want %d", c.a, c.b, got, c.want)
		}
	}
}
