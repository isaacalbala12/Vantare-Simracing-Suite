package ptt

import (
	"errors"
	"fmt"
	"sort"
	"strings"
	"unicode"
	"unicode/utf8"
)

const ContractVersionV1 = "engineer.ptt.v1"

var ErrInvalidBinding = errors.New("engineer PTT binding is invalid")

type DeviceKind string

const (
	DeviceKeyboard DeviceKind = "keyboard"
	DeviceGamepad  DeviceKind = "gamepad"
	DeviceHID      DeviceKind = "hid"
)

type BindingScope string

const (
	ScopeGlobal BindingScope = "global"
	ScopeLocal  BindingScope = "local"
)

type Binding struct {
	DeviceKind DeviceKind   `json:"device_kind"`
	DeviceID   string       `json:"device_id"`
	Control    string       `json:"control"`
	Scope      BindingScope `json:"scope"`
}

type Assignment struct {
	Name    string
	Binding Binding
}

type Conflict struct {
	AssignmentName string `json:"assignment_name"`
}

func NormalizeBinding(binding Binding) (Binding, error) {
	if containsControl(binding.DeviceID) || containsControl(binding.Control) {
		return Binding{}, ErrInvalidBinding
	}
	binding.DeviceID = strings.ToLower(strings.TrimSpace(binding.DeviceID))
	binding.Control = strings.ToLower(strings.TrimSpace(binding.Control))
	switch binding.DeviceKind {
	case DeviceKeyboard, DeviceGamepad, DeviceHID:
	default:
		return Binding{}, fmt.Errorf("%w: device kind %q", ErrInvalidBinding, binding.DeviceKind)
	}
	switch binding.Scope {
	case ScopeGlobal, ScopeLocal:
	default:
		return Binding{}, fmt.Errorf("%w: scope %q", ErrInvalidBinding, binding.Scope)
	}
	if !validOpaqueToken(binding.DeviceID) || !validOpaqueToken(binding.Control) {
		return Binding{}, ErrInvalidBinding
	}
	return binding, nil
}

func FindBindingConflicts(desired Binding, assignments []Assignment) ([]Conflict, error) {
	normalized, err := NormalizeBinding(desired)
	if err != nil {
		return nil, err
	}
	conflicts := make([]Conflict, 0)
	for _, assignment := range assignments {
		if !validLabel(assignment.Name) {
			return nil, ErrInvalidBinding
		}
		candidate, err := NormalizeBinding(assignment.Binding)
		if err != nil {
			return nil, err
		}
		if samePhysicalControl(normalized, candidate) {
			conflicts = append(conflicts, Conflict{AssignmentName: assignment.Name})
		}
	}
	sort.Slice(conflicts, func(i, j int) bool {
		return conflicts[i].AssignmentName < conflicts[j].AssignmentName
	})
	return conflicts, nil
}

func samePhysicalControl(first, second Binding) bool {
	return first.DeviceKind == second.DeviceKind && first.DeviceID == second.DeviceID && first.Control == second.Control
}

func validOpaqueToken(value string) bool {
	if value == "" || len(value) > 64 || !utf8.ValidString(value) {
		return false
	}
	for _, character := range value {
		if (character >= 'a' && character <= 'z') || (character >= '0' && character <= '9') {
			continue
		}
		switch character {
		case '.', '_', '-':
			continue
		default:
			return false
		}
	}
	return true
}

func validLabel(value string) bool {
	return value == strings.TrimSpace(value) && value != "" && len(value) <= 128 && utf8.ValidString(value) && !containsControl(value)
}

func containsControl(value string) bool {
	for _, character := range value {
		if unicode.IsControl(character) {
			return true
		}
	}
	return false
}
