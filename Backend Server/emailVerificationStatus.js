function emailVerificationStatusHandler({ client, rateLimit }) {
  return async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    try {
      if (await rateLimit(`email-verification-status:${req.ip}`, 10, 60000)) {
        res.setHeader('Retry-After', '60');
        return res.status(429).json({ message: 'Too many checks. Please wait a minute and try again.' });
      }
      const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '';
      if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        return res.status(400).json({ message: 'Enter a valid email address.' });
      }
      const { data, error } = await client().rpc('nexus_email_verified', { candidate_email: email });
      if (error || typeof data !== 'boolean') throw new Error('Email verification lookup unavailable');
      return res.json({ verified: data });
    } catch {
      return res.status(503).json({ message: 'We could not check email verification. Please try again shortly.' });
    }
  };
}
module.exports = { emailVerificationStatusHandler };
