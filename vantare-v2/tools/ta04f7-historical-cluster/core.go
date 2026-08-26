package main

import (
	"crypto/hmac"
	"crypto/sha256"
	"encoding/binary"
	"errors"
	"math"
	"sort"
	"time"
)

const logicalLimit uint64 = 512 << 20

type InventoryItem struct {
	ID                         string
	Modified                   time.Time
	Size                       uint64
	Regular, WALAbsent, Stable bool
}

func inventoryDigest(key [32]byte, in []InventoryItem) [32]byte {
	v := append([]InventoryItem(nil), in...)
	sort.SliceStable(v, func(i, j int) bool {
		a, b := v[i], v[j]
		if !a.Modified.Equal(b.Modified) {
			return a.Modified.Before(b.Modified)
		}
		if a.Size != b.Size {
			return a.Size < b.Size
		}
		return a.ID < b.ID
	})
	h := hmac.New(sha256.New, key[:])
	h.Write([]byte("TA-04F7/inventory/v1\x00"))
	var b [8]byte
	binary.LittleEndian.PutUint64(b[:], uint64(len(v)))
	h.Write(b[:])
	for _, x := range v {
		binary.LittleEndian.PutUint64(b[:], uint64(len(x.ID)))
		h.Write(b[:])
		h.Write([]byte(x.ID))
		binary.LittleEndian.PutUint64(b[:], uint64(x.Modified.UTC().UnixNano()))
		h.Write(b[:])
		binary.LittleEndian.PutUint64(b[:], x.Size)
		h.Write(b[:])
		for _, z := range []bool{x.Regular, x.WALAbsent, x.Stable} {
			if z {
				h.Write([]byte{1})
			} else {
				h.Write([]byte{0})
			}
		}
	}
	var out [32]byte
	copy(out[:], h.Sum(nil))
	return out
}

type Point struct{ X, Y float64 }

func finite(x float64) bool { return !math.IsNaN(x) && !math.IsInf(x, 0) }
func alignRigid(q, p []Point) ([]Point, error) {
	if len(q) != len(p) || len(q) == 0 {
		return nil, errors.New("rigid cardinality")
	}
	n := float64(len(q))
	var qb, pb Point
	for i := range q {
		if !finite(q[i].X) || !finite(q[i].Y) || !finite(p[i].X) || !finite(p[i].Y) {
			return nil, errors.New("nonfinite")
		}
		qb.X += q[i].X
		qb.Y += q[i].Y
		pb.X += p[i].X
		pb.Y += p[i].Y
	}
	qb.X /= n
	qb.Y /= n
	pb.X /= n
	pb.Y /= n
	var sqq, spp, a, b float64
	for i := range q {
		qx, qy := q[i].X-qb.X, q[i].Y-qb.Y
		px, py := p[i].X-pb.X, p[i].Y-pb.Y
		sqq += qx*qx + qy*qy
		spp += px*px + py*py
		a += qx*px + qy*py
		b += qx*py - qy*px
	}
	e := n * 1e-12
	if math.Min(sqq, spp) <= e || a*a+b*b <= e*e {
		return nil, errors.New("degenerate")
	}
	th := math.Atan2(b, a)
	if b == 0 && a > 0 {
		th = 0
	}
	c, s := math.Cos(th), math.Sin(th)
	tx := pb.X - (c*qb.X - s*qb.Y)
	ty := pb.Y - (s*qb.X + c*qb.Y)
	out := make([]Point, len(q))
	for i, z := range q {
		out[i] = Point{c*z.X - s*z.Y + tx, s*z.X + c*z.Y + ty}
		if !finite(out[i].X) || !finite(out[i].Y) {
			return nil, errors.New("overflow")
		}
	}
	return out, nil
}
func median(v []float64) (float64, error) {
	if len(v) == 0 {
		return 0, errors.New("empty")
	}
	x := append([]float64(nil), v...)
	for _, z := range x {
		if !finite(z) {
			return 0, errors.New("nonfinite")
		}
	}
	sort.Float64s(x)
	m := len(x) / 2
	if len(x)%2 == 1 {
		return x[m], nil
	}
	lo, hi := x[m-1], x[m]
	var r float64
	if math.Signbit(lo) != math.Signbit(hi) {
		r = (lo + hi) / 2
	} else {
		r = lo + (hi-lo)/2
	}
	if !finite(r) {
		return 0, errors.New("overflow")
	}
	return r, nil
}
func slotPass(p95, p99 float64) bool     { return finite(p95) && finite(p99) && p95 <= 5 && p99 <= 10 }
func recordingPass(pass, total int) bool { return total > 0 && pass*5 >= total*4 }
func decision(e, p, f, x int) string {
	if e == 0 {
		return "stop_insufficient"
	}
	if f > 0 {
		return "technical_no_go_local_shape"
	}
	if x > 0 {
		return "stop_insufficient"
	}
	if p == 1 {
		return "technical_go_local_shape_local_only"
	}
	return "technical_go_local_shape"
}
func confidence(n int) string {
	if n <= 1 {
		return "none"
	}
	if n == 2 {
		return "limited"
	}
	return "provisional"
}

