"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

// Hook: holds the printable JSX. Call `print(jsx)` to render it into the
// print layer and open the browser print dialog.
export function usePrint() {
  const [node, setNode] = useState(null);
  const print = (jsx) => setNode(jsx);
  const clear = () => setNode(null);
  return { node, print, clear };
}

// Renders `node` into a portal on document.body and calls window.print().
// The print CSS in globals.css hides everything except `.print-root`.
export function PrintPortal({ node, onDone }) {
  useEffect(() => {
    if (!node) return undefined;
    const timer = setTimeout(() => window.print(), 120);
    const done = () => onDone?.();
    window.addEventListener("afterprint", done);
    return () => {
      clearTimeout(timer);
      window.removeEventListener("afterprint", done);
    };
  }, [node, onDone]);

  if (!node) return null;
  return createPortal(<div className="print-root">{node}</div>, document.body);
}