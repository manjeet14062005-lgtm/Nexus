// Curated product instructions, not generated analytics or a provider fallback.
// Keep intent narrow: investigations, errors and security incidents still use
// their normal path rather than receiving an unrelated setup answer.
function apiKeySetupGuidance(question) {
  if (!/\bapi[\s_-]*keys?\b/i.test(question)
    || !(/\b(use|using|integrate|integration|next)\b/i.test(question) || /\bwhat\b.{0,60}\b(do|with)\b/i.test(question))
    || /\b(rotate|rotation|revoke|risk|exposed|leaked|compromised|usage|traffic|analytics|failed|failing|error|errors)\b/i.test(question)) return null;
  return [
    'Your Nexus API key connects your application’s backend to Nexus verification. Creating the key alone does not start verification traffic.',
    '## Next steps',
    '1. Open Developer Portal → Quickstart. Start with a test key and copy the generated email or phone example.',
    '2. Store the key in your backend environment. Send it as Authorization: Bearer YOUR_NEXUS_API_KEY. Never put it in browser code, a public repository, screenshots, or this question box.',
    '3. From your backend, send POST /v1/verifications using the Quickstart request body. Keep the returned verification ID.',
    '4. Send the customer’s code to POST /v1/verifications/:id/verify. You can read the request status with GET /v1/verifications/:id when your key has verification:read permission.',
    '5. Open Verification to inspect the result. After testing your flow, use a live key for real deliveries. Test and live credentials belong to their own environments.',
    'Use the API key only on your server. Your customer uses your application’s verification screen and never needs to see the key.',
  ].join('\n\n');
}
module.exports = { apiKeySetupGuidance };
