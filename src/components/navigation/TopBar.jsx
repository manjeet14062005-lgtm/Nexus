import { memo, useContext } from "react";
import { Avatar, Badge, Box, Button, IconButton, Tooltip, Typography } from "@mui/material";
import GoogleIcon from "@mui/icons-material/Google";
import MenuIcon from "@mui/icons-material/Menu";
import { NEON } from "../../constants/theme";
import NotificationsIcon from "@mui/icons-material/Notifications";
import { NotifContext, SIDEBAR_W } from "../../core/appConstants.js";
import { auth, provider } from "../../lib/supabaseLegacy";
import { signInWithPopup } from "../../lib/supabaseAuth.js";
import { toast } from "react-hot-toast";
import { Link as RouterLink } from "react-router-dom";



export const TopBar = memo(function TopBar({ user, onMenuClick, onNotifClick, pageTitle }) {
  const { unread } = useContext(NotifContext);
  return (
    <Box sx={{
      position: "fixed", top: 0, right: 0, left: { xs: 0, lg: SIDEBAR_W },
      zIndex: 1050, height: 56,
      background: (t) => (t.palette.mode === "dark" ? "rgba(8,12,20,0.85)" : "rgba(248,250,252,0.85)"),
      backdropFilter: "blur(16px)",
      borderBottom: (t) => `1px solid ${t.palette.divider}`,
      display: "flex", alignItems: "center", px: { xs: 1.25, sm: 2.5 }, gap: { xs: 0.75, sm: 1.5 },
    }}>
      <IconButton aria-label="Open navigation" onClick={onMenuClick} sx={{ display: { lg: "none" }, color: NEON.blue, background: `${NEON.blue}12` }} size="small">
        <MenuIcon />
      </IconButton>
      <Typography sx={{ color: "text.secondary", fontSize: 12, display: { xs: "none", md: "block" } }}>Console /</Typography>
      <Typography component="div" variant="subtitle1" sx={{ fontWeight: 500, fontSize: { xs: 13, sm: 13 }, flex: 1, minWidth: 0, color: "text.primary", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{pageTitle}</Typography>

      {user && (
        <Tooltip title="Notifications">
          <IconButton aria-label="Open notifications" onClick={onNotifClick} size="small" sx={{ color: unread > 0 ? NEON.pink : "text.secondary" }}>
            <Badge badgeContent={unread} color="error" sx={{ "& .MuiBadge-badge": { fontSize: 9, minWidth: 16, height: 16 } }}>
              <NotificationsIcon sx={{ fontSize: 20 }} />
            </Badge>
          </IconButton>
        </Tooltip>
      )}

      {user ? (
        <IconButton component={RouterLink} to="/account" aria-label="Open your account" size="small"><Avatar src={user.photoURL || ""} sx={{ width: 28, height: 28, fontSize: 11, bgcolor: "primary.main", border: (t) => `1px solid ${t.palette.divider}` }}>
          {user.displayName?.[0] || "U"}
        </Avatar></IconButton>
      ) : (
        <Button size="small" variant="contained" startIcon={<GoogleIcon sx={{ fontSize: 13 }} />}
          onClick={async () => {
            try { await signInWithPopup(auth, provider); }
            catch (err) {
              if (err?.code !== "auth/popup-closed-by-user" && err?.code !== "auth/cancelled-popup-request") {
                toast.error("Google sign-in failed");
              }
            }
          }}
          sx={{ fontSize: 12, fontWeight: 500, py: 0.6, px: 1.8 }}>
          Sign In
        </Button>
      )}
    </Box>
  );
});
