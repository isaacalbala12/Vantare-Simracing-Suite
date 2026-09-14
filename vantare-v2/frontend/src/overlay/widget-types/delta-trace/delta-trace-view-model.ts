import type { WidgetViewModelBase } from "../../core/widget-definition";
export type DeltaTraceViewModel = WidgetViewModelBase & { type:"delta-trace"; points:readonly { capturedAt:number; deltaSeconds:number }[]; currentDelta?:number; trend:"gaining"|"losing"|"stable"|"unknown"; sectorDeltas:readonly number[]; turnInsight?:string; trackPath?:string; showSectors:boolean; showTrackMap:boolean };
