import { Box, Typography } from '@mui/material';
import { QRCodeSVG } from 'qrcode.react';

export function trustedCheckoutLink(value) {
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || !['rzp.io', 'razorpay.com', 'pages.razorpay.com'].includes(url.hostname) || url.username || url.password || url.port || value.length > 512) return null;
    return url.href;
  } catch { return null; }
}

export function PhoneCheckout({ url }) {
  const link = trustedCheckoutLink(url);
  if (!link) return null;
  return <Box sx={{ mb: 3, textAlign: 'center' }}>
    <Typography variant="h6" sx={{ fontWeight: 800 }}>Continue payment on your phone</Typography>
    <Typography variant="body2" sx={{ mt: 1, mb: 2 }}>Scan with your phone camera to open secure checkout. This is a checkout link, not a direct UPI payment QR.</Typography>
    <Box sx={{ background: '#fff', p: 2, border: '1px solid #dce2ea', borderRadius: 3, width: 'fit-content', maxWidth: '100%', mx: 'auto', '& svg': { display: 'block', maxWidth: '100%', height: 'auto' } }}>
      <QRCodeSVG value={link} size={256} level="M" marginSize={4} bgColor="#ffffff" fgColor="#000000" title="Open secure subscription checkout on your phone" />
    </Box>
    <Typography variant="body2" sx={{ mt: 2 }}>Finish payment on your phone, then select “Check existing payment” here. Keep this checkout link private.</Typography>
  </Box>;
}
