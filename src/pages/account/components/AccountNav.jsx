// AccountNav.jsx — Premium account navigation.
// Desktop: sticky side rail. Mobile: horizontal scrollable pills.
// Supports ?section= deep links. Ctrl+K command palette integration.

import { Box, Typography, useMediaQuery } from "@mui/material";
import { motion } from "motion/react";
import { useReducedMotionSafe } from "../hooks/useReducedMotionSafe.js";
import PersonOutlineIcon from "@mui/icons-material/PersonOutline";
import DashboardOutlinedIcon from "@mui/icons-material/DashboardOutlined";

import SecurityOutlinedIcon from "@mui/icons-material/SecurityOutlined";
import HistoryOutlinedIcon from "@mui/icons-material/HistoryOutlined";
import TuneOutlinedIcon from "@mui/icons-material/TuneOutlined";
import LockOutlinedIcon from "@mui/icons-material/LockOutlined";

export const ACCOUNT_SECTIONS = [
  { id: "overview",     label: "Overview",       Icon: DashboardOutlinedIcon  },
  { id: "profile",      label: "Profile",        Icon: PersonOutlineIcon      },

  { id: "security",     label: "Security",       Icon: SecurityOutlinedIcon   },
  { id: "activity",     label: "Activity",       Icon: HistoryOutlinedIcon    },
  { id: "preferences",  label: "Preferences",    Icon: TuneOutlinedIcon       },
  { id: "privacy",      label: "Privacy & Data", Icon: LockOutlinedIcon       },
];

const RAIL_W = 200;
const ACCENT = "#315D86";

export function AccountNav({ active, onChange }) {
  const isDesktop = useMediaQuery("(min-width: 900px)");
  const prefersReducedMotion = useReducedMotionSafe();

  if (isDesktop) {
    return (
      <Box
        component="nav"
        aria-label="Account navigation"
        sx={{
          width: RAIL_W,
          flexShrink: 0,
          position: "sticky",
          top: 72,
          alignSelf: "flex-start",
          display: "flex",
          flexDirection: "column",
          gap: 0.5,
          pr: 1,
          maxHeight: "calc(100vh - 80px)",
          overflowY: "auto",
          scrollbarWidth: "none",
          "&::-webkit-scrollbar": { display: "none" },
        }}
      >
        {ACCOUNT_SECTIONS.map(({ id, label, Icon }) => {
          const isActive = id === active;
          return (
            <motion.div
              key={id}
              whileTap={prefersReducedMotion ? {} : { scale: 0.97 }}
            >
              <Box
                component="button"
                id={`acct-nav-${id}`}
                aria-current={isActive ? "page" : undefined}
                onClick={() => onChange(id)}
                sx={{
                  width: "100%",
                  display: "flex",
                  alignItems: "center",
                  gap: 1.25,
                  px: 1.5,
                  py: 1,
                  borderRadius: 2,
                  border: "none",
                  cursor: "pointer",
                  transition: "background 140ms ease, color 140ms ease",
                  background: isActive
                    ? "rgba(49,93,134,0.09)"
                    : "transparent",
                  color: isActive ? ACCENT : "#64748B",
                  position: "relative",
                  textAlign: "left",
                  minHeight: 40,
                  "&:hover": {
                    background: isActive
                      ? "rgba(49,93,134,0.12)"
                      : "rgba(15,23,42,0.04)",
                    color: isActive ? ACCENT : "#0F172A",
                  },
                  "&:focus-visible": {
                    outline: `2px solid ${ACCENT}`,
                    outlineOffset: 2,
                  },
                }}
              >
                {isActive && (
                  <Box
                    component={motion.div}
                    layoutId="acct-nav-indicator"
                    sx={{
                      position: "absolute",
                      left: 0,
                      top: "20%",
                      bottom: "20%",
                      width: 3,
                      borderRadius: 99,
                      background: ACCENT,
                    }}
                    transition={{ type: "spring", stiffness: 320, damping: 32 }}
                  />
                )}
                <Icon sx={{ fontSize: 17, flexShrink: 0 }} />
                <Typography
                  sx={{
                    fontSize: 13,
                    fontWeight: isActive ? 600 : 400,
                    lineHeight: 1,
                  }}
                >
                  {label}
                </Typography>
              </Box>
            </motion.div>
          );
        })}
      </Box>
    );
  }

  // Mobile — horizontal scrollable pills
  return (
    <Box
      component="nav"
      aria-label="Account navigation"
      sx={{
        display: "flex",
        gap: 1,
        overflowX: "auto",
        pb: 0.5,
        mb: 2,
        scrollbarWidth: "none",
        "&::-webkit-scrollbar": { display: "none" },
        WebkitOverflowScrolling: "touch",
      }}
    >
      {ACCOUNT_SECTIONS.map(({ id, label, Icon }) => {
        const isActive = id === active;
        return (
          <Box
            key={id}
            component="button"
            id={`acct-nav-mob-${id}`}
            aria-current={isActive ? "page" : undefined}
            onClick={() => onChange(id)}
            sx={{
              flexShrink: 0,
              display: "flex",
              alignItems: "center",
              gap: 0.75,
              px: 1.5,
              py: 0.75,
              borderRadius: 99,
              border: `1px solid ${isActive ? ACCENT + "44" : "#DCE3EB"}`,
              background: isActive ? "rgba(49,93,134,0.08)" : "#fff",
              color: isActive ? ACCENT : "#64748B",
              cursor: "pointer",
              fontSize: 12,
              fontWeight: isActive ? 600 : 400,
              whiteSpace: "nowrap",
              minHeight: 36,
              transition: "background 140ms ease, color 140ms ease, border-color 140ms ease",
              "&:focus-visible": {
                outline: `2px solid ${ACCENT}`,
                outlineOffset: 2,
              },
            }}
          >
            <Icon sx={{ fontSize: 14 }} />
            {label}
          </Box>
        );
      })}
    </Box>
  );
}
