// =============================================================================
// FILE: src/components/Header.tsx
// =============================================================================
// PURPOSE: Top navigation header bar displayed on all dashboard pages.
//
// Shows:
//   - App branding ("CRAYvings Monitoring System")
//   - Current user's name and role (admin or user)
//   - Logout button
//
// MOUNTED IN: App.tsx's DashboardLayout component
// =============================================================================

import { User, Shield } from "lucide-react";
import type { AuthUser } from "../types";

interface HeaderProps {
  user: AuthUser;
  onLogout: () => void;
}

/**
 * Top header bar component displayed on every dashboard page.
 * Shows the app name, user info with role indicator, and logout button.
 * Admin users see a shield icon, regular users see a person icon.
 */
export default function Header({ user, onLogout }: HeaderProps) {
  return (
    <div className="h-16 bg-gradient-to-r from-[#d94b1e] to-[#ef6a2e] text-white flex items-center justify-between px-5 shadow-md">
      {/* App branding */}
      <div>
        <div className="text-xl font-extrabold">CRAYvings Monitoring System</div>
        <div className="text-[11px] opacity-90">Smart aquaculture monitoring dashboard</div>
      </div>

      {/* User info and logout button */}
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2 font-bold text-sm">
          {user.role === "admin" ? <Shield size={16} /> : <User size={16} />}
          <span className="hidden sm:inline">{user.name}</span>
          <span className="text-xs opacity-75 capitalize">({user.role})</span>
        </div>
        <button
          onClick={onLogout}
          className="text-xs bg-white/20 hover:bg-white/30 px-3 py-1.5 rounded-md font-semibold transition-colors"
        >
          Logout
        </button>
      </div>
    </div>
  );
}
