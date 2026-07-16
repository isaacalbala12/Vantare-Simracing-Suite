// Offsets for the $rFactor2SMMP_PitInfo$ shared memory buffer.
//
// Source: CrewChiefV4/RF2/RF2Data.cs — rF2PitInfo struct with
// [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Ansi, Pack = 4)].
//
// The C# struct only declares mVersionUpdateBegin, mVersionUpdateEnd, and
// mPitMneu. The LMU SMMP plugin extends the buffer with mPitStopActive,
// mPitGroup, and additional pit-related fields not exposed by CC.
package lmu

// PitInfo memory constants.
const (
	PitInfoMemoryName = "$rFactor2SMMP_PitInfo$"
	PitInfoMemorySize = 16384
)

// rF2PitInfo absolute offsets (pack=4).
const (
	PitInfoVersionBegin = 0 // uint32 (4 bytes)
	PitInfoVersionEnd   = 4 // uint32 (4 bytes)
	PitMenuOffset       = 8 // rF2PitMenu starts here (332 bytes)
)

// rF2PitMenu field offsets (relative to PitMenuOffset = 8).
const (
	PitMenuCategoryIndex = 0  // int32 (4 bytes)
	PitMenuCategoryName  = 4  // byte[32] — null-terminated ASCII
	PitMenuChoiceIndex   = 36 // int32 (4 bytes)
	PitMenuChoiceString  = 40 // byte[32] — null-terminated ASCII
	PitMenuNumChoices    = 72 // int32 (4 bytes)
	PitMenuExpansion     = 76 // byte[256]
	// Total PitMenu size: 332 bytes (offsets 0..331)
)

// Extended rF2PitInfo fields (beyond the CC C# struct, present in LMU SMMP).
const (
	PitStopActiveOffset = 340 // byte — 0 = no stop, 1 = pit stop in progress
	PitGroupOffset      = 341 // byte[24] — pit group/stall identifier
	PitLapDistOffset    = 365 // float32 — pit lane entrance lap distance
)
