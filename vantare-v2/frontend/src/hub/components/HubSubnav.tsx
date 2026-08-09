import { useContext, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { HubSubnavSlotContext } from "./hub-subnav-slot";

/**
 * A page's own navigation, rendered attached under the global nav.
 *
 * A page cannot reach outside ScrollableMain on its own, and lifting the
 * active-section state up to HubApp would move a page's concern into the
 * shell. So the shell leaves a slot and the page fills it from where its state
 * already lives.
 *
 * With no slot -- a page rendered on its own, as the tests do -- the bar
 * renders in place instead of vanishing.
 */
export function HubSubnav({ children }: { children: ReactNode }) {
  const slot = useContext(HubSubnavSlotContext);

  const bar = (
    <div className="glass-panel border-b border-white/5">
      <div className="max-w-[1920px] mx-auto px-3 sm:px-6 lg:pl-[84px]">{children}</div>
    </div>
  );

  return slot ? createPortal(bar, slot) : bar;
}
