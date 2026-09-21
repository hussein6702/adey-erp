"use client";

import { useEffect, useRef, useState } from "react";

function resolveInitial(initialValue) {
  return typeof initialValue === "function" ? initialValue() : initialValue;
}

export function usePersistentState(key, initialValue) {
  const [value, setValue] = useState(() => resolveInitial(initialValue));
  const hydrated = useRef(false);

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(key);
      if (saved !== null) {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setValue(JSON.parse(saved));
      }
    } catch {
      // Ignore invalid or unavailable local storage.
    } finally {
      hydrated.current = true;
    }
  }, [key]);

  useEffect(() => {
    if (!hydrated.current) return;
    try {
      window.localStorage.setItem(key, JSON.stringify(value));
    } catch {
      // Ignore quota and private-mode storage failures.
    }
  }, [key, value]);

  const clear = () => {
    const next = resolveInitial(initialValue);
    setValue(next);
    try {
      window.localStorage.removeItem(key);
    } catch {
      // Ignore unavailable local storage.
    }
  };

  return [value, setValue, clear];
}
