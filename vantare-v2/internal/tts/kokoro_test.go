package tts

import (
	"testing"
)

func TestKokoroProvider_Name(t *testing.T) {
	p := NewKokoroProvider(t.TempDir())
	if p.Name() != "kokoro" {
		t.Errorf("expected 'kokoro', got %s", p.Name())
	}
}

func TestSanitize(t *testing.T) {
	cases := []struct{ in, want string }{
		{"hello", "hello"},
		{"hello world", "hello_world"},
		{"temperatura del agua", "temperatura_del_agua"},
		{"123", "123"},
		{"a/b/c", "a_b_c"},
	}
	for _, c := range cases {
		got := sanitize(c.in)
		if got != c.want {
			t.Errorf("sanitize(%q) = %q, want %q", c.in, got, c.want)
		}
	}
}
