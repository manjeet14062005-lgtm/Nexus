import { useEffect, useState } from "react";
import { Box, Button, IconButton, Typography } from "@mui/material";
import CloseIcon from "@mui/icons-material/Close";
import InstallDesktopOutlinedIcon from "@mui/icons-material/InstallDesktopOutlined";
import { toast } from "react-hot-toast";

export function PWAInstallBanner() {
  const [deferredPrompt, setDeferredPrompt] = useState(null);
  const [installing, setInstalling] = useState(false);

  useEffect(() => {
    if (window.matchMedia("(display-mode: standalone)").matches) return;
    try { if (sessionStorage.getItem("pwa_banner_dismissed")) return; } catch { /* Private browsers may block storage. */ }
    const handlePrompt = (event) => {
      event.preventDefault();
      setDeferredPrompt(event);
    };
    const handleInstalled = () => {
      setDeferredPrompt(null);
      toast.success("Nexus installed.");
    };
    window.addEventListener("beforeinstallprompt", handlePrompt);
    window.addEventListener("appinstalled", handleInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", handlePrompt);
      window.removeEventListener("appinstalled", handleInstalled);
    };
  }, []);

  const dismiss = () => {
    setDeferredPrompt(null);
    try { sessionStorage.setItem("pwa_banner_dismissed", "1"); } catch { /* Dismissal still applies to the current page. */ }
  };

  const install = async () => {
    if (!deferredPrompt || installing) return;
    setInstalling(true);
    try {
      await deferredPrompt.prompt();
      await deferredPrompt.userChoice;
    } catch {
      toast.error("Installation could not start. You can continue using Nexus in your browser.");
    } finally {
      // Browser install events are single-use, including when the user declines.
      setDeferredPrompt(null);
      setInstalling(false);
    }
  };

  if (!deferredPrompt) return null;
  return <Box component="aside" aria-label="Optional app installation" sx={{ mx: { xs: 2, sm: 3, lg: 4 }, mt: 2, p: 2, bgcolor: "background.paper", color: "text.primary", border: "1px solid", borderColor: "divider", borderRadius: 2, display: "flex", alignItems: "center", gap: 1.5, flexWrap: "wrap" }}>
    <InstallDesktopOutlinedIcon sx={{ color: "text.secondary", display: { xs: "none", sm: "block" } }} />
    <Box sx={{ flex: "1 1 220px" }}><Typography sx={{ fontSize: 14, fontWeight: 600 }}>Nexus, a click away</Typography><Typography variant="body2" color="text.secondary">Add an app shortcut, or keep using your browser. Live data requires a connection.</Typography></Box>
    <Box sx={{ display: "flex", gap: 1, alignItems: "center", flexWrap: "wrap" }}>
      <Button variant="contained" size="small" onClick={install} disabled={installing}>{installing ? "Opening installer…" : "Install app"}</Button>
      <Button variant="outlined" size="small" onClick={dismiss} sx={{ color: "text.primary", borderColor: "divider" }}>Not now</Button>
      <IconButton aria-label="Dismiss install prompt" onClick={dismiss} size="small" sx={{ color: "text.secondary" }}><CloseIcon fontSize="small" /></IconButton>
    </Box>
  </Box>;
}
