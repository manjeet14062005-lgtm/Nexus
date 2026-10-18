import { createContext } from "react";

// Global/internal roles are resolved from Supabase Auth metadata or the
// server-managed roles collection. The old hard-coded admin UID is intentionally
// removed from the application bundle.
export const GLOBAL_ADMIN_ROLE = "admin";
export const OTP_SERVER_URL = process.env.REACT_APP_OTP_SERVER_URL || "http://localhost:3001";
export const NotifContext = createContext({ notifs: [], unread: 0, markRead: () => {} });
export const SIDEBAR_W = 240;
export const XP_ACTIONS = [
  { id: "registered",    label: "Completed Registration",  xp: 100, icon: "📝" },
  { id: "photo",         label: "Uploaded Profile Photo",  xp: 30,  icon: "📸" },
  { id: "phone",         label: "Verified Phone Number",   xp: 50,  icon: "📱" },
  { id: "linkedin",      label: "Added LinkedIn Profile",  xp: 20,  icon: "🔗" },
  { id: "bio",           label: "Wrote a Bio",             xp: 20,  icon: "✍️" },
  { id: "daily_login",   label: "Daily Login Bonus",       xp: 10,  icon: "🔥" },
];

export const XP_LEVELS = [
  { level: 1, title: "Newcomer",  min: 0,   max: 99,   color: "#9e9e9e", icon: "🌱" },
  { level: 2, title: "Explorer",  min: 100, max: 199,  color: "#6366F1", icon: "🔭" },
  { level: 3, title: "Member",    min: 200, max: 349,  color: "#10B981", icon: "⭐" },
  { level: 4, title: "Pro",       min: 350, max: 499,  color: "#F59E0B", icon: "🔥" },
  { level: 5, title: "Expert",    min: 500, max: 699,  color: "#8B5CF6", icon: "💎" },
  { level: 6, title: "Legend",    min: 700, max: 99999, color: "#EF4444", icon: "👑" },
];

export const PAGE_TITLES = {
  "/": "Registration",
  "/login": "Login",
  "/verify-email": "Verify Email",
  "/dashboard": "Overview",
  "/admin": "Admin Center",
  "/users": "User Management",
  "/analytics": "Analytics",
  "/activity": "Activity Logs",
  "/billing": "Billing",
  "/verification": "Verification",
  "/reports": "Reports",
  "/account": "Account",
  "/developer": "Developer Portal",
  "/notifications": "Notifications",
  "/globe": "3D Globe",
  "/settings": "Settings",
  "/terms": "Terms & Conditions",
  "/privacy": "Privacy Policy",
  "/workspace": "Team Workspace",
  "/advanced-analytics": "Advanced Analytics",
  "/gamification": "Gamification Hub",
  "/messages": "Messages",
  "/integrations": "Integrations",
  "/profile/:uid": "User Profile",
  "/ai-features": "Nexus Intelligence",
  "/workflows": "Workflows",
  "/security": "Advanced Security",
  "/support": "Support Center",
  "/admin/support": "Support Queue",
  "/status": "Nexus Status",
};
