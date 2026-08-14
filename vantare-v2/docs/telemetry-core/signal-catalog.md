# Telemetry Core signal catalog

Generated deterministically from the Go ledger. IDs are never reused.

| ID | Key | Domain | Unit | Range | Ledger action | Notes |
| ---: | --- | --- | --- | --- | --- | --- |
| 1 | `identity.driver_name` | identity | text | unsupported | hardened | Display label only; never runtime identity. |
| 2 | `session.type` | session | unsupported | [1,5] | hardened | Known canonical session enum values only. |
| 3 | `vehicle.engine_rpm` | vehicle | rpm | unknown | reused | Existing canonical signal reused unchanged. |
| 4 | `controls.throttle` | controls | ratio | [0,1] | reused | Existing normalized control signal reused unchanged. |
| 5 | `controls.brake` | controls | ratio | [0,1] | reused | Existing normalized control signal reused unchanged. |
| 6 | `controls.clutch` | controls | ratio | [0,1] | reused | Existing normalized control signal reused unchanged. |
| 7 | `wheels.brake_temperature` | wheels | celsius | unknown | unproduced-existing | Existing contract; not produced by ISA-129. |
| 8 | `energy.fuel_amount` | energy | liters | [0,+inf) | hardened | Liters; valid jointly only when 0 <= amount <= capacity. |
| 9 | `pit.stop_count` | pit | count | [0,+inf) | hardened | Pit-stop count cannot be negative. |
| 10 | `standings.position` | standings | count | [1,104] | hardened | One-based position within the demonstrated LMU vehicle bound. |
| 11 | `weather.ambient_temperature` | weather | unknown | unknown | unproduced-existing | Existing contract; not produced by ISA-129. |
| 12 | `spatial.position` | spatial | meters | unknown | hardened | World-space XYZ in meters; legitimate zero is preserved. |
| 13 | `session.lap_number` | session | count | [0,+inf) | hardened | Session lap number preserves legitimate zero. |
| 14 | `vehicle.gear` | vehicle | unsupported | unknown | reused | Existing canonical gear representation reused unchanged. |
| 15 | `vehicle.team_name` | vehicle | unsupported | unsupported | unproduced-existing | Existing contract; not produced by ISA-129. |
| 16 | `vehicle.name` | vehicle | text | unsupported | hardened | Canonical vehicle display name. |
| 17 | `standings.completed_laps` | standings | count | [0,+inf) | hardened | Completed laps preserve legitimate zero. |
| 18 | `spatial.orientation` | spatial | unsupported | unknown | hardened | Right-handed orthonormal matrix; columns map local left/up/rearward axes into world space. |
| 19 | `session.source_time` | session | seconds | [0,+inf) | hardened | Non-negative timestamp supplied by the source. |
| 20 | `session.track_name` | session | text | unsupported | hardened | Canonical track display name. |
| 21 | `session.vehicle_count` | session | count | [0,104] | reused | Existing demonstrated LMU vehicle-count bound. |
| 22 | `vehicle.player_present` | vehicle | boolean | unsupported | reused | Existing player-presence signal reused unchanged. |
| 23 | `vehicle.speed_mps` | vehicle | m/s | [0,+inf) | hardened | Canonical non-negative vehicle speed. |
| 24 | `pit.in_pit` | pit | boolean | unsupported | reused | Existing pit-state signal reused unchanged. |
| 25 | `session.end_time` | session | seconds | [0,+inf) | appended | Same clock as source time; valid only when end >= current. |
| 26 | `session.remaining_time` | session | seconds | [0,+inf) | appended | Derived as end-current only from fresh ordered inputs. |
| 27 | `session.maximum_laps` | session | count | [0,+inf) | appended | Canonical maximum session laps; zero remains present. |
| 28 | `vehicle.class` | vehicle | text | unsupported | appended | Canonical vehicle class display label. |
| 29 | `standings.sector` | standings | count | [1,3] | appended | Known track sector enum values only. |
| 30 | `standings.lap_distance` | standings | meters | [0,+inf) | appended | Distance progressed through the current lap. |
| 31 | `standings.best_lap_time` | standings | seconds | [0,+inf) | appended | Best completed lap duration; present only when finite and > 0. |
| 32 | `standings.last_lap_time` | standings | seconds | [0,+inf) | appended | Most recent completed lap duration; present only when finite and > 0. |
| 33 | `standings.estimated_lap_time` | standings | seconds | [0,+inf) | appended | Observed estimate; present only when finite and > 0. |
| 34 | `standings.penalty_count` | standings | count | [0,+inf) | appended | Current non-negative penalty count. |
| 35 | `standings.time_behind_leader` | standings | seconds | [0,+inf) | appended | Time gap behind the leader as supplied. |
| 36 | `standings.laps_behind_leader` | standings | count | [0,+inf) | appended | Lap gap behind the leader as supplied. |
| 37 | `standings.time_behind_next` | standings | seconds | [0,+inf) | appended | Time gap behind the next classified vehicle. |
| 38 | `standings.laps_behind_next` | standings | count | [0,+inf) | appended | Lap gap behind the next classified vehicle. |
| 39 | `standings.relative_time_gap` | standings | seconds | unknown | appended | Signed time gap relative to the player. |
| 40 | `standings.relative_lap_delta` | standings | count | unknown | appended | Signed lap delta relative to the player. |
| 41 | `energy.fuel_capacity` | energy | liters | [0,+inf) | appended | Must be finite and > 0 when the joint fuel value is present. |
| 42 | `session.self_delta_seconds` | session | seconds | unknown | appended | Signed player delta against the declared reference. |
| 43 | `session.self_delta_reference` | session | text | unsupported | appended | Known canonical self-delta reference enum only. |
| 44 | `spatial.local_velocity` | spatial | m/s | unknown | appended | Vehicle-local XYZ velocity in m/s; LMU axes are +X left, +Y up and +Z rearward. |
| 45 | `session.native_delta_best` | session | seconds | unknown | appended | Signed simulator-provided player delta to the personal best lap; validity remains explicit. |
| 46 | `session.previous_lap_delta` | session | seconds | unknown | appended | Signed player delta against the most recent complete valid lap observed in the current session. |

## Tombstoned IDs

None.
