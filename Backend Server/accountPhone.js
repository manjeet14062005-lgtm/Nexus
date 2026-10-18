function accountPhoneHandlers({ client, rateLimit, service }) {
  const run = verify => async (req, res) => {
    try {
      const phone = String(req.body?.phone || '').trim();
      const code = String(req.body?.code || '').trim();
      if (!/^\+[1-9]\d{6,14}$/.test(phone) || (verify && !/^\d{6}$/.test(code))) return res.status(400).json({ message: 'Enter a valid international phone number and six-digit code.' });
      if (await rateLimit(`account-phone:${verify ? 'verify' : 'send'}:${req.auth.uid}`, verify ? 6 : 3, 60000)) return res.status(429).json({ message: 'Too many attempts. Please wait a minute.' });
      const db = client();
      const { data: rows, error } = await db.from('nexus_documents').select('data').eq('collection_path', 'users').eq('user_id', req.auth.uid).limit(1);
      if (error || !rows?.length) return res.status(503).json({ message: 'Your profile is not ready. Refresh and try again.' });
      if (rows[0].data.phoneVerified === true && rows[0].data.phone) return res.status(409).json({ message: 'Your verified phone number is locked.' });
      if (!verify) {
        await service().verifications.create({ to: phone, channel: 'sms' });
        return res.json({ success: true });
      }
      const result = await service().verificationChecks.create({ to: phone, code });
      if (result.status !== 'approved') return res.status(400).json({ message: 'Incorrect code. Please try again.' });
      const saved = await db.rpc('nexus_lock_verified_phone', { target_user: req.auth.uid, verified_phone: phone });
      if (saved.error) return res.status(saved.error.code === '23505' ? 409 : 503).json({ message: saved.error.code === '23505' ? 'Your verified phone number is already locked. Refresh this page.' : 'Phone verified, but could not save it. Request a fresh code and try again.' });
      return res.json({ success: true, phone, phoneVerified: true });
    } catch (error) {
      return res.status(error.status === 404 ? 400 : 503).json({ message: error.status === 404 ? 'Code expired. Request a new one.' : 'Phone verification is unavailable. Please try again shortly.' });
    }
  };
  return { send: run(false), verify: run(true) };
}
module.exports = { accountPhoneHandlers };
