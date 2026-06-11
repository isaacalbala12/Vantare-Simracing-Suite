import { useRef, useState, useCallback, type ReactNode } from "react";
import type { Rect } from "../lib/profile";

type WidgetHostProps = {
  id: string;
  position: Rect; // window-local coordinates
  editMode: boolean;
  onDragEnd?: (id: string, newPos: Rect) => void;
  children: ReactNode;
};

export function WidgetHost({ id, position, editMode, onDragEnd, children }: WidgetHostProps) {
  const [dragging, setDragging] = useState(false);
  const dragStart = useRef<{ mx: number; my: number; wx: number; wy: number } | null>(null);

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (!editMode) return;
      e.preventDefault();
      dragStart.current = { mx: e.clientX, my: e.clientY, wx: position.x, wy: position.y };
      setDragging(true);
    },
    [editMode, position.x, position.y],
  );

  const handleMouseMove = useCallback(
    (e: React.MouseEvent) => {
      if (!dragging || !dragStart.current) return;
      const dx = e.clientX - dragStart.current.mx;
      const dy = e.clientY - dragStart.current.my;
      const el = document.getElementById(`widget-${id}`);
      if (el) {
        el.style.left = `${dragStart.current.wx + dx}px`;
        el.style.top = `${dragStart.current.wy + dy}px`;
      }
    },
    [dragging, id],
  );

  const handleMouseUp = useCallback(
    (e: React.MouseEvent) => {
      if (!dragging || !dragStart.current) return;
      const dx = e.clientX - dragStart.current.mx;
      const dy = e.clientY - dragStart.current.my;
      setDragging(false);
      dragStart.current = null;
      onDragEnd?.(id, {
        x: position.x + dx,
        y: position.y + dy,
        w: position.w,
        h: position.h,
      });
    },
    [dragging, id, position, onDragEnd],
  );

  return (
    <div
      id={`widget-${id}`}
      className={`absolute ${editMode ? "pointer-events-auto cursor-move" : "pointer-events-none"}`}
      style={{
        left: `${position.x}px`,
        top: `${position.y}px`,
        width: `${position.w}px`,
        height: `${position.h}px`,
      }}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
    >
      {editMode && (
        <div className="absolute -top-5 left-0 text-[10px] text-white/50 font-mono pointer-events-none select-none">
          {id}
        </div>
      )}
      {editMode && (
        <div className="absolute inset-0 border border-dashed border-white/30 rounded pointer-events-none" />
      )}
      {children}
    </div>
  );
}
