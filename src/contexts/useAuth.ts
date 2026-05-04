// =============================================================================
// FILE: src/contexts/useAuth.ts
// =============================================================================
// PURPOSE: Custom hook to consume the AuthContext.
//
// This is a convenience hook that wraps useContext(AuthContext) with
// a safety check. It throws a descriptive error if used outside
// the AuthProvider, catching developer mistakes early.
//
// USAGE:
//   const { user, login, logout } = useAuth();
//
// This hook is used by:
//   - App.tsx (to check if user is authenticated)
//   - AuthPage.tsx (to access the login function)
//   - Header.tsx (to display user info)
//   - SettingsPage.tsx (to check admin role)
// =============================================================================

import { useContext } from "react";
import { AuthContext, type AuthContextType } from "./AuthContext";

/**
 * Custom hook that provides access to the authentication context.
 * Returns user state, login/logout functions, and loading/error states.
 * @throws Error if used outside of AuthProvider
 */
export function useAuth(): AuthContextType {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