func checkedAdd(a, b uint64) (uint64, bool) {
	if a > ^uint64(0)-b {
		return 0, false
	}
	return a + b, true
}
func checkedMul(a, b uint64) (uint64, bool) {
	if a != 0 && b > ^uint64(0)/a {
		return 0, false
	}
	return a * b, true
}

type ResourceAccountant struct{ Live, Max uint64 }

func (r *ResourceAccountant) Add(n uint64) error {
	v, ok := checkedAdd(r.Live, n)
	if !ok || v > logicalLimit {
		return errors.New("resource_cap")
	}
	r.Live = v
	if v > r.Max {
		r.Max = v
	}
	return nil
}
func (r *ResourceAccountant) Release(n uint64) {
	if n >= r.Live {
		r.Live = 0
	} else {
		r.Live -= n
	}
}

type Retention struct{ Live bool }

func (r *Retention) Begin() error {
	if r.Live {
		return errors.New("recording retained")
	}
	r.Live = true
	return nil
}
func (r *Retention) Release() { r.Live = false }

type logicalBudgetV1 struct {
	account    ResourceAccountant
	limit      uint64
	allocFloat func(int, int) []float64
	allocEvent func(int, int) []LapEvent
}

const (
	logicalInt64          uint64 = 8
	logicalFloat64        uint64 = 8
	logicalBool           uint64 = 1
	logicalStructOverhead uint64 = 32
	logicalSliceHeader    uint64 = 24
	lapEventStride               = logicalInt64 + logicalFloat64 + logicalFloat64 + logicalBool + logicalBool + logicalStructOverhead
	logicalMapBase        uint64 = 64
)

func logicalStringBytes(n uint64) (uint64, error) {
	v, ok := checkedAdd(n, 16)
	if !ok {
		return 0, errLogicalCap
	}
	return v, nil
}
func logicalSliceBytes(c, s uint64) (uint64, error) {
	v, ok := checkedMul(c, s)
	if !ok {
		return 0, errLogicalCap
	}
	v, ok = checkedAdd(v, logicalSliceHeader)
	if !ok {
		return 0, errLogicalCap
	}
	return v, nil
}
func logicalStructBytes(fields uint64) (uint64, error) {
	v, ok := checkedAdd(fields, logicalStructOverhead)
	if !ok {
		return 0, errLogicalCap
	}
	return v, nil
}
func logicalMapEntryBytes(keyLen, valueFields uint64) (uint64, error) {
	k, e := logicalStringBytes(keyLen)
	if e != nil {
		return 0, e
	}
	n, ok := checkedAdd(k, valueFields)
	if !ok {
		return 0, errLogicalCap
	}
	n, ok = checkedAdd(n, logicalStructOverhead)
	if !ok {
		return 0, errLogicalCap
	}
	return n, nil
}
func logicalIntMapEntryBytes(valueWidth uint64) (uint64, error) {
	n, ok := checkedAdd(logicalInt64, valueWidth)
	if !ok {
		return 0, errLogicalCap
	}
	n, ok = checkedAdd(n, logicalStructOverhead)
	if !ok {
		return 0, errLogicalCap
	}
	return n, nil
}

var errLogicalCap = errors.New("resource_cap")

func newLogicalBudgetV1(limit uint64) *logicalBudgetV1 {
	return &logicalBudgetV1{limit: limit,
		allocFloat: func(n, c int) []float64 { return make([]float64, n, c) },
		allocEvent: func(n, c int) []LapEvent { return make([]LapEvent, n, c) },
	}
}
func (b *logicalBudgetV1) reserve(n uint64) error {
	if b == nil {
		return errLogicalCap
	}
	v, ok := checkedAdd(b.account.Live, n)
	if !ok || v > b.limit {
		return errLogicalCap
	}
	b.account.Live = v
	if v > b.account.Max {
		b.account.Max = v
	}
	return nil
}
func (b *logicalBudgetV1) release(n uint64) { b.account.Release(n) }

func (b *logicalBudgetV1) growFloats(old []float64, owned *uint64) ([]float64, error) {
	newCap := cap(old) + pageSize
	backing, ok := checkedMul(uint64(newCap), logicalFloat64)
	if !ok {
		return nil, errLogicalCap
	}
	newBytes, ok := checkedAdd(backing, logicalSliceHeader)
	if !ok || b.reserve(newBytes) != nil {
		return nil, errLogicalCap
	}
	next := b.allocFloat(len(old), newCap)
	copy(next, old)
	b.release(*owned)
	*owned = newBytes
	return next, nil
}
func (b *logicalBudgetV1) growEvents(old []LapEvent, owned *uint64) ([]LapEvent, error) {
	newCap := cap(old) + pageSize
	backing, ok := checkedMul(uint64(newCap), lapEventStride)
	if !ok {
		return nil, errLogicalCap
	}
	newBytes, ok := checkedAdd(backing, logicalSliceHeader)
	if !ok || b.reserve(newBytes) != nil {
		return nil, errLogicalCap
	}
	next := b.allocEvent(len(old), newCap)
	copy(next, old)
	b.release(*owned)
	*owned = newBytes
	return next, nil
}
