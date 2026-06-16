import { useEffect, useRef } from "react";
import { applyTelemetryUpdate, clearRuntimeTelemetry } from "./telemetry-ref";
import { generateAnimatedTelemetry } from "../overlay/widgets/mock-telemetry";

export function useDemoMode(enabled: boolean, hz: number, inPit = false) {
	const startRef = useRef(Date.now());
	const wasEnabledRef = useRef(false);

	useEffect(() => {
		if (!enabled) {
			if (wasEnabledRef.current) {
				clearRuntimeTelemetry();
			}
			wasEnabledRef.current = false;
			return;
		}
		wasEnabledRef.current = true;
		startRef.current = Date.now();
		const interval = setInterval(() => {
			const elapsed = Date.now() - startRef.current;
			applyTelemetryUpdate(generateAnimatedTelemetry(elapsed, inPit));
		}, 1000 / hz);
		return () => clearInterval(interval);
	}, [enabled, hz, inPit]);
}
