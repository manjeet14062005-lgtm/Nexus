import { Navigate } from "react-router-dom";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Container,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  IconButton,
  LinearProgress,
  Skeleton,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
  TextField,
  MenuItem,
} from "@mui/material";
import ArrowForwardRoundedIcon from "@mui/icons-material/ArrowForwardRounded";
import BusinessRoundedIcon from "@mui/icons-material/BusinessRounded";
import CheckRoundedIcon from "@mui/icons-material/CheckRounded";
import CreditCardRoundedIcon from "@mui/icons-material/CreditCardRounded";
import DataUsageRoundedIcon from "@mui/icons-material/DataUsageRounded";
import DownloadRoundedIcon from "@mui/icons-material/DownloadRounded";
import EventRepeatRoundedIcon from "@mui/icons-material/EventRepeatRounded";
import ReceiptLongRoundedIcon from "@mui/icons-material/ReceiptLongRounded";
import SettingsRoundedIcon from "@mui/icons-material/SettingsRounded";
import ShieldOutlinedIcon from "@mui/icons-material/ShieldOutlined";
import WorkspacePremiumRoundedIcon from "@mui/icons-material/WorkspacePremiumRounded";
import { toast } from "react-hot-toast";
import "./billing.css";
import { checkoutLogo } from "./checkoutLogo";
import { PhoneCheckout, trustedCheckoutLink } from "./PhoneCheckout";
import { apiDownload, apiRequest } from "../../services/apiClient.js";
const NEON = { blue: "#355eaa", purple: "#647da5", orange: "#ac7638", green: "#357261", red: "#b65057" };

const TAB_ITEMS = [
  { id: "summary", label: "Subscription", icon: CreditCardRoundedIcon },
  { id: "usage", label: "Usage", icon: DataUsageRoundedIcon },
  { id: "invoices", label: "Invoices", icon: ReceiptLongRoundedIcon },
  { id: "settings", label: "Settings", icon: SettingsRoundedIcon },
];

const PLAN_META = {
  starter: { accent: NEON.blue },
  pro: { accent: NEON.purple },
  enterprise: { accent: NEON.orange },
};

function surface(darkMode, elevated = false) {
  return {
    border: darkMode ? "1px solid rgba(148,163,184,.12)" : "1px solid rgba(15,23,42,.08)",
    background: darkMode ? "rgba(11,16,28,.72)" : "rgba(255,255,255,.86)",
    boxShadow: elevated
      ? darkMode
        ? "0 24px 70px rgba(0,0,0,.22)"
        : "0 24px 70px rgba(15,23,42,.08)"
      : darkMode
        ? "0 1px 0 rgba(255,255,255,.025) inset"
        : "0 1px 0 rgba(255,255,255,.9) inset",
    backdropFilter: "blur(18px)",
  };
}

function formatCurrency(value, currency = "INR") {
  if (value == null || value === "") return "Not available";
  const amount = Number(value);
  if (!Number.isFinite(amount)) return "Not available";
  try {
    return new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency: String(currency || "INR").toUpperCase(),
      maximumFractionDigits: Number.isInteger(amount) ? 0 : 2,
    }).format(amount);
  } catch (_) {
    return `${String(currency || "INR").toUpperCase()} ${amount.toLocaleString("en-IN")}`;
  }
}

function formatDate(value, options = {}) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat("en-IN", {
    day: "numeric",
    month: "short",
    year: options.withYear === false ? undefined : "numeric",
    ...options,
  }).format(date);
}

function formatCount(value) {
  if (value == null || value === "") return "Not available";
  const number = Number(value);
  return Number.isFinite(number) ? number.toLocaleString("en-IN") : "Not available";
}

function cycleLabel(cycle) {
  return cycle === "annual" ? "year" : "month";
}

function statusMeta(status) {
  const value = String(status || "").toLowerCase();
  return {
    active: { label: "Active", color: NEON.green },
    trialing: { label: "Trial", color: NEON.blue },
    past_due: { label: "Past due", color: NEON.red },
    cancelled: { label: "Cancelled", color: NEON.orange },
    paused: { label: "Paused", color: NEON.orange },
    expired: { label: "Expired", color: NEON.red },
    paid: { label: "Paid", color: NEON.green },
    pending: { label: "Pending", color: NEON.orange },
    failed: { label: "Failed", color: NEON.red },
    refunded: { label: "Refunded", color: NEON.blue },
  }[value] || { label: value ? value.replace(/_/g, " ") : "Unavailable", color: NEON.orange };
}

function BillingSkeleton({ darkMode }) {
  const card = surface(darkMode);
  return (
    <Container maxWidth="xl" sx={{ py: { xs: 2.5, md: 4 } }}>
      <Box sx={{ mb: 3 }}>
        <Skeleton width={190} height={42} />
        <Skeleton width={330} height={24} />
      </Box>
      <Box sx={{ ...card, borderRadius: 4, p: { xs: 2.5, md: 4 }, mb: 3 }}>
        <Skeleton width="28%" height={28} />
        <Skeleton width="42%" height={56} sx={{ mt: 1 }} />
        <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", sm: "repeat(3,1fr)" }, gap: 2, mt: 3 }}>
          {[1, 2, 3].map((item) => <Skeleton key={item} variant="rounded" height={82} sx={{ borderRadius: 3 }} />)}
        </Box>
      </Box>
      <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "repeat(3,1fr)" }, gap: 2 }}>
        {[1, 2, 3].map((item) => <Skeleton key={item} variant="rounded" height={330} sx={{ borderRadius: 4 }} />)}
      </Box>
    </Container>
  );
}

function EmptyState({ icon, title, body, action }) {
  return (
    <Box sx={{ px: 3, py: { xs: 5, md: 7 }, textAlign: "center" }}>
      <Box sx={{ width: 52, height: 52, mx: "auto", mb: 2, borderRadius: 3, display: "grid", placeItems: "center", background: `${NEON.blue}10`, color: NEON.blue }}>
        {icon}
      </Box>
      <Typography sx={{ fontWeight: 800, mb: .7 }}>{title}</Typography>
      <Typography variant="body2" color="text.secondary" sx={{ maxWidth: 460, mx: "auto", lineHeight: 1.7 }}>{body}</Typography>
      {action && <Box sx={{ mt: 2.5 }}>{action}</Box>}
    </Box>
  );
}

