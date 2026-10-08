/** A child restart invalidates the previous Rust-owned ACK session. */
export class OverlayTransportUnavailableError extends Error {
  constructor(message = "overlay telemetry transport unavailable") {
    super(message);
  }
}
