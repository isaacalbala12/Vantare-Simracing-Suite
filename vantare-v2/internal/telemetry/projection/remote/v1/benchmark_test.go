package v1

import (
	"fmt"
	"testing"
)

func BenchmarkProjectEncode(b *testing.B) {
	for _, count := range []int{1, 44, 104} {
		b.Run(fmt.Sprintf("vehicles_%d", count), func(b *testing.B) {
			snapshot := sizedSnapshot(b, count)
			update := mustProject(b, snapshot)
			encoded, err := Encode(update)
			if err != nil {
				b.Fatal(err)
			}
			b.ReportAllocs()
			b.ResetTimer()
			for index := 0; index < b.N; index++ {
				update, err := Project(snapshot)
				if err != nil {
					b.Fatal(err)
				}
				if _, err := Encode(update); err != nil {
					b.Fatal(err)
				}
			}
			b.ReportMetric(float64(len(encoded)), "payload_bytes")
		})
	}
}

func BenchmarkDecode(b *testing.B) {
	for _, count := range []int{1, 44, 104} {
		b.Run(fmt.Sprintf("vehicles_%d", count), func(b *testing.B) {
			encoded, err := Encode(mustProject(b, sizedSnapshot(b, count)))
			if err != nil {
				b.Fatal(err)
			}
			b.ReportAllocs()
			b.ResetTimer()
			for index := 0; index < b.N; index++ {
				if _, err := Decode(encoded); err != nil {
					b.Fatal(err)
				}
			}
			b.ReportMetric(float64(len(encoded)), "payload_bytes")
		})
	}
}