export function BillingPage({ user, userRole, darkMode }) {
  const [tab, setTab] = useState("summary");
  const [billingCycle, setBillingCycle] = useState("monthly");
  const [planData, setPlanData] = useState(null);
  const [planCatalog, setPlanCatalog] = useState([]);
  const [invoices, setInvoices] = useState([]);
  const [ownedWorkspaces, setOwnedWorkspaces] = useState([]);
  const [workspaceUsage, setWorkspaceUsage] = useState([]);
  const [usageLoadFailures, setUsageLoadFailures] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [upgradeDialog, setUpgradeDialog] = useState(null);
  const [upgrading, setUpgrading] = useState(false);
  const [cancelDialog, setCancelDialog] = useState(false);
  const [cancelling, setCancelling] = useState(false);

  const [invoiceQuery, setInvoiceQuery] = useState(""), [invoiceStatus, setInvoiceStatus] = useState("all");
  const [invoiceFrom, setInvoiceFrom] = useState(""), [invoiceTo, setInvoiceTo] = useState("");
  const [checkoutStage, setCheckoutStage] = useState(""), [exporting, setExporting] = useState(""), [activationPending, setActivationPending] = useState(false);
  const [paymentDialog, setPaymentDialog] = useState(false), [checkingPayment, setCheckingPayment] = useState(false), [paymentReference, setPaymentReference] = useState('');
  const checkoutSubscription = useRef(null), reconciliationLock = useRef(false);
  const [phoneCheckoutUrl, setPhoneCheckoutUrl] = useState('');
  const pendingPlan = useRef(null), checkoutGeneration = useRef(0), cancelGeneration = useRef(0), displayAccount = useRef(user?.uid);
  const requestController = useRef(null), identity = useRef(user?.uid), checkoutLock = useRef(false), cancelLock = useRef(false), exportLock = useRef(false), mounted = useRef(true);
  identity.current = user?.uid;
  const filteredInvoices = invoices.filter(invoice => {
    const text = `${invoice.invoiceId || invoice.id} ${invoice.plan || ""} ${invoice.description || ""}`.toLowerCase();
    const date = invoice.date ? new Date(invoice.date) : null;
    return (!invoiceQuery.trim() || text.includes(invoiceQuery.trim().toLowerCase())) && (invoiceStatus === "all" || String(invoice.status).toLowerCase() === invoiceStatus)
      && (!invoiceFrom || (date && date >= new Date(`${invoiceFrom}T00:00:00`))) && (!invoiceTo || (date && date <= new Date(`${invoiceTo}T23:59:59.999`)));
  });

  const plans = useMemo(() => planCatalog.map((plan) => ({
    ...plan,
    ...(PLAN_META[plan.id] || { accent: NEON.blue }),
  })), [planCatalog]);

  const availableBillingCycles = useMemo(() => {
    const cycles = ["monthly", "annual"].filter((cycle) => plans.some((plan) =>
      plan.id !== "starter" && Array.isArray(plan.availableCycles) && plan.availableCycles.includes(cycle)
    ));
    return cycles.length ? cycles : ["monthly"];
  }, [plans]);

  const currentPlan = useMemo(() => plans.find((plan) => plan.id === planData?.plan) || null, [plans, planData]);
  const currentPlanIndex = currentPlan ? plans.findIndex((plan) => plan.id === currentPlan.id) : -1;
  const currentStatus = statusMeta(planData?.status);

  const loadBilling = async () => {
    if (!user) return;
    requestController.current?.abort();
    const controller = new AbortController(); requestController.current = controller;
    const account = user.uid;
    displayAccount.current = account;
    const valid = () => !controller.signal.aborted && mounted.current && identity.current === account;
    setLoading(true);
    setLoadError(null);
    setUsageLoadFailures(0);

    try {
      const [catalog, state, invoiceData, workspaceData] = await Promise.all([
        apiRequest(user, "/billing/plans", { signal: controller.signal }),
        apiRequest(user, "/billing/state", { signal: controller.signal }),
        apiRequest(user, "/billing/invoices", { signal: controller.signal }),
        apiRequest(user, "/workspaces", { signal: controller.signal }),
      ]);

      if (!valid()) return;
      const serverPlans = Array.isArray(catalog.plans) ? catalog.plans : [];
      if (!serverPlans.length) throw new Error("Billing plan catalog is unavailable.");
      if (!state.billing) throw new Error("Canonical billing state is unavailable.");

      setPlanCatalog(serverPlans);
      setPlanData(state.billing);
      if (state.checkout?.subscriptionId && state.checkout.status !== 'active' && state.billing.subId !== state.checkout.subscriptionId) {
        checkoutSubscription.current = state.checkout.subscriptionId;
        setCheckoutStage('An existing checkout was found. Check its payment status before starting another payment.');
      }
      if (pendingPlan.current && pendingPlan.current === state.billing.plan && ["active", "trialing"].includes(state.billing.status)) {
        pendingPlan.current = null; setActivationPending(false); setCheckoutStage("Your subscription is active.");
      }
      setInvoices(Array.isArray(invoiceData.invoices) ? invoiceData.invoices : []);

      const cycles = ["monthly", "annual"].filter((cycle) => serverPlans.some((plan) =>
        plan.id !== "starter" && Array.isArray(plan.availableCycles) && plan.availableCycles.includes(cycle)
      ));
      const preferredCycle = String(state.billing.cycle || "monthly");
      setBillingCycle(cycles.includes(preferredCycle) ? preferredCycle : cycles[0] || "monthly");

      const allWorkspaces = Array.isArray(workspaceData.workspaces) ? workspaceData.workspaces : [];
      const owned = allWorkspaces.filter((workspace) => workspace.role === "owner" || workspace.ownerUid === user.uid);
      setOwnedWorkspaces(owned);

      const usageResults = await Promise.allSettled(owned.map(async (workspace) => {
        const response = await apiRequest(user, `/workspaces/${encodeURIComponent(workspace.id)}/usage`, { signal: controller.signal });
        return { workspace, response };
      }));

      if (!valid()) return;
      const successful = usageResults
        .filter((result) => result.status === "fulfilled")
        .map((result) => result.value);
      const failures = usageResults.filter((result) => result.status === "rejected").length;
      setWorkspaceUsage(successful);
      setUsageLoadFailures(failures);
    } catch (error) {
      if (!valid()) return;
      console.warn("Billing load:", error);
      setLoadError(error.message || "Unable to load billing information.");
    } finally {
      if (valid()) setLoading(false);
    }
  };

  useEffect(() => {
    if (!user) return;
    mounted.current = true;
    checkoutGeneration.current += 1; checkoutLock.current = false; cancelLock.current = false; pendingPlan.current = null;
    cancelGeneration.current += 1;
    setUpgrading(false); setCancelling(false); setActivationPending(false);
    checkoutSubscription.current = null; reconciliationLock.current = false;
    setPaymentDialog(false); setCheckingPayment(false); setPaymentReference('');
    setPhoneCheckoutUrl('');
    setPlanData(null); setInvoices([]); setPlanCatalog([]); setWorkspaceUsage([]); setOwnedWorkspaces([]); setUpgradeDialog(null); setCancelDialog(false); setCheckoutStage("");
    loadBilling();
    return () => { mounted.current = false; requestController.current?.abort(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.uid]);

  if (userRole === null) return null;
  if (!user) return <Navigate to="/login" />;
  if (loading || displayAccount.current !== user.uid) return <BillingSkeleton darkMode={darkMode} />;

  if (loadError && !planData) {
    return (
      <Container maxWidth="md" sx={{ py: 8 }}>
        <Box sx={{ ...surface(darkMode, true), borderRadius: 4, p: { xs: 3, md: 5 }, textAlign: "center" }}>
          <Box sx={{ width: 56, height: 56, display: "grid", placeItems: "center", borderRadius: 3, mx: "auto", mb: 2, background: `${NEON.red}10`, color: NEON.red }}>
            <CreditCardRoundedIcon />
          </Box>
          <Typography variant="h6" sx={{ fontWeight: 850, mb: 1 }}>We couldn&apos;t load your billing information</Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2.5 }}>Your subscription has not been changed. Try loading the page again.</Typography>
          <Button variant="contained" onClick={loadBilling} sx={{ borderRadius: 2.5, textTransform: "none", fontWeight: 800 }}>Try again</Button>
        </Box>
      </Container>
    );
  }

  if (!currentPlan) {
    return (
      <Container maxWidth="md" sx={{ py: 8 }}>
        <Box sx={{ ...surface(darkMode), borderRadius: 4, p: 4, textAlign: "center" }}>
          <Typography variant="h6" sx={{ fontWeight: 850, mb: 1 }}>Billing plan unavailable</Typography>
          <Typography variant="body2" color="text.secondary">The server returned a plan that is not present in the current billing catalog.</Typography>
        </Box>
      </Container>
    );
  }

  const loadRazorpayScript = () => new Promise((resolve) => {
    if (window.Razorpay) { resolve(true); return; }
    const script = document.createElement("script");
    script.src = "https://checkout.razorpay.com/v1/checkout.js";
    script.onload = () => resolve(true);
    script.onerror = () => resolve(false);
    document.body.appendChild(script);
  });

  const refreshBillingState = async (account = user.uid) => {
    const state = await apiRequest(user, "/billing/state");
    if (state.billing && mounted.current && identity.current === account) setPlanData(state.billing);
    return state.billing;
  };

  const reconcilePayment = async (account = user.uid, reference = '') => {
    const result = await apiRequest(user, '/razorpay/reconcile', { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ subscriptionId: checkoutSubscription.current || undefined, paymentId: reference || undefined }) });
    if (!mounted.current || identity.current !== account) return null;
    if (result.activation === 'active' && result.billing) {
      setPhoneCheckoutUrl('');
      setPlanData(result.billing); pendingPlan.current = null; setActivationPending(false);
      setCheckoutStage(result.message || 'Your subscription is active.');
      return result.billing;
    }
    setCheckoutStage(result.message || 'Activation is pending. Do not make another payment; check again shortly.');
    return null;
  };

  const checkPaymentStatus = async () => {
    if (reconciliationLock.current) return;
    const account = user.uid; reconciliationLock.current = true; setCheckingPayment(true);
    try {
      const reference = paymentReference.trim();
      const billing = await reconcilePayment(account, reference ? (reference.startsWith('pay_') ? reference : `pay_${reference}`) : '');
      if (billing && mounted.current && identity.current === account) { toast.success('Your paid subscription is active.'); await loadBilling(); }
    } catch (error) {
      if (mounted.current && identity.current === account) { setCheckoutStage(error.message || 'Unable to check payment status. Do not pay again.'); toast.error(error.message); }
    } finally { reconciliationLock.current = false; if (mounted.current && identity.current === account) setCheckingPayment(false); }
  };

  const waitForBillingSync = async (targetPlan, attempts = 8, account = user.uid) => {
    for (let attempt = 0; attempt < attempts; attempt += 1) {
      if (!mounted.current || identity.current !== account) return null;
      try {
        const reconciled = await reconcilePayment(account);
        if (reconciled?.plan === targetPlan) return reconciled;
      } catch (_) { /* A webhook may have completed even when provider reads are unavailable. */ }
      try {
        const billing = await refreshBillingState(account);
        if (billing?.plan === targetPlan && ["active", "trialing"].includes(billing?.status) && String(billing?.source || "").startsWith("razorpay-")) return billing;
      } catch (_) { /* retry provider sync */ }
      await new Promise((resolve) => setTimeout(resolve, 1500));
    }
    return null;
  };

  const exportInvoices = async (invoiceId = null) => {
    if (exportLock.current) return;
    const account = user.uid; exportLock.current = true; setExporting(invoiceId || "all");
    try {
      const path = invoiceId ? `/billing/invoices/${encodeURIComponent(invoiceId)}.csv` : "/billing/invoices.csv";
      const blob = await apiDownload(user, path);
      if (!mounted.current || identity.current !== account) return;
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = invoiceId ? `${invoiceId}.csv` : "nexus-invoices.csv";
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
      toast.success(invoiceId ? "Invoice exported." : "Invoices exported.");
    } catch (error) {
      if (mounted.current && identity.current === account) toast.error(error.message || "Unable to export invoice data.");
    } finally { exportLock.current = false; if (mounted.current) setExporting(""); }
  };

  const handleUpgrade = async (planId, onPhone = false) => {
    if (checkoutLock.current || cancelLock.current || pendingPlan.current) return;
    const account = user.uid;
    const generation = ++checkoutGeneration.current;
    const valid = () => mounted.current && identity.current === account && checkoutGeneration.current === generation;
    const release = () => { if (checkoutGeneration.current === generation) checkoutLock.current = false; if (valid()) setUpgrading(false); };
    let paymentHandling = false;
    const plan = plans.find((item) => item.id === planId);
    if (!plan) {
      toast.error("Plan information is unavailable. Refresh and try again.");
      return;
    }
    const targetIndex = plans.findIndex((item) => item.id === planId);
    if (targetIndex < currentPlanIndex) {
      toast("Downgrades are not available yet. Your current subscription remains unchanged.");
      return;
    }
    if (!Array.isArray(plan.availableCycles) || !plan.availableCycles.includes(billingCycle)) {
      toast.error(`The ${billingCycle} billing cycle is not configured for ${plan.name}.`);
      return;
    }

    checkoutLock.current = true; setUpgrading(true); setCheckoutStage("Opening secure checkout…");
    const planKey = `${planId}_${billingCycle}`;

    try {
      const loaded = onPhone || await loadRazorpayScript();
      if (!valid()) { release(); return; }
      if (!loaded) throw new Error("Nexus secure checkout could not be loaded. Check your connection and try again.");

      const post = async (path, body) => apiRequest(user, path, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      const subRes = await post("/razorpay/create-sub", { planKey });
      if (!subRes.success || !subRes.subscriptionId) {
        throw new Error(subRes.message || `Unable to create the ${plan.name} subscription.`);
      }

      if (!valid()) { release(); return; }
      checkoutSubscription.current = subRes.subscriptionId;
      if (onPhone) {
        const link = trustedCheckoutLink(subRes.shortUrl);
        if (!link) throw new Error('Phone checkout is unavailable for this subscription. Continue with secure checkout on this device.');
        setPhoneCheckoutUrl(link); pendingPlan.current = planId; setActivationPending(true);
        setCheckoutStage('Your subscription is ready. Scan to continue payment on your phone.');
        setUpgradeDialog(null); setPaymentDialog(true); release(); return;
      }
      setCheckoutStage("Complete your payment in secure checkout.");
      const checkoutOptions = {
        key: subRes.keyId,
        subscription_id: subRes.subscriptionId,
        recurring: 1,
        name: "Nexus",
        description: `${plan.name} plan · ${billingCycle}`,
        image: checkoutLogo,
        prefill: { name: user.displayName || "", email: user.email || "" },
        theme: { color: plan.accent },
        handler: async (response) => {
          if (paymentHandling) return;
          paymentHandling = true;
          if (!valid()) { release(); return; }
          pendingPlan.current = planId; setActivationPending(true);
          setUpgradeDialog(null); setPaymentDialog(true);
          setPaymentReference(response.razorpay_payment_id || '');
          setCheckoutStage("Verifying your payment…");
          try {
            const verify = await post("/razorpay/verify", {
              razorpay_subscription_id: response.razorpay_subscription_id,
              razorpay_payment_id: response.razorpay_payment_id,
              razorpay_signature: response.razorpay_signature,
              planId,
              cycle: billingCycle,
            });
            if (!valid()) return;
            if (!verify.verified) throw new Error(verify.message || "Payment verification failed.");
            pendingPlan.current = planId; setActivationPending(true);
            setCheckoutStage("Payment verified. Awaiting subscription activation…");
            toast("Payment verified. Nexus is confirming your subscription…");
            const synced = await waitForBillingSync(planId, 8, account);
            if (!valid()) return;
            if (synced) {
              pendingPlan.current = null; setActivationPending(false);
              setCheckoutStage("Your subscription is active.");
              toast.success(`Your ${plan.name} subscription is active.`);
              setUpgradeDialog(null);
              await loadBilling();
            } else {
              setCheckoutStage("Payment verified. Activation is pending—refresh status before trying another payment.");
              toast("Payment was verified, but activation is still pending provider confirmation.");
            }
          } catch (error) {
            if (valid()) { setCheckoutStage("Payment could not be confirmed. Refresh billing before trying again."); toast.error(error.message || "Unable to verify the payment."); }
          } finally {
            release();
          }
        },
        modal: {
          ondismiss: () => {
            if (paymentHandling) return;
            if (valid()) { setCheckoutStage("Checkout closed. Refresh billing to check your subscription status."); toast("Checkout closed."); }
            release();
          },
        },
      };

      const razorpay = new window.Razorpay(checkoutOptions);
      razorpay.on("payment.failed", (response) => {
        if (paymentHandling) return;
        const message = response?.error?.description || "The payment processor reported a payment failure.";
        if (valid()) { setCheckoutStage(message); toast.error(message); }
        release();
      });
      razorpay.open();
    } catch (error) {
      if (valid()) { setCheckoutStage(error.message || "Unable to open checkout."); toast.error(error.message || "Unable to open checkout."); }
      release();
    }
  };

  const handleCancel = async () => {
    if (cancelLock.current || checkoutLock.current) return;
    const account = user.uid;
    const generation = ++cancelGeneration.current;
    const valid = () => mounted.current && identity.current === account && cancelGeneration.current === generation;
    if (!planData?.subId) {
      toast("No active paid subscription is available to cancel.");
      return;
    }
    cancelLock.current = true; setCancelling(true);
    try {
      const result = await apiRequest(user, "/razorpay/cancel-sub", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      if (!valid()) return;
      toast.success(result.message || "Cancellation requested.");
      setCancelDialog(false);
      await new Promise((resolve) => setTimeout(resolve, 1200));
      await refreshBillingState(account);
    } catch (error) {
      if (valid()) toast.error(error.message || "Unable to cancel the subscription.");
    } finally {
      if (cancelGeneration.current === generation) cancelLock.current = false; if (valid()) setCancelling(false);
    }
  };

  const isStarter = currentPlan.id === "starter";
  const currentCycle = String(planData?.cycle || "monthly");
  const catalogAmount = Number(currentPlan?.[currentCycle]);
  const currentAmount = planData?.amount != null && planData.amount !== "" && Number.isFinite(Number(planData.amount))
    ? Number(planData.amount)
    : Number.isFinite(catalogAmount) ? catalogAmount : null;
  const currentPrice = isStarter ? "Free" : formatCurrency(currentAmount);
  const nextBillingDate = formatDate(planData?.nextBilling);
  const workspaceLimit = currentPlan.workspaceLimit == null ? null : Number(currentPlan.workspaceLimit);
  const totalPaid = invoices
    .filter((invoice) => String(invoice.status || "").toLowerCase() === "paid")
    .reduce((sum, invoice) => sum + (Number.isFinite(Number(invoice.amount)) ? Number(invoice.amount) : 0), 0);
  const paidCurrencies = [...new Set(invoices.filter((invoice) => String(invoice.status || "").toLowerCase() === "paid").map((invoice) => String(invoice.currency || "INR").toUpperCase()))];

  const heroMetricSx = {
    px: 2,
    py: 1.7,
    borderRadius: 2.5,
    border: darkMode ? "1px solid rgba(148,163,184,.11)" : "1px solid rgba(15,23,42,.07)",
    background: darkMode ? "rgba(255,255,255,.025)" : "rgba(255,255,255,.58)",
  };

  return (
    <Container className="billing-upgrade" data-theme={darkMode ? "dark" : "light"}
      maxWidth="xl"
      sx={{
        py: { xs: 2.5, md: 4 },
        position: "relative",
        zIndex: 1,
        "@keyframes billingRise": {
          from: { opacity: 0, transform: "translateY(8px)" },
          to: { opacity: 1, transform: "translateY(0)" },
        },
        "@media (prefers-reduced-motion: no-preference)": {
          "& .billing-enter": { animation: "billingRise .5s cubic-bezier(.22,1,.36,1) both" },
        },
      }}
    >
      <Box className="billing-enter" sx={{ display: "flex", justifyContent: "space-between", alignItems: { xs: "flex-start", sm: "center" }, flexDirection: { xs: "column", sm: "row" }, gap: 2, mb: 3.5 }}>
        <Box>
          <Typography variant="h4" sx={{ fontWeight: 900, letterSpacing: "-.035em", mb: .5 }}>Billing</Typography>
          <Typography variant="body2" color="text.secondary">Your subscription, spending, and capacity. All in one place.</Typography>
        </Box>
        <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
          <Chip label={currentPlan.name} size="small" sx={{ fontWeight: 800, border: `1px solid ${currentPlan.accent}35`, background: `${currentPlan.accent}10`, color: currentPlan.accent }} />
          <Chip label={currentStatus.label} size="small" sx={{ fontWeight: 800, textTransform: "capitalize", border: `1px solid ${currentStatus.color}28`, background: `${currentStatus.color}0c`, color: currentStatus.color }} />
        </Box>
      </Box>

      {checkoutStage && <Alert severity="info" sx={{ mb: 2 }} action={<Button disabled={upgrading || cancelling || checkingPayment} onClick={checkPaymentStatus}>Check payment status</Button>}>{checkoutStage}</Alert>}
      <Button onClick={() => setPaymentDialog(true)} sx={{ mb: 2, textTransform: 'none' }}>Already paid? Recover payment status</Button>
      {loadError && (
        <Alert severity="warning" sx={{ mb: 2.5, borderRadius: 3 }}>
          Some billing information could not be refreshed. The page is showing the last successfully loaded server state.
        </Alert>
      )}

      <Box
        className="billing-enter billing-hero"
        sx={{
          ...surface(darkMode, true),
          borderRadius: 4,
          overflow: "hidden",
          mb: 3,
          position: "relative",
          animationDelay: ".04s",
          "&::before": {
            content: '""',
            position: "absolute",
            inset: 0,
            pointerEvents: "none",
            background: `radial-gradient(circle at 8% 0%, ${currentPlan.accent}18, transparent 38%), radial-gradient(circle at 92% 100%, ${NEON.blue}0d, transparent 34%)`,
          },
        }}
      >
        <Box sx={{ position: "relative", p: { xs: 2.5, sm: 3.5, md: 4 } }}>
          <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: { xs: "flex-start", md: "center" }, flexDirection: { xs: "column", md: "row" }, gap: 3 }}>
            <Box sx={{ minWidth: 0 }}>
              <Typography variant="overline" sx={{ color: currentPlan.accent, fontWeight: 900, letterSpacing: ".12em" }}>Account subscription</Typography>
              <Box sx={{ display: "flex", alignItems: "center", gap: 1.2, flexWrap: "wrap", mt: .25 }}>
                <Typography variant="h3" sx={{ fontWeight: 900, letterSpacing: "-.045em" }}>{currentPlan.name}</Typography>
                <Chip label={currentStatus.label} size="small" sx={{ height: 24, fontWeight: 800, background: `${currentStatus.color}12`, color: currentStatus.color }} />
              </Box>
              <Box sx={{ display: "flex", alignItems: "baseline", gap: 1, mt: 1.5, flexWrap: "wrap" }}>
                <Typography variant="h4" sx={{ fontWeight: 900, fontVariantNumeric: "tabular-nums" }}>{currentPrice}</Typography>
                {!isStarter && <Typography variant="body2" color="text.secondary">/ {cycleLabel(currentCycle)}</Typography>}
              </Box>
              <Typography variant="body2" color="text.secondary" sx={{ mt: 1, maxWidth: 620, lineHeight: 1.7 }}>
                {isStarter
                  ? "No subscription charge. Explore the plans below whenever your team needs more capacity."
                  : "Manage your Nexus subscription here. Payment and plan changes appear once confirmed."}
              </Typography>
            </Box>

            <Box sx={{ display: "flex", gap: 1.2, flexWrap: "wrap" }}>
              {!isStarter && planData?.subId && planData?.status !== "cancelled" && (
                <Button variant="outlined" disabled={upgrading || cancelling} onClick={() => setCancelDialog(true)} sx={{ borderRadius: 2.5, textTransform: "none", fontWeight: 800, borderColor: `${NEON.red}35`, color: NEON.red }}>
                  Manage subscription
                </Button>
              )}
            </Box>
          </Box>

          <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", sm: "repeat(3,1fr)" }, gap: 1.5, mt: 3.5 }}>
            <Box className="billing-hero-metric" sx={heroMetricSx}>
              <Typography variant="caption" color="text.secondary">Billing cycle</Typography>
              <Typography sx={{ mt: .3, fontWeight: 850, textTransform: "capitalize" }}>{currentCycle}</Typography>
            </Box>
            <Box className="billing-hero-metric" sx={heroMetricSx}>
              <Typography variant="caption" color="text.secondary">Next billing</Typography>
              <Typography sx={{ mt: .3, fontWeight: 850 }}>{nextBillingDate || (isStarter ? "No renewal required" : "Not available")}</Typography>
            </Box>
            <Box className="billing-hero-metric" sx={heroMetricSx}>
              <Typography variant="caption" color="text.secondary">Workspaces owned</Typography>
              <Typography sx={{ mt: .3, fontWeight: 850, fontVariantNumeric: "tabular-nums" }}>
                {formatCount(ownedWorkspaces.length)}{workspaceLimit == null ? " · Unlimited plan limit" : ` / ${formatCount(workspaceLimit)}`}
              </Typography>
            </Box>
          </Box>
        </Box>
      </Box>

      <Box className="billing-enter" sx={{ ...surface(darkMode), borderRadius: 3, p: .7, display: "inline-flex", gap: .4, flexWrap: "wrap", mb: 3, animationDelay: ".08s" }}>
        {TAB_ITEMS.map(({ id, label, icon: Icon }) => {
          const active = tab === id;
          return (
            <Button
              key={id}
              size="small"
              onClick={() => setTab(id)}
              startIcon={<Icon sx={{ fontSize: 17 }} />}
              sx={{
                px: { xs: 1.3, sm: 2 }, py: .9, borderRadius: 2.2, textTransform: "none", fontWeight: 800,
                color: active ? "text.primary" : "text.secondary",
                background: active ? (darkMode ? "rgba(255,255,255,.07)" : "rgba(15,23,42,.055)") : "transparent",
                "&:hover": { background: active ? undefined : (darkMode ? "rgba(255,255,255,.045)" : "rgba(15,23,42,.035)") },
              }}
            >
              {label}
            </Button>
          );
        })}
      </Box>

      {tab === "summary" && (
        <Box className="billing-enter" sx={{ animationDelay: ".12s", mb: 3 }}>
          <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: { xs: "flex-start", sm: "center" }, flexDirection: { xs: "column", sm: "row" }, gap: 1.5, mb: 2 }}>
            <Box>
              <Typography variant="h6" sx={{ fontWeight: 900, letterSpacing: "-.02em" }}>Choose the right plan</Typography>
              <Typography variant="body2" color="text.secondary">Compare capacity and features. Available prices are shown for the selected billing cycle.</Typography>
            </Box>
            {availableBillingCycles.length > 1 && (
              <Box sx={{ ...surface(darkMode), borderRadius: 2.5, p: .45, display: "flex", gap: .35 }}>
                {availableBillingCycles.map((cycle) => (
                  <Button
                    key={cycle}
                    size="small"
                    onClick={() => setBillingCycle(cycle)}
                    sx={{
                      borderRadius: 2, px: 1.8, textTransform: "capitalize", fontWeight: 800,
                      color: billingCycle === cycle ? "#fff" : "text.secondary",
                      background: billingCycle === cycle ? `linear-gradient(135deg,${NEON.blue},${NEON.purple})` : "transparent",
                    }}
                  >
                    {cycle}
                  </Button>
                ))}
              </Box>
            )}
          </Box>

          <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "repeat(3,minmax(0,1fr))" }, gap: 2 }}>
            {plans.map((plan) => {
              const isCurrent = plan.id === currentPlan.id;
              const planIndex = plans.findIndex((item) => item.id === plan.id);
              const isDowngrade = !isCurrent && planIndex < currentPlanIndex;
              const isConfigured = plan.id === "starter" || plan.availableCycles?.includes(billingCycle);
              const priceValue = Number(plan[billingCycle]);
              const priceText = plan.id === "starter" ? "Free" : Number.isFinite(priceValue) ? formatCurrency(priceValue) : "Not available";

              return (
                <Box
                  key={plan.id}
                  sx={{
                    ...surface(darkMode, isCurrent),
                    borderRadius: 4,
                    p: { xs: 2.5, md: 3 },
                    position: "relative",
                    overflow: "hidden",
                    transition: "transform 180ms ease, border-color 180ms ease, box-shadow 180ms ease",
                    borderColor: isCurrent ? `${plan.accent}45` : undefined,
                    "&:hover": { transform: "translateY(-2px)", borderColor: `${plan.accent}35` },
                    "@media (prefers-reduced-motion: reduce)": { transition: "none", "&:hover": { transform: "none" } },
                  }}
                >
                  {isCurrent && <Chip label="Current plan" size="small" sx={{ position: "absolute", top: 18, right: 18, height: 24, fontWeight: 850, background: `${plan.accent}12`, color: plan.accent }} />}
                  {plan.popular && !isCurrent && <Chip label="Popular" size="small" sx={{ position: "absolute", top: 18, right: 18, height: 24, fontWeight: 850, background: `${NEON.purple}12`, color: NEON.purple }} />}

                  <Box sx={{ width: 42, height: 42, borderRadius: 2.7, display: "grid", placeItems: "center", mb: 2.3, background: `${plan.accent}12`, color: plan.accent }}>
                    {plan.id === "enterprise" ? <BusinessRoundedIcon /> : plan.id === "pro" ? <WorkspacePremiumRoundedIcon /> : <ShieldOutlinedIcon />}
                  </Box>
                  <Typography variant="h6" sx={{ fontWeight: 900 }}>{plan.name}</Typography>
                  <Box sx={{ display: "flex", alignItems: "baseline", gap: .8, mt: 1.2, mb: .6 }}>
                    <Typography variant="h4" sx={{ fontWeight: 900, letterSpacing: "-.035em", fontVariantNumeric: "tabular-nums" }}>{priceText}</Typography>
                    {plan.id !== "starter" && isConfigured && <Typography variant="caption" color="text.secondary">/ {cycleLabel(billingCycle)}</Typography>}
                  </Box>
                  {!isConfigured && plan.id !== "starter" && (
                    <Typography variant="caption" sx={{ color: NEON.orange, display: "block", mb: 1.3 }}>This billing cycle is not configured for checkout.</Typography>
                  )}
                  <Divider sx={{ my: 2.2, opacity: .55 }} />

                  <Box sx={{ display: "grid", gap: 1.15, minHeight: { md: 210 } }}>
                    {(Array.isArray(plan.features) ? plan.features : []).map((feature) => (
                      <Box key={feature} sx={{ display: "flex", gap: 1.1, alignItems: "flex-start" }}>
                        <CheckRoundedIcon sx={{ fontSize: 17, color: plan.accent, mt: .1, flexShrink: 0 }} />
                        <Typography variant="body2" color="text.secondary" sx={{ lineHeight: 1.55 }}>{feature}</Typography>
                      </Box>
                    ))}
                  </Box>

                  <Button
                    fullWidth
                    variant={isCurrent ? "contained" : "outlined"}
                    disabled={activationPending || upgrading || cancelling || isCurrent || isDowngrade || !isConfigured || plan.id === "starter"}
                    onClick={() => setUpgradeDialog(plan)}
                    endIcon={!isCurrent && !isDowngrade && isConfigured && plan.id !== "starter" ? <ArrowForwardRoundedIcon /> : null}
                    sx={{
                      mt: 2.5, borderRadius: 2.5, py: 1.05, textTransform: "none", fontWeight: 850,
                      borderColor: `${plan.accent}35`,
                      ...(isCurrent ? { background: `${plan.accent}18`, color: plan.accent, boxShadow: "none", "&:hover": { background: `${plan.accent}18`, boxShadow: "none" } } : {}),
                    }}
                  >
                    {isCurrent ? "Current plan" : isDowngrade ? "Downgrade unavailable" : !isConfigured ? "Checkout unavailable" : plan.id === "starter" ? "Starter" : `Upgrade to ${plan.name}`}
                  </Button>
                </Box>
              );
            })}
          </Box>
        </Box>
      )}

      {tab === "summary" && <Box className="billing-summary billing-enter">
        <Box className="billing-summary-main">
          <Typography variant="overline">CAPACITY / YOUR TEAM</Typography><Typography variant="h4" sx={{ mt: 1, fontWeight: 800 }}>Room to build.</Typography>
          <Typography color="text.secondary" sx={{ mt: 1 }}>Workspace limits follow your account plan. Verification quotas are measured separately for each workspace.</Typography>
          <Box sx={{ my: 3 }}><Typography variant="h3">{ownedWorkspaces.length}<Typography component="span" color="text.secondary" sx={{ ml: 1, fontSize: 16 }}>owned workspaces{workspaceLimit == null ? " · no limit" : ` / ${workspaceLimit} included`}</Typography></Typography></Box>
          {workspaceLimit != null && ownedWorkspaces.length > workspaceLimit && <Alert severity="warning">You have more workspaces than your current allowance. Review your plan and workspace settings.</Alert>}
          <Button sx={{ mt: 2 }} onClick={() => setTab("usage")}>Review workspace usage →</Button>
        </Box>
        <Box className="billing-summary-side"><Typography variant="overline">RECENT BILLING</Typography><Typography variant="h5" sx={{ mt: 1, mb: 2 }}>Your payment history</Typography>
          {invoices.length ? invoices.slice(0, 3).map(invoice => <Box key={invoice.id} className="billing-recent"><Box><Typography sx={{ fontWeight: 700 }}>{invoice.invoiceId || invoice.id}</Typography><Typography variant="caption" color="text.secondary">{formatDate(invoice.date) || "Date unavailable"} · {statusMeta(invoice.status).label}</Typography></Box><Typography sx={{ fontWeight: 700 }}>{formatCurrency(invoice.amount, invoice.currency)}</Typography></Box>) : <Typography color="text.secondary">No invoices yet. Confirmed subscription payments will appear here.</Typography>}
          <Button sx={{ mt: 2 }} onClick={() => setTab("invoices")}>View invoices →</Button>
        </Box>
      </Box>}

      {tab === "usage" && (
        <Box className="billing-enter" sx={{ animationDelay: ".12s" }}>
          <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "minmax(0,1.4fr) minmax(280px,.6fr)" }, gap: 2, mb: 2 }}>
            <Box sx={{ ...surface(darkMode), borderRadius: 4, p: { xs: 2.5, md: 3 } }}>
              <Typography variant="overline" color="text.secondary" sx={{ fontWeight: 850, letterSpacing: ".1em" }}>Workspace capacity</Typography>
              <Box sx={{ display: "flex", alignItems: "baseline", gap: 1, mt: .5 }}>
                <Typography variant="h3" sx={{ fontWeight: 900, letterSpacing: "-.04em", fontVariantNumeric: "tabular-nums" }}>{formatCount(ownedWorkspaces.length)}</Typography>
                <Typography variant="body2" color="text.secondary">owned workspace{ownedWorkspaces.length === 1 ? "" : "s"}</Typography>
              </Box>
              <Typography variant="body2" color="text.secondary" sx={{ mt: 1.2, lineHeight: 1.7 }}>
                {workspaceLimit == null
                  ? "Your current plan does not set a workspace-count limit."
                  : `Your ${currentPlan.name} plan allows ${formatCount(workspaceLimit)} workspace${workspaceLimit === 1 ? "" : "s"}.`}
              </Typography>
              {workspaceLimit != null && workspaceLimit > 0 && (
                <LinearProgress
                  variant="determinate"
                  value={Math.min(100, (ownedWorkspaces.length / workspaceLimit) * 100)}
                  sx={{ mt: 2.2, height: 7, borderRadius: 99, background: `${NEON.blue}10`, "& .MuiLinearProgress-bar": { borderRadius: 99, background: `linear-gradient(90deg,${NEON.blue},${NEON.purple})`, transition: "transform .65s cubic-bezier(.22,1,.36,1)" } }}
                />
              )}
            </Box>

            <Box sx={{ ...surface(darkMode), borderRadius: 4, p: { xs: 2.5, md: 3 } }}>
              <Typography variant="overline" color="text.secondary" sx={{ fontWeight: 850, letterSpacing: ".1em" }}>Usage source</Typography>
              <Typography sx={{ mt: .8, fontWeight: 850 }}>Production verification requests</Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mt: .9, lineHeight: 1.7 }}>Test-environment requests do not consume production verification quota. Usage below reflects your current billing period.</Typography>
            </Box>
          </Box>

          {usageLoadFailures > 0 && (
            <Alert severity="warning" sx={{ mb: 2, borderRadius: 3 }}>
              Usage data is unavailable for {usageLoadFailures} workspace{usageLoadFailures === 1 ? "" : "s"}. No fallback values are being shown.
            </Alert>
          )}

          {workspaceUsage.length === 0 ? (
            <Box sx={{ ...surface(darkMode), borderRadius: 4 }}>
              <EmptyState
                icon={<DataUsageRoundedIcon />}
                title={ownedWorkspaces.length ? "Usage data unavailable" : "No owned workspace usage yet"}
                body={ownedWorkspaces.length
                  ? "Nexus could not load authoritative usage for your workspace. No estimated values are displayed."
                  : "Create and own a workspace to see its production verification quota and current-period usage here."}
              />
            </Box>
          ) : (
            <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", lg: "repeat(2,minmax(0,1fr))" }, gap: 2 }}>
              {workspaceUsage.map(({ workspace, response }) => {
                const quota = response?.quota || null;
                const period = response?.period || null;
                const usage = response?.usage || null;
                const percent = quota?.percent == null ? null : Number(quota.percent);
                const reached = Boolean(quota?.reached);
                const attention = reached ? NEON.red : percent != null && percent >= 80 ? NEON.orange : NEON.blue;
                const resetDate = formatDate(period?.resetsAt);

                return (
                  <Box key={workspace.id} sx={{ ...surface(darkMode), borderRadius: 4, p: { xs: 2.5, md: 3 }, overflow: "hidden", position: "relative" }}>
                    <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 2, mb: 2.5 }}>
                      <Box sx={{ minWidth: 0 }}>
                        <Typography sx={{ fontWeight: 900, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{workspace.name || "Workspace"}</Typography>
                        <Typography variant="caption" color="text.secondary">Verification quota · {response?.planId || currentPlan.id}</Typography>
                      </Box>
                      <Chip
                        size="small"
                        label={period?.status === "current" ? "Current period" : period?.status === "expired" ? "Period ended" : "Period unavailable"}
                        sx={{ height: 24, fontWeight: 800, background: period?.status === "current" ? `${NEON.green}10` : `${NEON.orange}10`, color: period?.status === "current" ? NEON.green : NEON.orange }}
                      />
                    </Box>

                    {quota ? (
                      <>
                        <Box sx={{ display: "flex", alignItems: "baseline", gap: 1, flexWrap: "wrap" }}>
                          <Typography variant="h3" sx={{ fontWeight: 900, letterSpacing: "-.04em", fontVariantNumeric: "tabular-nums" }}>{formatCount(quota.used)}</Typography>
                          <Typography variant="body2" color="text.secondary">
                            {quota.unlimited ? "requests used · unlimited quota" : `of ${formatCount(quota.limit)} requests`}
                          </Typography>
                        </Box>

                        {!quota.unlimited && percent != null && (
                          <>
                            <LinearProgress
                              variant="determinate"
                              value={Math.min(100, Math.max(0, percent))}
                              sx={{ mt: 2, height: 8, borderRadius: 99, background: `${attention}10`, "& .MuiLinearProgress-bar": { borderRadius: 99, background: `linear-gradient(90deg,${attention},${reached ? NEON.red : NEON.purple})`, transition: "transform .7s cubic-bezier(.22,1,.36,1)" } }}
                            />
                            <Box sx={{ display: "flex", justifyContent: "space-between", gap: 2, mt: 1 }}>
                              <Typography variant="caption" color="text.secondary">{percent.toLocaleString("en-IN", { maximumFractionDigits: 1 })}% used</Typography>
                              <Typography variant="caption" sx={{ color: reached ? NEON.red : "text.secondary", fontWeight: reached ? 800 : 500 }}>
                                {reached ? "Monthly limit reached" : `${formatCount(quota.remaining)} remaining`}
                              </Typography>
                            </Box>
                          </>
                        )}

                        <Divider sx={{ my: 2.3, opacity: .55 }} />
                        <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", sm: "repeat(3,1fr)" }, gap: 1.2 }}>
                          <Box>
                            <Typography variant="caption" color="text.secondary">Email requests</Typography>
                            <Typography sx={{ fontWeight: 850, mt: .2, fontVariantNumeric: "tabular-nums" }}>{formatCount(usage?.emailRequests)}</Typography>
                          </Box>
                          <Box>
                            <Typography variant="caption" color="text.secondary">Phone requests</Typography>
                            <Typography sx={{ fontWeight: 850, mt: .2, fontVariantNumeric: "tabular-nums" }}>{formatCount(usage?.phoneRequests)}</Typography>
                          </Box>
                          <Box>
                            <Typography variant="caption" color="text.secondary">Resets</Typography>
                            <Typography sx={{ fontWeight: 850, mt: .2 }}>{resetDate || "Not available"}</Typography>
                          </Box>
                        </Box>
                      </>
                    ) : (
                      <Typography variant="body2" color="text.secondary">Authoritative quota data is unavailable for this workspace.</Typography>
                    )}
                  </Box>
                );
              })}
            </Box>
          )}
        </Box>
      )}

      {tab === "invoices" && (
        <Box className="billing-enter" sx={{ ...surface(darkMode), borderRadius: 4, overflow: "hidden", animationDelay: ".12s" }}>
          <Box sx={{ p: { xs: 2.5, md: 3 }, display: "flex", justifyContent: "space-between", alignItems: { xs: "flex-start", sm: "center" }, flexDirection: { xs: "column", sm: "row" }, gap: 1.5 }}>
            <Box>
              <Typography variant="h6" sx={{ fontWeight: 900 }}>Invoice history</Typography>
              <Typography variant="body2" color="text.secondary">Confirmed payment records for your account. CSV exports contain the full invoice history.</Typography>
            </Box>
            {invoices.length > 0 && (
              <Button variant="outlined" size="small" startIcon={<DownloadRoundedIcon />} disabled={Boolean(exporting)} onClick={() => exportInvoices()} sx={{ borderRadius: 2.4, textTransform: "none", fontWeight: 800 }}>
                Export all
              </Button>
            )}
          </Box>

          {invoices.length > 0 && <Box className="billing-invoice-filters">
            <TextField label="Search invoices" size="small" value={invoiceQuery} onChange={event => setInvoiceQuery(event.target.value)} />
            <TextField select label="Status" size="small" value={invoiceStatus} onChange={event => setInvoiceStatus(event.target.value)}>{["all", "paid", "pending", "failed", "refunded"].map(status => <MenuItem key={status} value={status}>{status === "all" ? "All statuses" : status}</MenuItem>)}</TextField>
            <TextField label="From date" type="date" size="small" InputLabelProps={{ shrink: true }} value={invoiceFrom} onChange={event => setInvoiceFrom(event.target.value)} />
            <TextField label="To date" type="date" size="small" InputLabelProps={{ shrink: true }} value={invoiceTo} onChange={event => setInvoiceTo(event.target.value)} />
          </Box>}
          {invoices.length > 0 && !filteredInvoices.length && <Alert severity="info" sx={{ mx: 3, mb: 2 }}>No invoices match these filters.</Alert>}
          {invoices.length === 0 ? (
            <EmptyState icon={<ReceiptLongRoundedIcon />} title="No invoices yet" body="Your Nexus invoices appear here after a successful payment is confirmed." />
          ) : (
            <>
              <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", sm: "repeat(2,1fr)" }, gap: 1.5, px: { xs: 2.5, md: 3 }, pb: 2.5 }}>
                <Box sx={{ p: 2, borderRadius: 2.8, background: darkMode ? "rgba(255,255,255,.025)" : "rgba(15,23,42,.025)", border: darkMode ? "1px solid rgba(148,163,184,.08)" : "1px solid rgba(15,23,42,.06)" }}>
                  <Typography variant="caption" color="text.secondary">Verified invoices</Typography>
                  <Typography variant="h5" sx={{ mt: .35, fontWeight: 900, fontVariantNumeric: "tabular-nums" }}>{formatCount(invoices.length)}</Typography>
                </Box>
                <Box sx={{ p: 2, borderRadius: 2.8, background: darkMode ? "rgba(255,255,255,.025)" : "rgba(15,23,42,.025)", border: darkMode ? "1px solid rgba(148,163,184,.08)" : "1px solid rgba(15,23,42,.06)" }}>
                  <Typography variant="caption" color="text.secondary">Total paid</Typography>
                  <Typography variant="h5" sx={{ mt: .35, fontWeight: 900, fontVariantNumeric: "tabular-nums" }}>
                    {paidCurrencies.length <= 1 ? formatCurrency(totalPaid, paidCurrencies[0] || "INR") : "Multiple currencies"}
                  </Typography>
                </Box>
              </Box>

              <TableContainer sx={{ overflowX: "auto" }}>
                <Table sx={{ minWidth: 760 }}>
                  <TableHead>
                    <TableRow>
                      {["Invoice", "Date", "Plan", "Amount", "Status", ""].map((heading) => (
                        <TableCell key={heading} sx={{ py: 1.4, fontSize: 11, fontWeight: 850, color: "text.secondary", borderColor: darkMode ? "rgba(148,163,184,.08)" : "rgba(15,23,42,.06)" }}>{heading}</TableCell>
                      ))}
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {filteredInvoices.map((invoice) => {
                      const invoiceStatus = statusMeta(invoice.status);
                      return (
                        <TableRow key={invoice.id} sx={{ transition: "background 160ms ease", "&:hover": { background: darkMode ? "rgba(255,255,255,.025)" : "rgba(15,23,42,.025)" } }}>
                          <TableCell sx={{ borderColor: darkMode ? "rgba(148,163,184,.08)" : "rgba(15,23,42,.06)" }}><Typography variant="body2" sx={{ fontWeight: 800, fontFamily: "monospace" }}>{invoice.invoiceId || invoice.id}</Typography></TableCell>
                          <TableCell sx={{ borderColor: darkMode ? "rgba(148,163,184,.08)" : "rgba(15,23,42,.06)" }}><Typography variant="body2">{formatDate(invoice.date) || "Not available"}</Typography></TableCell>
                          <TableCell sx={{ borderColor: darkMode ? "rgba(148,163,184,.08)" : "rgba(15,23,42,.06)" }}><Typography variant="body2" color="text.secondary">{invoice.plan || invoice.description || "Not available"}</Typography></TableCell>
                          <TableCell sx={{ borderColor: darkMode ? "rgba(148,163,184,.08)" : "rgba(15,23,42,.06)" }}><Typography variant="body2" sx={{ fontWeight: 850, fontVariantNumeric: "tabular-nums" }}>{formatCurrency(invoice.amount, invoice.currency || "INR")}</Typography></TableCell>
                          <TableCell sx={{ borderColor: darkMode ? "rgba(148,163,184,.08)" : "rgba(15,23,42,.06)" }}><Chip label={invoiceStatus.label} size="small" sx={{ height: 23, fontWeight: 800, background: `${invoiceStatus.color}10`, color: invoiceStatus.color }} /></TableCell>
                          <TableCell align="right" sx={{ borderColor: darkMode ? "rgba(148,163,184,.08)" : "rgba(15,23,42,.06)" }}>
                            <IconButton aria-label={`Export invoice ${invoice.invoiceId || invoice.id}`} size="small" disabled={Boolean(exporting)} onClick={() => exportInvoices(invoice.id)}><DownloadRoundedIcon sx={{ fontSize: 18 }} /></IconButton>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </TableContainer>
            </>
          )}
        </Box>
      )}

      {tab === "settings" && (
        <Box className="billing-enter" sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", lg: "repeat(2,minmax(0,1fr))" }, gap: 2, animationDelay: ".12s" }}>
          <Box sx={{ ...surface(darkMode), borderRadius: 4, p: { xs: 2.5, md: 3 } }}>
            <Box sx={{ width: 44, height: 44, borderRadius: 2.7, display: "grid", placeItems: "center", mb: 2.3, background: `${NEON.blue}10`, color: NEON.blue }}>
              <CreditCardRoundedIcon />
            </Box>
            <Typography variant="h6" sx={{ fontWeight: 900 }}>Payment processing</Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mt: 1, lineHeight: 1.7 }}>
              Manage your Nexus subscription payments through secure checkout.
            </Typography>
            <Box sx={{ mt: 2.3, p: 2, borderRadius: 2.8, background: darkMode ? "rgba(255,255,255,.025)" : "rgba(15,23,42,.025)" }}>
              <Typography variant="caption" color="text.secondary">Payment method</Typography>
              <Typography sx={{ mt: .35, fontWeight: 850 }}>Managed through secure checkout</Typography>
            </Box>
          </Box>

          <Box sx={{ ...surface(darkMode), borderRadius: 4, p: { xs: 2.5, md: 3 } }}>
            <Box sx={{ width: 44, height: 44, borderRadius: 2.7, display: "grid", placeItems: "center", mb: 2.3, background: `${NEON.purple}10`, color: NEON.purple }}>
              <EventRepeatRoundedIcon />
            </Box>
            <Typography variant="h6" sx={{ fontWeight: 900 }}>Subscription management</Typography>
            <Box sx={{ display: "grid", gap: 1.4, mt: 2 }}>
              <Box sx={{ display: "flex", justifyContent: "space-between", gap: 2 }}><Typography variant="body2" color="text.secondary">Plan</Typography><Typography variant="body2" sx={{ fontWeight: 850 }}>{currentPlan.name}</Typography></Box>
              <Box sx={{ display: "flex", justifyContent: "space-between", gap: 2 }}><Typography variant="body2" color="text.secondary">Status</Typography><Typography variant="body2" sx={{ fontWeight: 850, color: currentStatus.color }}>{currentStatus.label}</Typography></Box>
              <Box sx={{ display: "flex", justifyContent: "space-between", gap: 2 }}><Typography variant="body2" color="text.secondary">Cycle</Typography><Typography variant="body2" sx={{ fontWeight: 850, textTransform: "capitalize" }}>{currentCycle}</Typography></Box>
              <Box sx={{ display: "flex", justifyContent: "space-between", gap: 2 }}><Typography variant="body2" color="text.secondary">Next billing</Typography><Typography variant="body2" sx={{ fontWeight: 850, textAlign: "right" }}>{nextBillingDate || (isStarter ? "Not applicable" : "Not available")}</Typography></Box>
            </Box>
            {!isStarter && planData?.subId && planData?.status !== "cancelled" && (
              <Button variant="outlined" disabled={upgrading || cancelling} onClick={() => setCancelDialog(true)} sx={{ mt: 2.5, borderRadius: 2.5, textTransform: "none", fontWeight: 800, borderColor: `${NEON.red}35`, color: NEON.red }}>
                Cancel at cycle end
              </Button>
            )}
          </Box>
        </Box>
      )}

      <Dialog open={paymentDialog} onClose={() => setPaymentDialog(false)} fullWidth maxWidth="sm" PaperProps={{ sx: { borderRadius: 4, ...surface(darkMode, true) } }}>
        <DialogTitle>{phoneCheckoutUrl ? 'Scan to continue payment' : 'Payment confirmation'}</DialogTitle>
        <DialogContent>
          {(upgrading || checkingPayment) && <LinearProgress sx={{ mb: 3 }} />}
          <Alert severity={activationPending ? 'info' : 'success'} sx={{ mb: 3 }} role="status">{checkoutStage || 'Already paid? Ask Nexus to check your existing payment. This does not charge you again.'}</Alert>
          {phoneCheckoutUrl && <PhoneCheckout url={phoneCheckoutUrl} />}
          <TextField fullWidth label="Payment reference (optional)" placeholder="pay_…" value={paymentReference} onChange={e => setPaymentReference(e.target.value)} helperText="Use the reference from your receipt. Leave blank to check your recent subscription." />
          {checkoutSubscription.current && <Typography variant="caption" component="p" sx={{ mt: 2 }}>Subscription: {checkoutSubscription.current}</Typography>}
          <Typography variant="body2" sx={{ mt: 3 }}>If money was deducted, do not start another payment. Nexus activates your plan after the payment processor confirms your subscription and captured payment.</Typography>
        </DialogContent>
        <DialogActions sx={{ p: 3 }}>
          <Button onClick={() => setPaymentDialog(false)}>Back to billing</Button>
          <Button variant="contained" disabled={upgrading || checkingPayment} onClick={checkPaymentStatus}>{checkingPayment ? 'Checking payment…' : 'Check existing payment'}</Button>
        </DialogActions>
      </Dialog>
      <Dialog open={Boolean(upgradeDialog)} onClose={() => !upgrading && setUpgradeDialog(null)} fullWidth maxWidth="sm" PaperProps={{ sx: { borderRadius: 4, ...surface(darkMode, true) } }}>
        <DialogTitle component="div" sx={{ px: 3, pt: 3, pb: 1 }}>
          <Typography variant="overline" color="text.secondary" sx={{ fontWeight: 850, letterSpacing: ".1em" }}>Change plan</Typography>
          <Typography variant="h5" sx={{ fontWeight: 900, mt: .3 }}>Upgrade to {upgradeDialog?.name}</Typography>
        </DialogTitle>
        <DialogContent sx={{ px: 3 }}>
          <Box sx={{ display: "flex", alignItems: "baseline", gap: 1, my: 2 }}>
            <Typography variant="h3" sx={{ fontWeight: 900, letterSpacing: "-.04em" }}>
              {upgradeDialog ? formatCurrency(upgradeDialog[billingCycle]) : ""}
            </Typography>
            <Typography variant="body2" color="text.secondary">/ {cycleLabel(billingCycle)}</Typography>
          </Box>
          <Typography variant="body2" color="text.secondary" sx={{ lineHeight: 1.7, mb: 2.5 }}>
            Subscribe to Nexus through secure checkout. Your plan activates after your payment is securely verified.
          </Typography>
          <Box sx={{ display: "grid", gap: 1.1 }}>
            {(upgradeDialog?.features || []).map((feature) => (
              <Box key={feature} sx={{ display: "flex", gap: 1.1, alignItems: "flex-start" }}>
                <CheckRoundedIcon sx={{ fontSize: 17, color: upgradeDialog?.accent || NEON.blue, mt: .15 }} />
                <Typography variant="body2" color="text.secondary">{feature}</Typography>
              </Box>
            ))}
          </Box>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 3, pt: 2, gap: 1, flexWrap: 'wrap' }}>
          <Button onClick={() => setUpgradeDialog(null)} disabled={upgrading || cancelling} sx={{ borderRadius: 2.4, textTransform: "none", fontWeight: 800 }}>Cancel</Button>
          <Button variant="outlined" onClick={() => handleUpgrade(upgradeDialog?.id, true)} disabled={activationPending || upgrading || cancelling}>Open checkout on phone</Button>
          <Button
            variant="contained"
            onClick={() => handleUpgrade(upgradeDialog?.id)}
            disabled={activationPending || upgrading || cancelling}
            endIcon={upgrading ? <CircularProgress size={15} color="inherit" /> : <ArrowForwardRoundedIcon />}
            sx={{ borderRadius: 2.4, px: 2.3, textTransform: "none", fontWeight: 850, color: "#fff", background: `linear-gradient(135deg,${NEON.blue},${NEON.purple})` }}
          >
            {upgrading ? "Opening checkout…" : "Continue to payment"}
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={cancelDialog} onClose={() => !cancelling && setCancelDialog(false)} fullWidth maxWidth="xs" PaperProps={{ sx: { borderRadius: 4, ...surface(darkMode, true) } }}>
        <DialogTitle component="div" sx={{ px: 3, pt: 3, pb: 1 }}><Typography variant="h6" sx={{ fontWeight: 900 }}>Cancel subscription?</Typography></DialogTitle>
        <DialogContent sx={{ px: 3 }}>
          <Typography variant="body2" color="text.secondary" sx={{ lineHeight: 1.7 }}>
            Nexus will request cancellation of this subscription at the end of the current billing cycle.
            {nextBillingDate ? ` The current billing record shows ${nextBillingDate} as the next billing date.` : " No renewal date is currently available from the billing record."}
          </Typography>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 3, pt: 2, gap: 1 }}>
          <Button onClick={() => setCancelDialog(false)} disabled={cancelling} sx={{ borderRadius: 2.4, textTransform: "none", fontWeight: 800 }}>Keep plan</Button>
          <Button variant="contained" onClick={handleCancel} disabled={cancelling} sx={{ borderRadius: 2.4, textTransform: "none", fontWeight: 850, background: NEON.red, color: "#fff" }}>
            {cancelling ? "Requesting…" : "Cancel at cycle end"}
          </Button>
        </DialogActions>
      </Dialog>
    </Container>
  );
}
