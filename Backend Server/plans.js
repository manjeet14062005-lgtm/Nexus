const PLANS = Object.freeze({
  starter: {
    id: "starter",
    name: "Starter",
    monthly: 0,
    annual: 0,
    monthlyPaise: 0,
    annualPaise: 0,
    userLimit: 100,
    workspaceLimit: 1,
    teamMemberLimit: 1,
    apiLimit: 10000,
    verificationLimit: 500,
    storageGB: 1,
    aiMonthlyLimit: 0,
    reportScheduleLimit: 0,
    features: ["Up to 100 users", "1 team member", "500 verification requests/month", "Basic analytics", "Email support", "1 workspace", "CSV export", "Public profiles"],
    featureFlags: {
      api: true,
      advancedSecurity: false,
      webhooks: false,
      advancedAnalytics: false,
      ai: false,
      automation: false,
      scheduledReports: false,
      whiteLabel: false,
      customDomain: false,
    },
    popular: false,
  },
  pro: {
    id: "pro",
    name: "Pro",
    monthly: 10,
    annual: 8,
    monthlyPaise: 1000,
    annualPaise: 800,
    userLimit: 5000,
    workspaceLimit: 5,
    teamMemberLimit: 10,
    apiLimit: 100000,
    verificationLimit: 5000,
    storageGB: 10,
    aiMonthlyLimit: 50,
    reportScheduleLimit: 5,
    features: ["Up to 5,000 users", "10 team members", "5,000 verification requests/month", "Advanced analytics", "Priority support", "5 workspaces", "AI assistant", "50 AI queries/month", "Scheduled reports", "API access", "Webhooks", "Automation", "Gamification", "Custom forms"],
    featureFlags: {
      api: true,
      advancedSecurity: true,
      webhooks: true,
      advancedAnalytics: true,
      ai: true,
      automation: true,
      scheduledReports: true,
      whiteLabel: false,
      customDomain: false,
    },
    popular: true,
  },
  enterprise: {
    id: "enterprise",
    name: "Enterprise",
    monthly: 15,
    annual: 12,
    monthlyPaise: 1500,
    annualPaise: 1200,
    userLimit: null,
    workspaceLimit: null,
    teamMemberLimit: null,
    apiLimit: null,
    verificationLimit: 100000,
    storageGB: 100,
    aiMonthlyLimit: 500,
    reportScheduleLimit: 20,
    features: ["Unlimited users", "Unlimited team members", "100,000 verification requests/month", "Advanced analytics", "Dedicated support", "Unlimited workspaces", "AI insights", "500 AI queries/month", "Scheduled reports", "Automation", "Full API", "White-label workspace branding"],
    featureFlags: {
      api: true,
      advancedSecurity: true,
      webhooks: true,
      advancedAnalytics: true,
      ai: true,
      automation: true,
      scheduledReports: true,
      whiteLabel: true,
      customDomain: false,
    },
    popular: false,
  },
});

const PLAN_ORDER = Object.freeze(["starter", "pro", "enterprise"]);

function getPlan(planId) {
  return PLANS[planId] || null;
}

function getPlanAmount(planId, cycle = "monthly") {
  const plan = getPlan(planId);
  if (!plan || !["monthly", "annual"].includes(cycle)) return null;
  return plan[`${cycle}Paise`];
}

function publicPlans() {
  return PLAN_ORDER.map((id) => ({ ...PLANS[id] }));
}

module.exports = { PLANS, PLAN_ORDER, getPlan, getPlanAmount, publicPlans };
