import { StrategyEntry } from "../../qa/strategy-entry";
import { Upcoming } from "../upcoming/Upcoming";

export default function Screen() {
  return <StrategyEntry fallback={<Upcoming module="strategy" />} />;
}
