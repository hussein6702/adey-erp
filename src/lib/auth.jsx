"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

const STORAGE_KEY = "adey_erp_user";

export async function hashPassword(password) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(password));
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [access, setAccess] = useState({}); // link_key -> boolean (for the logged-in department)

  // Load session from localStorage on mount
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (raw) setUser(JSON.parse(raw));
    } catch {
      /* ignore */
    }
    setLoading(false);
  }, []);

  const loadAccess = useCallback(async (u) => {
    if (!u) {
      setAccess({});
      return;
    }
    if (u.role === "root") {
      setAccess({}); // roots see everything; empty map = allow all
      return;
    }
    const { data } = await supabase
      .from("access_controls")
      .select("link_key, enabled")
      .eq("department", u.department);
    const map = {};
    for (const row of data || []) map[row.link_key] = row.enabled;
    setAccess(map);
  }, []);

  useEffect(() => {
    if (loading) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadAccess(user);
  }, [loading, user, loadAccess]);

  const login = async (username, password) => {
    const clean = String(username || "").trim();
    if (!clean || !password) return { error: "Enter your username and password" };

    const { data, error } = await supabase
      .from("users")
      .select("id, username, full_name, role, department, password, is_active")
      .ilike("username", clean)
      .single();

    if (error || !data) return { error: "Invalid username or password" };
    if (!data.is_active) return { error: "This account has been deactivated" };

    const hash = await hashPassword(password);
    if (hash !== data.password) return { error: "Invalid username or password" };

    const u = {
      id: data.id,
      username: data.username,
      full_name: data.full_name,
      role: data.role,
      department: data.department,
    };
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(u));
    } catch {
      /* ignore */
    }
    setUser(u);
    return { user: u };
  };

  const logout = () => {
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      /* ignore */
    }
    setUser(null);
  };

  const isRoot = user?.role === "root";

  return (
    <AuthContext.Provider value={{ user, loading, access, login, logout, isRoot }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}