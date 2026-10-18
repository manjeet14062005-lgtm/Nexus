import { Link } from 'react-router-dom';
import { Box, Container, Typography } from '@mui/material';
export function LegalPage({ title, intro, sections }) {
  return <Box sx={{ minHeight: '100vh', bgcolor: '#f4f7f2', color: '#183c35', py: { xs: 3, md: 6 }, px: 2 }}>
    <Container maxWidth="md">
      <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 4 }}><Link to="/" style={{ color: 'inherit' }}>← Nexus home</Link><Link to="/register" style={{ color: 'inherit' }}>Create account ↗</Link></Box>
      <Box component="main" sx={{ bgcolor: '#fff', p: { xs: 3, md: 6 }, borderRadius: 5, border: '1px solid #dce7dc' }}>
        <Typography sx={{ fontSize: 11, letterSpacing: 2, mb: 2 }}>NEXUS / TRUST & TRANSPARENCY</Typography>
        <Typography component="h1" sx={{ fontSize: { xs: 32, md: 44 }, letterSpacing: '-.04em', mb: 1 }}>{title}</Typography>
        <Typography sx={{ fontSize: 12, color: '#617369', mb: 3 }}>Last updated: 29 September 2026</Typography>
        <Typography sx={{ lineHeight: 1.8, mb: 3 }}>{intro}</Typography>
        <Box sx={{ p: 2.5, bgcolor: '#f0f6ed', borderRadius: 3, mb: 4, fontSize: 14 }}>
          Operated by <strong>Manjeet Yadav</strong>.<br />Support and privacy: <a href="mailto:manjeet14062005@gmail.com" style={{ color: '#245d48', overflowWrap: 'anywhere' }}>manjeet14062005@gmail.com</a>
        </Box>
        {sections.map(([heading, body], i) => <Box component="section" key={heading} sx={{ mb: 3.5 }}>
          <Typography component="h2" sx={{ fontSize: 19, fontWeight: 600, mb: 1 }}>{i + 1}. {heading}</Typography>
          <Typography sx={{ fontSize: 14, color: '#435a4e', lineHeight: 1.85 }}>{body}</Typography>
        </Box>)}
        <Box sx={{ borderTop: '1px solid #dce7dc', pt: 3, display: 'flex', gap: 3 }}><Link to="/terms" style={{ color: 'inherit' }}>Terms & Conditions</Link><Link to="/privacy" style={{ color: 'inherit' }}>Privacy Policy</Link></Box>
      </Box>
    </Container>
  </Box>;
}
