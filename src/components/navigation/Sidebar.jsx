import { Link as RouterLink, useLocation } from "react-router-dom";
import { memo, useContext } from "react";
import { SIDEBAR_W, NotifContext } from "../../core/appConstants.js";
import AdminPanelSettingsIcon from "@mui/icons-material/AdminPanelSettings";
import AutoGraphIcon from "@mui/icons-material/AutoGraph";
import { Avatar, Box, Chip, Drawer, ListItemButton, ListItemIcon, ListItemText, Typography } from "@mui/material";
import ChatIcon from "@mui/icons-material/Chat";
import CodeIcon from "@mui/icons-material/Code";
import CreditCardIcon from "@mui/icons-material/CreditCard";
import DashboardIcon from "@mui/icons-material/Dashboard";
import FormatListBulletedIcon from "@mui/icons-material/FormatListBulleted";
import GroupsIcon from "@mui/icons-material/Groups";
import LoginIcon from "@mui/icons-material/Login";
import LogoutIcon from "@mui/icons-material/Logout";
import ManageAccountsIcon from "@mui/icons-material/ManageAccounts";
import { NEON } from "../../constants/theme";
import NotificationsActiveIcon from "@mui/icons-material/NotificationsActive";
import PublicIcon from "@mui/icons-material/Public";
import SecurityIcon from "@mui/icons-material/Security";
import SendIcon from "@mui/icons-material/Send";
import SettingsIcon from "@mui/icons-material/Settings";
import SmartToyIcon from "@mui/icons-material/SmartToy";
import WebhookIcon from "@mui/icons-material/Webhook";
import AssessmentOutlinedIcon from "@mui/icons-material/AssessmentOutlined";
import AutoFixHighIcon from "@mui/icons-material/AutoFixHigh";
import AccountCircleOutlinedIcon from "@mui/icons-material/AccountCircleOutlined";
import VerifiedUserIcon from "@mui/icons-material/VerifiedUser";
import HelpOutlineIcon from "@mui/icons-material/HelpOutline";
import { auth } from "../../lib/supabaseLegacy";
import { signOut } from "../../lib/supabaseAuth.js";



