# Telemetry Core signal catalog

Generated deterministically from the Go ledger. IDs are never reused.

| ID | Key | Domain | Unit | Range |
| ---: | --- | --- | --- | --- |
| 1 | `identity.driver_name` | identity | unsupported | unsupported |
| 2 | `session.type` | session | unsupported | unsupported |
| 3 | `vehicle.engine_rpm` | vehicle | rpm | unknown |
| 4 | `controls.throttle` | controls | ratio | [0,1] |
| 5 | `controls.brake` | controls | ratio | [0,1] |
| 6 | `controls.clutch` | controls | ratio | [0,1] |
| 7 | `wheels.brake_temperature` | wheels | celsius | unknown |
| 8 | `energy.fuel_amount` | energy | unknown | unknown |
| 9 | `pit.stop_count` | pit | count | unknown |
| 10 | `standings.position` | standings | count | unknown |
| 11 | `weather.ambient_temperature` | weather | unknown | unknown |
| 12 | `spatial.position` | spatial | unknown | unknown |

## Retired IDs

None.
