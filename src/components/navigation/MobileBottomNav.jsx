import { Link as RouterLink, useLocation } from "react-router-dom";
import { memo } from "react";
import { BottomNavigation, BottomNavigationAction, Paper } from "@mui/material";
import { DashboardOutlined, VerifiedUserOutlined, Code, PeopleOutline } from "@mui/icons-material";

export const MobileBottomNav = memo(function MobileBottomNav({ user }) {
  const { pathname } = useLocation();
  if (!user) return null;
  return <Paper component="nav" aria-label="Primary mobile navigation" elevation={0} sx={{ display: { xs: "block", lg: "none" }, position: "fixed", bottom: 0, left: 0, right: 0, zIndex: 1100, borderTop: "1px solid", borderColor: "divider", borderRadius: 0, pb: "env(safe-area-inset-bottom)" }}>
    <BottomNavigation value={pathname} showLabels sx={{ height: 64, bgcolor: "background.paper", "& .MuiBottomNavigationAction-root": { minWidth: 0, px: .5, color: "text.secondary" }, "& .Mui-selected": { color: "primary.main" }, "& .MuiBottomNavigationAction-label, & .MuiBottomNavigationAction-label.Mui-selected": { fontSize: 11, mt: .5 } }}>
      {[{ path: "/dashboard", label: "Overview", icon: <DashboardOutlined /> }, { path: "/verification", label: "Activity", icon: <VerifiedUserOutlined /> }, { path: "/developer", label: "Developers", icon: <Code /> }, { path: "/workspace", label: "Workspace", icon: <PeopleOutline /> }].map((item) => <BottomNavigationAction key={item.path} component={RouterLink} to={item.path} value={item.path} label={item.label} icon={item.icon} aria-current={pathname === item.path ? "page" : undefined} />)}
    </BottomNavigation>
  </Paper>;
});