export const Sidebar = memo(function Sidebar({ user, userRole, open, onClose }) {
  const { unread } = useContext(NotifContext);
  const location = useLocation();
  const isAdmin = userRole === "admin";

  const NAV = [
    { section: "Console", items: [
      { path: "/register", icon: <SendIcon />, label: "Registration", show: !user },
      { path: "/login", icon: <LoginIcon />, label: "Login", show: !user },
      { path: "/dashboard", icon: <DashboardIcon />, label: "Overview", show: !!user },

      { path: "/verification", icon: <VerifiedUserIcon />, label: "Verification", show: !!user },
      { path: "/analytics", icon: <AutoGraphIcon />, label: "Analytics", show: !!user },
      { path: "/reports", icon: <AssessmentOutlinedIcon />, label: "Reports", show: !!user },
      { path: "/workflows", icon: <AutoFixHighIcon />, label: "Workflows", show: !!user },
      { path: "/integrations", icon: <WebhookIcon />, label: "Integrations", show: !!user },
      { path: "/developer", icon: <CodeIcon />, label: "Developer Portal", show: !!user },
      { path: "/ai-features", icon: <SmartToyIcon />, label: "Nexus Intelligence", show: !!user },
    ]},
    { section: "Workspace", items: [
      { path: "/workspace", icon: <GroupsIcon />, label: "Team Workspace", show: !!user },
      { path: "/billing", icon: <CreditCardIcon />, label: "Billing", show: !!user },
      { path: "/security", icon: <SecurityIcon />, label: "Security", show: !!user },
      { path: "/messages", icon: <ChatIcon />, label: "Messages", show: !!user },
      { path: "/notifications", icon: <NotificationsActiveIcon />, label: "Notifications", show: !!user, badge: unread },
      { path: "/account", icon: <AccountCircleOutlinedIcon />, label: "Account", show: !!user },
      { path: "/support", icon: <HelpOutlineIcon />, label: "Support", show: !!user },
    ]},
    { section: "Admin", items: [
      { path: "/admin", icon: <AdminPanelSettingsIcon />, label: "Admin Center", show: isAdmin },
      { path: "/users", icon: <ManageAccountsIcon />, label: "User Management", show: isAdmin },
      { path: "/activity", icon: <FormatListBulletedIcon />, label: "Activity Logs", show: isAdmin },

      { path: "/globe", icon: <PublicIcon />, label: "3D Globe", show: isAdmin },
      { path: "/settings", icon: <SettingsIcon />, label: "Settings", show: isAdmin },
      { path: "/admin/support", icon: <HelpOutlineIcon />, label: "Support Queue", show: isAdmin },
    ]},
  ].map((g) => ({ ...g, items: g.items.filter((n) => n.show) })).filter((g) => g.items.length > 0);

  const content = (
    <Box sx={{ display: "flex", flexDirection: "column", minHeight: "100%", p: 1.5 }}>
      {/* Logo */}
      <Box sx={{ px: 1, py: 2, mb: 1, display: "flex", alignItems: "center", gap: 1 }}>
        <Box component="img" src="/assets/nexus-mark.svg" alt="" sx={{ width: 26, height: 26, borderRadius: 1.5, objectFit: "cover" }} />
        <Typography sx={{ fontWeight: 800, fontSize: 17, letterSpacing: "-0.02em" }}>Nexus</Typography>
        <Typography sx={{ ml: "auto", fontSize: 12, letterSpacing: ".08em", color: "text.secondary", border: "1px solid", borderColor: "divider", px: .75, py: .25, borderRadius: 1 }}>CONSOLE</Typography>
      </Box>

      {/* Nav sections */}
      <Box component="nav" aria-label="Sidebar navigation" sx={{ flex: 1 }}>
        {NAV.map((group) => (
          <Box key={group.section} component={group.section === "Admin" ? "details" : "div"} sx={{ mb: 1.5 }}>
            <Typography component={group.section === "Admin" ? "summary" : "p"} sx={{ cursor: group.section === "Admin" ? "pointer" : "default", py: .75, px: 1.5, mb: 0.5, fontSize: 12, fontWeight: 600, letterSpacing: "0.06em", color: "text.secondary", opacity: 0.6 }}>
              {group.section}
            </Typography>
            {group.items.map((n) => {
              const active = location.pathname === n.path;
              return (
                <ListItemButton
                  key={n.path + n.label}
                  selected={active}
                  component={RouterLink}
                  to={n.path}
                  aria-current={active ? "page" : undefined}
                  onClick={() => { if (open) onClose(); }}
                  sx={{
                    minHeight: 40,
                    width: "calc(100% - 8px)",
                    mx: 0.5,
                    borderRadius: 1.5,
                    mb: 0.3,
                    gap: 1.2,
                    transition: "background-color 150ms ease",
                    "&.Mui-selected": {
                      background: "color-mix(in oklch, var(--nexus-brand) 14%, transparent)",
                      color: "var(--nexus-brand)",
                      boxShadow: "0 0 0 1px color-mix(in oklch, var(--nexus-brand) 8%, transparent) inset",
                    },
                    "&.Mui-selected .MuiListItemIcon-root": { color: NEON.blue },
                    "&:hover": { background: (t) => (t.palette.mode === "dark" ? "rgba(15,23,42,0.04)" : "rgba(0,0,0,0.03)") },
                  }}
                >
                  <ListItemIcon sx={{ minWidth: 30, fontSize: 18, "& svg": { fontSize: 18 } }}>{n.icon}</ListItemIcon>
                  <ListItemText primary={n.label} primaryTypographyProps={{ fontSize: 13, fontWeight: active ? 600 : 500 }} />
                  {n.badge > 0 && <Chip label={n.badge} size="small" sx={{ height: 22, fontSize: 12, background: `${NEON.pink}18`, color: NEON.pink }} />}
                </ListItemButton>
              );
            })}
          </Box>
        ))}
      </Box>

      {/* User avatar + role chip, pinned to bottom */}
      {user && (
        <Box sx={{ mt: 1, pt: 1.5, borderTop: (t) => `1px solid ${t.palette.divider}` }}>
          <Box sx={{ display: "flex", alignItems: "center", gap: 1, px: 1, py: 1, borderRadius: 2 }}>
            <Avatar src={user.photoURL || ""} sx={{ width: 30, height: 30, fontSize: 12, background: NEON.blue }}>
              {user.displayName?.[0] || "U"}
            </Avatar>
            <Box sx={{ flex: 1, minWidth: 0 }}>
              <Typography sx={{ fontWeight: 600, fontSize: 12, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {user.displayName || user.email?.split("@")[0] || "Your account"}
              </Typography>
              <Chip
                label={isAdmin ? "Platform Admin" : userRole === "moderator" ? "Moderator" : userRole === "user" ? "User" : "Checking role…"}
                size="small"
                sx={{ height: 22, fontSize: 12, mt: 0.2, background: `${NEON.blue}15`, color: NEON.blue, "& .MuiChip-label": { px: 0.8 } }}
              />
            </Box>
          </Box>
          <ListItemButton component="button" onClick={() => signOut(auth)} sx={{ width: "100%", borderRadius: 2, gap: 1.2, mt: 0.3, color: "text.secondary", "&:hover": { background: `${NEON.pink}0e`, color: NEON.pink } }}>
            <ListItemIcon sx={{ minWidth: 30, color: "inherit" }}><LogoutIcon sx={{ fontSize: 17 }} /></ListItemIcon>
            <ListItemText primary="Sign Out" primaryTypographyProps={{ fontSize: 13, fontWeight: 500 }} />
          </ListItemButton>
        </Box>
      )}
    </Box>
  );

  return (
    <>
      {/* Desktop permanent sidebar */}
      <Box sx={{ display: { xs: "none", lg: "block" }, width: SIDEBAR_W, flexShrink: 0 }}>
        <Box sx={{
          width: SIDEBAR_W, height: "100dvh", position: "fixed", top: 0, left: 0,
          background: (t) => t.palette.background.default,
          borderRight: "1px solid", borderColor: "divider",
          zIndex: 1100, overflowY: "auto",
          "&::-webkit-scrollbar": { width: 4 },
          "&::-webkit-scrollbar-thumb": { background: `${NEON.blue}33`, borderRadius: 2 },
        }}>
          {content}
        </Box>
      </Box>
      {/* Mobile drawer */}
      <Drawer open={open} onClose={onClose} PaperProps={{ sx: { width: { xs: "min(86vw, 320px)", sm: SIDEBAR_W }, maxWidth: "100vw" } }}>
        {content}
      </Drawer>
    </>
  );
});
