package driver

// ID is the stable identifier of one compiled simulator driver.
type ID string

// Capability identifies one acquisition facility. A Descriptor lists compiled
// support; RuntimeSnapshot lists the subset currently available.
type Capability string

// Descriptor is immutable catalog metadata copied by DriverManager on input
// and output. Priority is compared descending; ID breaks equal-priority ties.
type Descriptor struct {
	ID           ID
	Priority     int
	Capabilities []Capability
}

// RuntimeSnapshot reports the current health and capabilities of one running
// driver. Capabilities may shrink while a channel is degraded and must not be
// inferred from the compiled Descriptor.
type RuntimeSnapshot struct {
	State        State
	Capabilities []Capability
}
