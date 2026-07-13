package launcher

// DefaultLMUSteamAppID is the official Steam AppID for Le Mans Ultimate.
const DefaultLMUSteamAppID uint32 = 2399420

// KnownApp is the legacy discovery shape. Keep it as an alias while callers
// migrate to CatalogApp so there is no second official-app definition.
type KnownApp = CatalogApp

var KnownApps = catalogToKnownApps(OfficialCatalog)

var KnownAppsByID = indexKnownApps(KnownApps)
