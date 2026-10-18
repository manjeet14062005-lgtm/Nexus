// AvatarUploader.jsx — Handles avatar display and upload.
// Hover states reveal the upload prompt. 

import { Box, Typography, CircularProgress, Avatar } from "@mui/material";
import { useState, useRef } from "react";
import CameraAltOutlinedIcon from "@mui/icons-material/CameraAltOutlined";
import { motion } from "motion/react";

export function AvatarUploader({ url, name, onUpload, size = 80 }) {
  const [hover, setHover] = useState(false);
  const [uploading, setUploading] = useState(false);
  const inputRef = useRef(null);

  const initial = name ? name.charAt(0).toUpperCase() : "?";

  const handleFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file || !onUpload) return;
    setUploading(true);
    try { await onUpload(file); } finally { setUploading(false); if (inputRef.current) inputRef.current.value = ""; }
  };

  return (
    <Box
      role="button" tabIndex={uploading ? -1 : 0} aria-label="Update profile photo" aria-disabled={uploading}
      onKeyDown={event => { if (["Enter", " "].includes(event.key)) { event.preventDefault(); if (!uploading) inputRef.current?.click(); } }}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      onClick={() => !uploading && inputRef.current?.click()}
      sx={{
        position: "relative",
        width: size,
        height: size,
        borderRadius: "50%",
        cursor: uploading ? "wait" : "pointer",
        overflow: "hidden",
        border: "1px solid var(--acct-border)",
        background: "var(--acct-surface-raised)",
        flexShrink: 0,
      }}
    >
      <input
        type="file"
        ref={inputRef}
        accept="image/jpeg,image/png,image/webp"
        onChange={handleFile}
        style={{ display: "none" }}
      />
      
      <Avatar
        src={url}
        sx={{
          width: "100%",
          height: "100%",
          bgcolor: url ? "transparent" : "var(--acct-brand)",
          color: "#fff",
          fontSize: size * 0.4,
          fontWeight: 600,
        }}
      >
        {!url && initial}
      </Avatar>

      {/* Hover Overlay */}
      <Box
        component={motion.div}
        initial={false}
        animate={{ opacity: hover || uploading ? 1 : 0 }}
        transition={{ duration: 0.2 }}
        sx={{
          position: "absolute",
          inset: 0,
          background: "rgba(0,0,0,0.5)",
          backdropFilter: "blur(2px)",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          color: "#fff",
          gap: 0.5,
        }}
      >
        {uploading ? (
          <CircularProgress size={24} sx={{ color: "#fff" }} />
        ) : (
          <>
            <CameraAltOutlinedIcon sx={{ fontSize: size * 0.3 }} />
            {size >= 64 && <Typography sx={{ fontSize: 10, fontWeight: 500 }}>Update</Typography>}
          </>
        )}
      </Box>
    </Box>
  );
}
