"use client";

import {
  FormEvent,
  ReactNode,
  useEffect,
  useState,
  useTransition,
} from "react";
import type { AnyRecord, DashboardActionName, DashboardSectionName } from "@/lib/types";

type DashboardClientProps = {
  csrfToken: string;
};

type SectionKey =
  | "customers"
  | "drivers"
  | "finance"
  | "live-ops"
  | "overview"
  | "partners"
  | "rides"
  | "scheduled-rides"
  | "settings"
  | "support";

type TableColumn<Row extends AnyRecord> = {
  label: string;
  render: (row: Row) => ReactNode;
};

const sectionOrder: SectionKey[] = [
  "overview",
  "live-ops",
  "rides",
  "drivers",
  "customers",
  "scheduled-rides",
  "finance",
  "partners",
  "support",
  "settings",
];

const formatCurrency = (value: unknown) =>
  new Intl.NumberFormat("en-NG", {
    currency: "NGN",
    maximumFractionDigits: 0,
    style: "currency",
  }).format(Number(value || 0));

const formatNumber = (value: unknown) =>
  new Intl.NumberFormat("en-US").format(Number(value || 0));

const formatDateTime = (value: unknown) => {
  if (!value) {
    return "—";
  }

  const date = new Date(String(value));
  if (Number.isNaN(date.getTime())) {
    return "—";
  }

  return date.toLocaleString("en-NG", {
    dateStyle: "medium",
    timeStyle: "short",
  });
};

const formatDate = (value: unknown) => {
  if (!value) {
    return "—";
  }

  const date = new Date(String(value));
  if (Number.isNaN(date.getTime())) {
    return "—";
  }

  return date.toLocaleDateString("en-NG", {
    dateStyle: "medium",
  });
};

const renderTone = (value: string) => {
  if (["active", "ok", "paid", "verified", "resolved", "true", "success"].includes(value)) {
    return "success";
  }
  if (
    ["pending", "warning", "awaiting_subscription", "processing", "dispatching"].includes(
      value,
    )
  ) {
    return "warning";
  }
  if (["danger", "failed", "cancelled", "reversed", "pending_verification"].includes(value)) {
    return "danger";
  }
  if (["subscription_expired", "attention", "under_review", "paused"].includes(value)) {
    return "attention";
  }
  return "neutral";
};

function Pill({ label, tone }: { label: string; tone?: string }) {
  return <span className={`pill ${tone || "neutral"}`}>{label}</span>;
}

function MetricCard({
  label,
  note,
  value,
}: {
  label: string;
  note?: string;
  value: string;
}) {
  return (
    <div className="metric-card">
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{note || ""}</small>
    </div>
  );
}

function Subcard({
  actions,
  eyebrow,
  title,
  children,
}: {
  actions?: ReactNode;
  eyebrow: string;
  title: string;
  children: ReactNode;
}) {
  return (
    <div className="subcard">
      <div className="subcard-header">
        <div>
          <span>{eyebrow}</span>
          <h4>{title}</h4>
        </div>
        {actions}
      </div>
      {children}
    </div>
  );
}

function Section({
  id,
  title,
  eyebrow,
  onRefresh,
  children,
}: {
  id: string;
  title: string;
  eyebrow: string;
  onRefresh: () => void;
  children: ReactNode;
}) {
  return (
    <section className="dashboard-section" id={id}>
      <div className="section-head">
        <div>
          <p className="eyebrow">{eyebrow}</p>
          <h3>{title}</h3>
        </div>
        <button className="ghost-button" onClick={onRefresh} type="button">
          Refresh
        </button>
      </div>
      <div className="section-content">{children}</div>
    </section>
  );
}

function EmptyState({ title, message }: { title: string; message: string }) {
  return (
    <div className="empty-state">
      <h4>{title}</h4>
      <p>{message}</p>
    </div>
  );
}

function ErrorState({ title, message }: { title: string; message: string }) {
  return (
    <div className="error-card">
      <h4>{title}</h4>
      <p>{message}</p>
    </div>
  );
}

function LoadingCard({ message }: { message: string }) {
  return <div className="loading-card">{message}</div>;
}

function DataTable<Row extends AnyRecord>({
  columns,
  emptyMessage,
  rows,
}: {
  columns: TableColumn<Row>[];
  emptyMessage: string;
  rows: Row[];
}) {
  if (!rows.length) {
    return <EmptyState message={emptyMessage} title="Nothing to show" />;
  }

  return (
    <div className="table-shell">
      <table>
        <thead>
          <tr>
            {columns.map((column) => (
              <th key={column.label}>{column.label}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr key={String(row.id || row.key || index)}>
              {columns.map((column) => (
                <td key={`${String(row.id || index)}-${column.label}`}>{column.render(row)}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Stack({
  title,
  subtitle,
  tertiary,
}: {
  title: string;
  subtitle?: string;
  tertiary?: string;
}) {
  return (
    <div className="stack">
      <strong>{title}</strong>
      {subtitle ? <span className="muted">{subtitle}</span> : null}
      {tertiary ? <span className="muted mono">{tertiary}</span> : null}
    </div>
  );
}

async function fetchSection(section: DashboardSectionName, params?: URLSearchParams) {
  const suffix = params?.toString() ? `?${params.toString()}` : "";
  const response = await fetch(`/api/admin/sections/${section}${suffix}`, {
    cache: "no-store",
  });
  const payload = (await response.json()) as { data?: AnyRecord; error?: string };

  if (response.status === 401) {
    window.location.href = "/login";
    throw new Error("Your admin session has expired.");
  }

  if (!response.ok || payload.error) {
    throw new Error(payload.error || `Could not load ${section}.`);
  }

  return payload.data;
}

export function DashboardClient({ csrfToken }: DashboardClientProps) {
  const [session, setSession] = useState<AnyRecord | null>(null);
  const [sectionData, setSectionData] = useState<Record<SectionKey, AnyRecord | AnyRecord[] | null>>({
    customers: null,
    drivers: null,
    finance: null,
    "live-ops": null,
    overview: null,
    partners: null,
    rides: null,
    "scheduled-rides": null,
    settings: null,
    support: null,
  });
  const [sectionErrors, setSectionErrors] = useState<Record<string, string>>({});
  const [loadingSections, setLoadingSections] = useState<Record<string, boolean>>({});
  const [lastRefresh, setLastRefresh] = useState("");
  const [toast, setToast] = useState<{
    message: string;
    title: string;
    tone: "error" | "info" | "success" | "warning";
  } | null>(null);
  const [filters, setFilters] = useState({
    customersSearch: "",
    driversSearch: "",
    partnersSearch: "",
    ridesPaymentStatus: "all",
    ridesSearch: "",
    ridesStatus: "all",
    scheduledSearch: "",
    scheduledStatus: "all",
    supportSearch: "",
  });
  const [isPending, startTransition] = useTransition();

  const notify = (
    title: string,
    message: string,
    tone: "error" | "info" | "success" | "warning",
  ) => {
    setToast({ message, title, tone });
    window.setTimeout(() => setToast(null), 3600);
  };

  const loadSingleSection = async (section: SectionKey) => {
    setLoadingSections((current) => ({ ...current, [section]: true }));
    setSectionErrors((current) => ({ ...current, [section]: "" }));

    try {
      let params: URLSearchParams | undefined;

      if (section === "rides") {
        params = new URLSearchParams({
          paymentStatus: filters.ridesPaymentStatus,
          search: filters.ridesSearch,
          status: filters.ridesStatus,
        });
      }

      if (section === "drivers") {
        params = new URLSearchParams({ search: filters.driversSearch });
      }

      if (section === "customers") {
        params = new URLSearchParams({ search: filters.customersSearch });
      }

      if (section === "scheduled-rides") {
        params = new URLSearchParams({
          search: filters.scheduledSearch,
          status: filters.scheduledStatus,
        });
      }

      if (section === "partners") {
        params = new URLSearchParams({ search: filters.partnersSearch });
      }

      if (section === "support") {
        params = new URLSearchParams({ search: filters.supportSearch });
      }

      const data = await fetchSection(section, params);
      setSectionData((current) => ({ ...current, [section]: data }));
    } catch (error) {
      setSectionErrors((current) => ({
        ...current,
        [section]:
          error instanceof Error ? error.message : `Could not load ${section}.`,
      }));
    } finally {
      setLoadingSections((current) => ({ ...current, [section]: false }));
    }
  };

  const loadEverything = async () => {
    await Promise.all([
      ...sectionOrder.map((section) => loadSingleSection(section)),
      fetch("/api/auth/session", { cache: "no-store" })
        .then(async (response) => {
          const payload = (await response.json()) as {
            data?: AnyRecord;
            error?: string;
          };
          if (response.status === 401) {
            window.location.href = "/login";
            return;
          }
          if (response.ok && payload.data) {
            setSession(payload.data);
          }
        })
        .catch(() => undefined),
    ]);

    setLastRefresh(
      new Date().toLocaleString("en-NG", {
        dateStyle: "medium",
        timeStyle: "short",
      }),
    );
  };

  useEffect(() => {
    void loadEverything();
  }, []);

  async function adminAction(action: DashboardActionName, payload: AnyRecord) {
    const response = await fetch("/api/admin/actions", {
      body: JSON.stringify({ action, payload }),
      cache: "no-store",
      headers: {
        "Content-Type": "application/json",
        "X-CSRF-Token": csrfToken,
      },
      method: "POST",
    });

    const data = (await response.json()) as { data?: AnyRecord; error?: string };
    if (response.status === 401) {
      window.location.href = "/login";
      throw new Error("Your admin session has expired.");
    }
    if (!response.ok || data.error) {
      throw new Error(data.error || "Action failed.");
    }

    return data.data;
  }

  async function handleLogout() {
    await fetch("/api/auth/logout", {
      method: "POST",
    });
    window.location.href = "/login";
  }

  async function handleRideCancel(rideId: string) {
    const reason =
      window.prompt("Why are you cancelling this ride?", "Cancelled by Drop admin") ||
      "Cancelled by Drop admin";

    if (!window.confirm("Cancel this ride across the live system?")) {
      return;
    }

    await adminAction("cancel_ride", { reason, rideId });
    await Promise.all([
      loadSingleSection("overview"),
      loadSingleSection("live-ops"),
      loadSingleSection("rides"),
    ]);
    notify("Ride cancelled", "The ride was cancelled successfully.", "success");
  }

  async function handleRideFollowUp(rideId: string, currentStatus: string, currentNote: string) {
    const status =
      window.prompt(
        "Set follow-up status: none, customer_paying_soon, under_review, resolved",
        currentStatus,
      ) || currentStatus;
    const note = window.prompt("Optional follow-up note", currentNote) || currentNote;

    await adminAction("update_ride_follow_up", {
      payment_follow_up_note: note,
      payment_follow_up_reported_at: new Date().toISOString(),
      payment_follow_up_status: status,
      rideId,
    });
    await Promise.all([
      loadSingleSection("overview"),
      loadSingleSection("live-ops"),
      loadSingleSection("rides"),
    ]);
    notify("Ride updated", "Payment follow-up was updated.", "success");
  }

  async function handleDriverToggle(driverId: string, field: "has_paid" | "is_verified", nextValue: boolean) {
    await adminAction("update_driver", {
      [field]: nextValue,
      driverId,
      subscription_expires_at:
        field === "has_paid"
          ? nextValue
            ? new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
            : null
          : undefined,
    });
    await Promise.all([
      loadSingleSection("overview"),
      loadSingleSection("live-ops"),
      loadSingleSection("drivers"),
    ]);
    notify("Driver updated", "Driver access state was updated.", "success");
  }

  async function handleCustomerVerify(customerId: string, nextValue: boolean) {
    await adminAction("update_customer", {
      customerId,
      is_verified: nextValue,
    });
    await loadSingleSection("customers");
    notify("Customer updated", "Customer verification was updated.", "success");
  }

  async function handleScheduledCancel(scheduledRideId: string) {
    if (!window.confirm("Cancel this scheduled ride?")) {
      return;
    }
    await adminAction("cancel_scheduled_ride", { scheduledRideId });
    await Promise.all([
      loadSingleSection("overview"),
      loadSingleSection("live-ops"),
      loadSingleSection("scheduled-rides"),
    ]);
    notify("Scheduled ride cancelled", "The booking was cancelled.", "success");
  }

  async function handlePartnerStatus(partnerId: string, nextStatus: string) {
    await adminAction("update_partner", {
      partnerId,
      status: nextStatus,
    });
    await loadSingleSection("partners");
    notify("Partner updated", "Partner status was updated.", "success");
  }

  async function handleCommissionStatus(commissionId: string, nextStatus: string) {
    await adminAction("update_partner_commission", {
      approved_at: nextStatus === "approved" ? new Date().toISOString() : undefined,
      commissionId,
      paid_at: nextStatus === "paid" ? new Date().toISOString() : undefined,
      status: nextStatus,
    });
    await loadSingleSection("finance");
    notify("Commission updated", "Partner commission status was updated.", "success");
  }

  async function handleReportStatus(reportId: string, status: string) {
    await adminAction("update_report", {
      reportId,
      status,
    });
    await Promise.all([
      loadSingleSection("overview"),
      loadSingleSection("live-ops"),
      loadSingleSection("support"),
    ]);
    notify("Report updated", "Support report status was updated.", "success");
  }

  async function submitNotification(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);

    await adminAction("send_push_notification", {
      body: String(form.get("body") || ""),
      channelId: String(form.get("channelId") || "trip-alerts"),
      recipientIds: String(form.get("recipientIds") || "")
        .split(",")
        .map((value) => value.trim())
        .filter(Boolean),
      title: String(form.get("title") || ""),
    });
    event.currentTarget.reset();
    notify("Notification sent", "Push notification has been queued.", "success");
  }

  async function submitPartner(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);

    await adminAction("create_partner", {
      contact_email: String(form.get("contact_email") || ""),
      contact_phone: String(form.get("contact_phone") || ""),
      default_commission_type: String(form.get("default_commission_type") || "flat"),
      default_commission_value: Number(form.get("default_commission_value") || 0),
      default_partner_fee_amount: Number(form.get("default_partner_fee_amount") || 0),
      name: String(form.get("name") || ""),
      payout_schedule: String(form.get("payout_schedule") || "monthly"),
      slug: String(form.get("slug") || ""),
    });
    event.currentTarget.reset();
    await loadSingleSection("partners");
    notify("Partner created", "The partner was added successfully.", "success");
  }

  async function submitDispatch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);

    await adminAction("update_dispatch_settings", {
      driverLocationStaleSeconds: Number(form.get("driverLocationStaleSeconds") || 300),
      liveEtaRefreshSeconds: Number(form.get("liveEtaRefreshSeconds") || 90),
      maxPickupDistanceM: Number(form.get("maxPickupDistanceM") || 15000),
      routingCandidateLimit: Number(form.get("routingCandidateLimit") || 3),
      routingEnabled: String(form.get("routingEnabled")) === "true",
      routingPreference: String(form.get("routingPreference") || "TRAFFIC_AWARE_OPTIMAL"),
      routingProvider: String(form.get("routingProvider") || "google_routes"),
      routingRequestTimeoutMs: Number(form.get("routingRequestTimeoutMs") || 6000),
    });
    await Promise.all([loadSingleSection("overview"), loadSingleSection("settings")]);
    notify("Dispatch saved", "Dispatch settings were updated.", "success");
  }

  async function submitAppConfig(
    key: string,
    description: string,
    value: AnyRecord,
    sectionsToRefresh: SectionKey[],
  ) {
    await adminAction("update_app_config", {
      description,
      key,
      value,
    });
    await Promise.all(sectionsToRefresh.map((section) => loadSingleSection(section)));
  }

  async function submitFeeConfig(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);

    await submitAppConfig(
      "driver_monthly_fee",
      "Driver subscription fee and provider fee settings.",
      {
        amount: Number(form.get("amount") || 0),
        currency: String(form.get("currency") || "NGN"),
        payment_provider_fee_percent: Number(
          form.get("payment_provider_fee_percent") || 1.5,
        ),
      },
      ["overview", "finance", "settings"],
    );
    notify("Fee saved", "Driver monthly fee settings were updated.", "success");
  }

  async function submitHybridConfig(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const serviceFeeBands = JSON.parse(String(form.get("service_fee_bands") || "[]"));

    await submitAppConfig(
      "hybrid_finance_settings",
      "Hybrid cashless marketplace settings for service fees, withdrawals, and partner settlement.",
      {
        driver_auto_withdraw_enabled_default:
          String(form.get("driver_auto_withdraw_enabled_default")) === "true",
        driver_minimum_withdrawal_amount: Number(
          form.get("driver_minimum_withdrawal_amount") || 1000,
        ),
        partner_commission_hold_days: Number(
          form.get("partner_commission_hold_days") || 7,
        ),
        payment_provider_customer_fee_percent: Number(
          form.get("payment_provider_customer_fee_percent") || 0,
        ),
        service_fee_bands: serviceFeeBands,
      },
      ["overview", "finance", "settings"],
    );
    notify("Finance saved", "Hybrid finance settings were updated.", "success");
  }

  async function submitServiceTypeCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);

    await adminAction("create_service_type", {
      capacity: Number(form.get("capacity") || 4),
      description: String(form.get("description") || ""),
      label: String(form.get("label") || ""),
      name: String(form.get("name") || "car"),
      sort_order: Number(form.get("sort_order") || 0),
    });
    event.currentTarget.reset();
    await loadSingleSection("settings");
    notify("Service created", "The service type was added.", "success");
  }

  async function submitCancelReasonCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);

    await adminAction("create_cancel_reason", {
      display_order: Number(form.get("display_order") || 0),
      label: String(form.get("label") || ""),
      role: String(form.get("role") || "customer"),
      value: String(form.get("value") || ""),
    });
    event.currentTarget.reset();
    await loadSingleSection("settings");
    notify("Reason created", "The cancel reason was added.", "success");
  }

  async function submitServiceTypeUpdate(
    event: FormEvent<HTMLFormElement>,
    serviceTypeId: string,
  ) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);

    await adminAction("update_service_type", {
      capacity: Number(form.get("capacity") || 4),
      description: String(form.get("description") || ""),
      is_active: String(form.get("is_active")) === "true",
      label: String(form.get("label") || ""),
      serviceTypeId,
      sort_order: Number(form.get("sort_order") || 0),
    });
    await loadSingleSection("settings");
    notify("Service updated", "Service type changes were saved.", "success");
  }

  async function submitCancelReasonUpdate(
    event: FormEvent<HTMLFormElement>,
    cancelReasonId: string,
  ) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);

    await adminAction("update_cancel_reason", {
      cancelReasonId,
      display_order: Number(form.get("display_order") || 0),
      is_active: String(form.get("is_active")) === "true",
      label: String(form.get("label") || ""),
      value: String(form.get("value") || ""),
    });
    await loadSingleSection("settings");
    notify("Cancel reason updated", "Cancel reason changes were saved.", "success");
  }

  const overview = sectionData["overview"] as AnyRecord | null;
  const liveOps = sectionData["live-ops"] as AnyRecord | null;
  const rides = (sectionData["rides"] as AnyRecord[]) || [];
  const drivers = (sectionData["drivers"] as AnyRecord[]) || [];
  const customers = (sectionData["customers"] as AnyRecord[]) || [];
  const scheduledRides = (sectionData["scheduled-rides"] as AnyRecord[]) || [];
  const finance = sectionData["finance"] as AnyRecord | null;
  const partners = (sectionData["partners"] as AnyRecord[]) || [];
  const support = sectionData["support"] as AnyRecord | null;
  const settings = sectionData["settings"] as AnyRecord | null;

  return (
    <>
      <div className="shell">
        <aside className="sidebar">
          <div className="brand-block">
            <p className="eyebrow">Drop Control</p>
            <h1>Ops Dashboard</h1>
            <p className="sidebar-copy">
              Next.js admin control room for live service operations, dispatch,
              finance, partners, and support.
            </p>
          </div>

          <div className="sidebar-status">
            <div className={`health-pill ${overview ? "ok" : "warn"}`}>
              {overview ? "Authenticated admin session" : "Connecting..."}
            </div>
            <p className="sidebar-meta">
              {session?.username ? `Signed in as ${session.username}` : "Admin session active"}
            </p>
            <p className="sidebar-meta">
              {lastRefresh ? `Last synced ${lastRefresh}` : "Waiting for first sync"}
            </p>
          </div>

          <nav className="nav-list">
            <a href="#overview">Overview</a>
            <a href="#live-ops">Live Ops</a>
            <a href="#rides">Rides</a>
            <a href="#drivers">Drivers</a>
            <a href="#customers">Customers</a>
            <a href="#scheduled-rides">Scheduled</a>
            <a href="#finance">Finance</a>
            <a href="#partners">Partners</a>
            <a href="#support">Support</a>
            <a href="#settings">Settings</a>
          </nav>

          <div className="section-actions">
            <button
              className="primary-button wide-button"
              onClick={() => startTransition(() => void loadEverything())}
              type="button"
            >
              {isPending ? "Refreshing..." : "Refresh Entire Dashboard"}
            </button>
            <button className="ghost-button wide-button" onClick={handleLogout} type="button">
              Sign out
            </button>
          </div>
        </aside>

        <main className="main">
          <section className="hero">
            <div className="hero-copy">
              <p className="eyebrow">Command Center</p>
              <h2>Operate Drop from one secure surface</h2>
              <p>
                This dashboard runs inside Next.js with typed route handlers,
                edge-compatible server code, signed admin sessions, and CSRF
                protection around privileged mutations.
              </p>
            </div>
            <div className="hero-meta">
              <div className="hero-card">
                <span>Runtime</span>
                <strong>Next.js App Router + Edge APIs</strong>
                <small>No standalone Express server. Admin APIs are now part of the app.</small>
              </div>
              <div className="hero-card">
                <span>Security</span>
                <strong>Signed session + CSRF</strong>
                <small>Service role access stays server-side and never reaches the browser.</small>
              </div>
            </div>
          </section>

          <Section
            eyebrow="Section 1"
            id="overview"
            onRefresh={() => void loadSingleSection("overview")}
            title="Overview"
          >
            {loadingSections["overview"] ? (
              <LoadingCard message="Refreshing overview..." />
            ) : sectionErrors["overview"] ? (
              <ErrorState message={sectionErrors["overview"]} title="Overview unavailable" />
            ) : !overview ? (
              <EmptyState message="Overview has not loaded yet." title="No data" />
            ) : (
              <>
                <div className="metric-grid">
                  <MetricCard
                    label="Drivers"
                    note={`${formatNumber(overview.counts?.verifiedDrivers)} verified / ${formatNumber(
                      overview.counts?.subscribedDrivers,
                    )} paid`}
                    value={formatNumber(overview.counts?.drivers)}
                  />
                  <MetricCard
                    label="Customers"
                    note="Total customer profiles"
                    value={formatNumber(overview.counts?.customers)}
                  />
                  <MetricCard
                    label="Active rides"
                    note={`${formatNumber(overview.counts?.scheduledRides)} scheduled in queue`}
                    value={formatNumber(overview.counts?.activeRides)}
                  />
                  <MetricCard
                    label="Online drivers"
                    note={`${formatNumber(overview.counts?.openOffers)} open offers`}
                    value={formatNumber(overview.counts?.onlineDrivers)}
                  />
                  <MetricCard
                    label="Wallet available"
                    note={`Pending ${formatCurrency(overview.finance?.walletPendingTotal)}`}
                    value={formatCurrency(overview.finance?.walletAvailableTotal)}
                  />
                  <MetricCard
                    label="Support backlog"
                    note="Pending reports"
                    value={formatNumber(overview.counts?.unresolvedReports)}
                  />
                </div>

                <div className="subgrid">
                  <Subcard eyebrow="Watchlist" title="Operational alerts">
                    <div className="alert-list">
                      {(overview.alerts || []).map((alert: AnyRecord) => (
                        <div className="alert-row" key={alert.label}>
                          <div className="stack">
                            <strong>{alert.label}</strong>
                            <span className="muted">Current count</span>
                          </div>
                          <Pill label={String(alert.value)} tone={alert.level} />
                        </div>
                      ))}
                    </div>
                  </Subcard>
                  <Subcard eyebrow="Runtime settings" title="Dispatch + pricing snapshot">
                    <div className="alert-list">
                      <div className="alert-row">
                        <strong>Max pickup distance</strong>
                        <span>
                          {formatNumber(
                            overview.dispatchSettings?.maxPickupDistanceM ??
                              overview.dispatchSettings?.max_pickup_distance_m ??
                              0,
                          )}{" "}
                          m
                        </span>
                      </div>
                      <div className="alert-row">
                        <strong>Routing enabled</strong>
                        <Pill
                          label={String(
                            overview.dispatchSettings?.routingEnabled ??
                              overview.dispatchSettings?.routing_enabled ??
                              false,
                          )}
                          tone={
                            overview.dispatchSettings?.routingEnabled ??
                            overview.dispatchSettings?.routing_enabled
                              ? "success"
                              : "warning"
                          }
                        />
                      </div>
                      <div className="alert-row">
                        <strong>Live ETA refresh</strong>
                        <span>
                          {String(
                            overview.dispatchSettings?.liveEtaRefreshSeconds ??
                              overview.dispatchSettings?.live_eta_refresh_seconds ??
                              "—",
                          )}{" "}
                          sec
                        </span>
                      </div>
                      <div className="alert-row">
                        <strong>Driver monthly fee</strong>
                        <span>
                          {overview.finance?.driverMonthlyFee?.amount
                            ? `${formatCurrency(overview.finance.driverMonthlyFee.amount)} / month`
                            : "Not set"}
                        </span>
                      </div>
                    </div>
                  </Subcard>
                </div>

                <Subcard eyebrow="Latest activity" title="Recent rides">
                  <DataTable
                    columns={[
                      {
                        label: "Trip",
                        render: (ride) => (
                          <Stack
                            subtitle={ride.destination_address || "Unknown dropoff"}
                            tertiary={ride.id}
                            title={ride.pickup_address || "Unknown pickup"}
                          />
                        ),
                      },
                      {
                        label: "People",
                        render: (ride) => (
                          <Stack
                            subtitle={`Driver: ${ride.driver?.full_name || "Unassigned"}`}
                            title={ride.customer?.full_name || "No customer"}
                          />
                        ),
                      },
                      {
                        label: "Status",
                        render: (ride) => (
                          <div className="tag-set">
                            <Pill
                              label={ride.status || "unknown"}
                              tone={renderTone(ride.status || "neutral")}
                            />
                            <Pill
                              label={ride.payment_status || "pending"}
                              tone={renderTone(ride.payment_status || "pending")}
                            />
                          </div>
                        ),
                      },
                      {
                        label: "Value",
                        render: (ride) => (
                          <Stack
                            subtitle={formatDateTime(ride.created_at)}
                            title={formatCurrency(ride.price)}
                          />
                        ),
                      },
                    ]}
                    emptyMessage="No recent rides have been recorded yet."
                    rows={overview.recentRides || []}
                  />
                </Subcard>
              </>
            )}
          </Section>

          <Section
            eyebrow="Section 2"
            id="live-ops"
            onRefresh={() => void loadSingleSection("live-ops")}
            title="Live Ops"
          >
            {loadingSections["live-ops"] ? (
              <LoadingCard message="Refreshing live operations..." />
            ) : sectionErrors["live-ops"] ? (
              <ErrorState message={sectionErrors["live-ops"]} title="Live ops unavailable" />
            ) : !liveOps ? (
              <EmptyState message="Live operations have not loaded yet." title="No data" />
            ) : (
              <div className="subgrid">
                <Subcard eyebrow="Live trips" title="Active rides">
                  <DataTable
                    columns={[
                      {
                        label: "Route",
                        render: (ride) => (
                          <Stack
                            subtitle={ride.destination_address}
                            title={ride.pickup_address || "Unknown pickup"}
                          />
                        ),
                      },
                      {
                        label: "Actors",
                        render: (ride) => (
                          <Stack
                            subtitle={`Driver: ${ride.driver?.full_name || "Unassigned"}`}
                            title={ride.customer?.full_name || "No customer"}
                          />
                        ),
                      },
                      {
                        label: "Status",
                        render: (ride) => (
                          <div className="tag-set">
                            <Pill label={ride.status || "unknown"} tone={renderTone(ride.status || "")} />
                            <Pill
                              label={ride.payment_follow_up_status || "none"}
                              tone={renderTone(ride.payment_follow_up_status || "none")}
                            />
                          </div>
                        ),
                      },
                      {
                        label: "Actions",
                        render: (ride) => (
                          <div className="inline-actions">
                            <button
                              className="ghost-button"
                              onClick={() =>
                                void handleRideFollowUp(
                                  String(ride.id),
                                  String(ride.payment_follow_up_status || "none"),
                                  String(ride.payment_follow_up_note || ""),
                                )
                              }
                              type="button"
                            >
                              Follow-up
                            </button>
                            <button
                              className="danger-button"
                              onClick={() => void handleRideCancel(String(ride.id))}
                              type="button"
                            >
                              Cancel
                            </button>
                          </div>
                        ),
                      },
                    ]}
                    emptyMessage="There are no active rides right now."
                    rows={liveOps.activeRides || []}
                  />
                </Subcard>

                <Subcard eyebrow="Availability" title="Online drivers">
                  <DataTable
                    columns={[
                      {
                        label: "Driver",
                        render: (driver) => (
                          <Stack
                            subtitle={driver.phone || "No phone"}
                            title={driver.full_name || "Unnamed driver"}
                          />
                        ),
                      },
                      {
                        label: "State",
                        render: (driver) => (
                          <div className="tag-set">
                            <Pill
                              label={driver.activation_state || "unknown"}
                              tone={renderTone(driver.activation_state || "")}
                            />
                            <Pill
                              label={driver.is_busy ? "Busy" : "Available"}
                              tone={driver.is_busy ? "warning" : "success"}
                            />
                          </div>
                        ),
                      },
                      {
                        label: "Vehicle + location",
                        render: (driver) => (
                          <Stack
                            subtitle={
                              driver.location
                                ? `${Number(driver.location.driver_lat || 0).toFixed(4)}, ${Number(
                                    driver.location.driver_lon || 0,
                                  ).toFixed(4)}`
                                : "No location ping"
                            }
                            title={
                              driver.vehicle
                                ? `${driver.vehicle.make} ${driver.vehicle.model} (${driver.vehicle.plate_number})`
                                : "No vehicle linked"
                            }
                          />
                        ),
                      },
                      {
                        label: "Wallet",
                        render: (driver) => (
                          <Stack
                            subtitle={`Pending ${formatCurrency(driver.wallet?.pending_balance || 0)}`}
                            title={formatCurrency(driver.wallet?.available_balance || 0)}
                          />
                        ),
                      },
                    ]}
                    emptyMessage="No drivers are online right now."
                    rows={liveOps.onlineDrivers || []}
                  />
                </Subcard>

                <Subcard eyebrow="Dispatch queue" title="Open offers">
                  <DataTable
                    columns={[
                      {
                        label: "Offer",
                        render: (offer) => <span className="mono">{offer.id}</span>,
                      },
                      {
                        label: "Ride",
                        render: (offer) => <span className="mono">{offer.ride_id}</span>,
                      },
                      {
                        label: "Driver",
                        render: (offer) => <span className="mono">{offer.driver_id}</span>,
                      },
                      {
                        label: "Round",
                        render: (offer) => <span>{String(offer.round || 1)}</span>,
                      },
                      {
                        label: "Expires",
                        render: (offer) => <span>{formatDateTime(offer.expires_at)}</span>,
                      },
                    ]}
                    emptyMessage="There are no open ride offers right now."
                    rows={liveOps.openOffers || []}
                  />
                </Subcard>

                <Subcard eyebrow="Upcoming dispatch" title="Scheduled queue">
                  <DataTable
                    columns={[
                      {
                        label: "Booking",
                        render: (ride) => (
                          <Stack
                            subtitle={formatDateTime(ride.scheduled_for)}
                            tertiary={ride.id}
                            title={ride.customer?.full_name || "Unknown customer"}
                          />
                        ),
                      },
                      {
                        label: "Route",
                        render: (ride) => (
                          <Stack subtitle={ride.destination_address} title={ride.pickup_address} />
                        ),
                      },
                      {
                        label: "Dispatch",
                        render: (ride) => (
                          <Stack
                            subtitle={`Attempts: ${String(ride.dispatch_attempts || 0)}`}
                            title={ride.status || "scheduled"}
                          />
                        ),
                      },
                    ]}
                    emptyMessage="No scheduled rides are pending."
                    rows={liveOps.scheduledRides || []}
                  />
                </Subcard>
              </div>
            )}
          </Section>

          <Section
            eyebrow="Section 3"
            id="rides"
            onRefresh={() => void loadSingleSection("rides")}
            title="Rides"
          >
            {sectionErrors["rides"] ? (
              <ErrorState message={sectionErrors["rides"]} title="Rides unavailable" />
            ) : (
              <>
                <form
                  className="subcard"
                  onSubmit={(event) => {
                    event.preventDefault();
                    startTransition(() => void loadSingleSection("rides"));
                  }}
                >
                  <div className="subcard-header">
                    <div>
                      <span>Filters</span>
                      <h4>Ride query</h4>
                    </div>
                    <button className="primary-button" type="submit">
                      Apply filters
                    </button>
                  </div>
                  <div className="toolbar">
                    <label>
                      Search
                      <input
                        onChange={(event) =>
                          setFilters((current) => ({
                            ...current,
                            ridesSearch: event.target.value,
                          }))
                        }
                        placeholder="Customer, driver, route, ride ID"
                        value={filters.ridesSearch}
                      />
                    </label>
                    <label>
                      Ride status
                      <select
                        onChange={(event) =>
                          setFilters((current) => ({
                            ...current,
                            ridesStatus: event.target.value,
                          }))
                        }
                        value={filters.ridesStatus}
                      >
                        {[
                          "all",
                          "pending",
                          "accepted",
                          "arrived",
                          "on_trip",
                          "completed",
                          "cancelled",
                        ].map((option) => (
                          <option key={option} value={option}>
                            {option}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label>
                      Payment status
                      <select
                        onChange={(event) =>
                          setFilters((current) => ({
                            ...current,
                            ridesPaymentStatus: event.target.value,
                          }))
                        }
                        value={filters.ridesPaymentStatus}
                      >
                        {["all", "pending", "paid", "failed", "reversed"].map((option) => (
                          <option key={option} value={option}>
                            {option}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>
                </form>

                {loadingSections["rides"] ? (
                  <LoadingCard message="Refreshing rides..." />
                ) : (
                  <Subcard eyebrow="Operations" title="Ride control board">
                    <DataTable
                      columns={[
                        {
                          label: "Trip",
                          render: (ride) => (
                            <Stack
                              subtitle={ride.destination_address || "Unknown destination"}
                              tertiary={ride.id}
                              title={ride.pickup_address || "Unknown pickup"}
                            />
                          ),
                        },
                        {
                          label: "Actors",
                          render: (ride) => (
                            <Stack
                              subtitle={`Driver: ${ride.driver?.full_name || "Unassigned"}`}
                              title={ride.customer?.full_name || "No customer"}
                            />
                          ),
                        },
                        {
                          label: "Commercials",
                          render: (ride) => (
                            <Stack
                              subtitle={`${ride.paymentMode || "Transfer"} / ${ride.service?.label || ride.requested_vehicle_type || "—"}`}
                              title={formatCurrency(ride.price)}
                            />
                          ),
                        },
                        {
                          label: "Status",
                          render: (ride) => (
                            <div className="tag-set">
                              <Pill label={ride.status || "unknown"} tone={renderTone(ride.status || "")} />
                              <Pill
                                label={ride.payment_status || "pending"}
                                tone={renderTone(ride.payment_status || "")}
                              />
                              <Pill
                                label={ride.payment_follow_up_status || "none"}
                                tone={renderTone(ride.payment_follow_up_status || "")}
                              />
                            </div>
                          ),
                        },
                        {
                          label: "Actions",
                          render: (ride) => (
                            <div className="inline-actions">
                              <button
                                className="ghost-button"
                                onClick={() =>
                                  void handleRideFollowUp(
                                    String(ride.id),
                                    String(ride.payment_follow_up_status || "none"),
                                    String(ride.payment_follow_up_note || ""),
                                  )
                                }
                                type="button"
                              >
                                Follow-up
                              </button>
                              <button
                                className="danger-button"
                                onClick={() => void handleRideCancel(String(ride.id))}
                                type="button"
                              >
                                Cancel
                              </button>
                            </div>
                          ),
                        },
                      ]}
                      emptyMessage="No rides match the current filters."
                      rows={rides}
                    />
                  </Subcard>
                )}
              </>
            )}
          </Section>

          <Section
            eyebrow="Section 4"
            id="drivers"
            onRefresh={() => void loadSingleSection("drivers")}
            title="Drivers"
          >
            {sectionErrors["drivers"] ? (
              <ErrorState message={sectionErrors["drivers"]} title="Drivers unavailable" />
            ) : (
              <>
                <form
                  className="subcard"
                  onSubmit={(event) => {
                    event.preventDefault();
                    startTransition(() => void loadSingleSection("drivers"));
                  }}
                >
                  <div className="subcard-header">
                    <div>
                      <span>Search</span>
                      <h4>Driver roster</h4>
                    </div>
                    <button className="primary-button" type="submit">
                      Search
                    </button>
                  </div>
                  <div className="toolbar">
                    <label>
                      Search driver
                      <input
                        onChange={(event) =>
                          setFilters((current) => ({
                            ...current,
                            driversSearch: event.target.value,
                          }))
                        }
                        placeholder="Name, phone, email, plate number"
                        value={filters.driversSearch}
                      />
                    </label>
                  </div>
                </form>

                {loadingSections["drivers"] ? (
                  <LoadingCard message="Refreshing drivers..." />
                ) : (
                  <Subcard eyebrow="Onboarding + subscription" title="Driver operations">
                    <DataTable
                      columns={[
                        {
                          label: "Driver",
                          render: (driver) => (
                            <Stack
                              subtitle={driver.phone || "No phone"}
                              tertiary={driver.email || "No email"}
                              title={driver.full_name || "Unnamed driver"}
                            />
                          ),
                        },
                        {
                          label: "Activation",
                          render: (driver) => (
                            <div className="stack">
                              <div className="tag-set">
                                <Pill
                                  label={driver.activation_state || "unknown"}
                                  tone={renderTone(driver.activation_state || "")}
                                />
                                <Pill
                                  label={driver.is_verified ? "Verified" : "Not verified"}
                                  tone={driver.is_verified ? "success" : "danger"}
                                />
                                <Pill
                                  label={driver.has_paid ? "Paid" : "Unpaid"}
                                  tone={driver.has_paid ? "success" : "warning"}
                                />
                              </div>
                              <span className="muted">
                                Expires {formatDate(driver.subscription_expires_at)}
                              </span>
                            </div>
                          ),
                        },
                        {
                          label: "Vehicle + wallet",
                          render: (driver) => (
                            <Stack
                              subtitle={`Available ${formatCurrency(driver.wallet?.available_balance || 0)}`}
                              title={
                                driver.vehicle
                                  ? `${driver.vehicle.make} ${driver.vehicle.model} (${driver.vehicle.plate_number})`
                                  : "No vehicle linked"
                              }
                            />
                          ),
                        },
                        {
                          label: "Actions",
                          render: (driver) => (
                            <div className="inline-actions">
                              <button
                                className="ghost-button"
                                onClick={() =>
                                  void handleDriverToggle(
                                    String(driver.id),
                                    "is_verified",
                                    !driver.is_verified,
                                  )
                                }
                                type="button"
                              >
                                {driver.is_verified ? "Revoke verification" : "Approve driver"}
                              </button>
                              <button
                                className="success-button"
                                onClick={() =>
                                  void handleDriverToggle(
                                    String(driver.id),
                                    "has_paid",
                                    !driver.has_paid,
                                  )
                                }
                                type="button"
                              >
                                {driver.has_paid ? "Mark unpaid" : "Mark paid"}
                              </button>
                            </div>
                          ),
                        },
                      ]}
                      emptyMessage="No drivers match the current search."
                      rows={drivers}
                    />
                  </Subcard>
                )}
              </>
            )}
          </Section>

          <Section
            eyebrow="Section 5"
            id="customers"
            onRefresh={() => void loadSingleSection("customers")}
            title="Customers"
          >
            {sectionErrors["customers"] ? (
              <ErrorState message={sectionErrors["customers"]} title="Customers unavailable" />
            ) : (
              <>
                <form
                  className="subcard"
                  onSubmit={(event) => {
                    event.preventDefault();
                    startTransition(() => void loadSingleSection("customers"));
                  }}
                >
                  <div className="subcard-header">
                    <div>
                      <span>Search</span>
                      <h4>Customer directory</h4>
                    </div>
                    <button className="primary-button" type="submit">
                      Search
                    </button>
                  </div>
                  <div className="toolbar">
                    <label>
                      Search customer
                      <input
                        onChange={(event) =>
                          setFilters((current) => ({
                            ...current,
                            customersSearch: event.target.value,
                          }))
                        }
                        placeholder="Name, phone, email"
                        value={filters.customersSearch}
                      />
                    </label>
                  </div>
                </form>

                {loadingSections["customers"] ? (
                  <LoadingCard message="Refreshing customers..." />
                ) : (
                  <Subcard eyebrow="Profiles + activity" title="Customer operations">
                    <DataTable
                      columns={[
                        {
                          label: "Customer",
                          render: (customer) => (
                            <Stack
                              subtitle={customer.phone || "No phone"}
                              tertiary={customer.email || "No email"}
                              title={customer.full_name || "Unnamed customer"}
                            />
                          ),
                        },
                        {
                          label: "Signals",
                          render: (customer) => (
                            <Stack
                              subtitle={`${String(customer.total_trips || 0)} trips, rating ${String(customer.rating || "—")}`}
                              title={customer.is_verified ? "Verified" : "Unverified"}
                            />
                          ),
                        },
                        {
                          label: "Current activity",
                          render: (customer) => (
                            <Stack
                              subtitle={customer.active_ride?.status || customer.latest_ride?.status || "Idle"}
                              title={
                                customer.active_ride?.pickup_address ||
                                customer.latest_ride?.pickup_address ||
                                "No active ride"
                              }
                            />
                          ),
                        },
                        {
                          label: "Actions",
                          render: (customer) => (
                            <div className="inline-actions">
                              <button
                                className="ghost-button"
                                onClick={() =>
                                  void handleCustomerVerify(
                                    String(customer.id),
                                    !customer.is_verified,
                                  )
                                }
                                type="button"
                              >
                                {customer.is_verified ? "Mark unverified" : "Mark verified"}
                              </button>
                            </div>
                          ),
                        },
                      ]}
                      emptyMessage="No customers match the current search."
                      rows={customers}
                    />
                  </Subcard>
                )}
              </>
            )}
          </Section>

          <Section
            eyebrow="Section 6"
            id="scheduled-rides"
            onRefresh={() => void loadSingleSection("scheduled-rides")}
            title="Scheduled Rides"
          >
            {sectionErrors["scheduled-rides"] ? (
              <ErrorState
                message={sectionErrors["scheduled-rides"]}
                title="Scheduled rides unavailable"
              />
            ) : (
              <>
                <form
                  className="subcard"
                  onSubmit={(event) => {
                    event.preventDefault();
                    startTransition(() => void loadSingleSection("scheduled-rides"));
                  }}
                >
                  <div className="subcard-header">
                    <div>
                      <span>Queue search</span>
                      <h4>Scheduled dispatch view</h4>
                    </div>
                    <button className="primary-button" type="submit">
                      Apply filters
                    </button>
                  </div>
                  <div className="toolbar">
                    <label>
                      Search
                      <input
                        onChange={(event) =>
                          setFilters((current) => ({
                            ...current,
                            scheduledSearch: event.target.value,
                          }))
                        }
                        placeholder="Customer, route, schedule ID"
                        value={filters.scheduledSearch}
                      />
                    </label>
                    <label>
                      Status
                      <select
                        onChange={(event) =>
                          setFilters((current) => ({
                            ...current,
                            scheduledStatus: event.target.value,
                          }))
                        }
                        value={filters.scheduledStatus}
                      >
                        {["all", "scheduled", "dispatching", "completed", "cancelled"].map(
                          (option) => (
                            <option key={option} value={option}>
                              {option}
                            </option>
                          ),
                        )}
                      </select>
                    </label>
                  </div>
                </form>

                {loadingSections["scheduled-rides"] ? (
                  <LoadingCard message="Refreshing scheduled rides..." />
                ) : (
                  <Subcard eyebrow="Future demand" title="Scheduled rides">
                    <DataTable
                      columns={[
                        {
                          label: "Booking",
                          render: (ride) => (
                            <Stack
                              subtitle={formatDateTime(ride.scheduled_for)}
                              tertiary={ride.id}
                              title={ride.customer?.full_name || "Unknown customer"}
                            />
                          ),
                        },
                        {
                          label: "Route",
                          render: (ride) => (
                            <Stack subtitle={ride.destination_address} title={ride.pickup_address} />
                          ),
                        },
                        {
                          label: "Dispatch",
                          render: (ride) => (
                            <Stack
                              subtitle={`Attempts ${String(ride.dispatch_attempts || 0)} / Lead ${String(ride.dispatch_lead_minutes || 0)} mins`}
                              title={ride.status || "scheduled"}
                            />
                          ),
                        },
                        {
                          label: "Actions",
                          render: (ride) => (
                            <div className="inline-actions">
                              <button
                                className="danger-button"
                                onClick={() => void handleScheduledCancel(String(ride.id))}
                                type="button"
                              >
                                Cancel
                              </button>
                            </div>
                          ),
                        },
                      ]}
                      emptyMessage="No scheduled rides match the current filters."
                      rows={scheduledRides}
                    />
                  </Subcard>
                )}
              </>
            )}
          </Section>

          <Section
            eyebrow="Section 7"
            id="finance"
            onRefresh={() => void loadSingleSection("finance")}
            title="Finance"
          >
            {loadingSections["finance"] ? (
              <LoadingCard message="Refreshing finance..." />
            ) : sectionErrors["finance"] ? (
              <ErrorState message={sectionErrors["finance"]} title="Finance unavailable" />
            ) : !finance ? (
              <EmptyState message="Finance has not loaded yet." title="No data" />
            ) : (
              <>
                <div className="metric-grid">
                  <MetricCard
                    label="Captured payments"
                    note="Recent paid customer payments"
                    value={formatCurrency(finance.totals?.totalCustomerPaymentsCaptured)}
                  />
                  <MetricCard
                    label="Wallet available"
                    note={`Pending ${formatCurrency(finance.totals?.totalPendingWalletBalance)}`}
                    value={formatCurrency(finance.totals?.totalAvailableWalletBalance)}
                  />
                  <MetricCard
                    label="Drop margin observed"
                    note="From recent financial rows"
                    value={formatCurrency(finance.totals?.totalDropNetMarginObserved)}
                  />
                  <MetricCard
                    label="Partner commissions due"
                    note="Pending + approved"
                    value={formatCurrency(finance.totals?.pendingPartnerCommissionAmount)}
                  />
                  <MetricCard
                    label="Driver payouts processing"
                    note="Queued or processing payouts"
                    value={formatCurrency(finance.totals?.processingDriverPayoutAmount)}
                  />
                </div>

                <div className="subgrid">
                  <Subcard eyebrow="Collections" title="Recent customer payments">
                    <DataTable
                      columns={[
                        {
                          label: "Payment",
                          render: (payment) => (
                            <Stack
                              subtitle={`${payment.provider || "manual"} / ${payment.payment_method || "transfer"}`}
                              title={formatCurrency(payment.amount)}
                            />
                          ),
                        },
                        {
                          label: "Trip",
                          render: (payment) => (
                            <Stack
                              subtitle={payment.ride?.pickup_address || "No ride linked"}
                              title={payment.customer?.full_name || "Unknown customer"}
                            />
                          ),
                        },
                        {
                          label: "Status",
                          render: (payment) => (
                            <Pill label={payment.status || "pending"} tone={renderTone(payment.status || "")} />
                          ),
                        },
                        {
                          label: "Captured",
                          render: (payment) => <span>{formatDateTime(payment.paid_at || payment.created_at)}</span>,
                        },
                      ]}
                      emptyMessage="There are no customer payments to display."
                      rows={finance.customerPayments || []}
                    />
                  </Subcard>

                  <Subcard eyebrow="Exposure" title="Driver wallets">
                    <DataTable
                      columns={[
                        {
                          label: "Driver",
                          render: (wallet) => (
                            <Stack
                              subtitle={wallet.driver?.phone || "No phone"}
                              title={wallet.driver?.full_name || "Unknown driver"}
                            />
                          ),
                        },
                        {
                          label: "Available",
                          render: (wallet) => (
                            <Stack
                              subtitle={`Pending ${formatCurrency(wallet.pending_balance)}`}
                              title={formatCurrency(wallet.available_balance)}
                            />
                          ),
                        },
                        {
                          label: "Auto withdraw",
                          render: (wallet) => (
                            <Pill
                              label={wallet.auto_withdraw_enabled ? "Enabled" : "Disabled"}
                              tone={wallet.auto_withdraw_enabled ? "success" : "neutral"}
                            />
                          ),
                        },
                      ]}
                      emptyMessage="There are no driver wallets yet."
                      rows={(finance.driverWallets || []).slice(0, 12)}
                    />
                  </Subcard>

                  <Subcard eyebrow="Settlement" title="Partner commissions">
                    <DataTable
                      columns={[
                        {
                          label: "Partner",
                          render: (commission) => (
                            <Stack
                              subtitle={commission.ride?.pickup_address || "No ride linked"}
                              title={commission.partner?.name || "Unknown partner"}
                            />
                          ),
                        },
                        {
                          label: "Commission",
                          render: (commission) => (
                            <Stack
                              subtitle={commission.commission_type || "flat"}
                              title={formatCurrency(commission.commission_amount)}
                            />
                          ),
                        },
                        {
                          label: "Status",
                          render: (commission) => (
                            <Pill
                              label={commission.status || "pending"}
                              tone={renderTone(commission.status || "")}
                            />
                          ),
                        },
                        {
                          label: "Actions",
                          render: (commission) => (
                            <div className="inline-actions">
                              <button
                                className="ghost-button"
                                onClick={() =>
                                  void handleCommissionStatus(String(commission.id), "approved")
                                }
                                type="button"
                              >
                                Approve
                              </button>
                              <button
                                className="success-button"
                                onClick={() =>
                                  void handleCommissionStatus(String(commission.id), "paid")
                                }
                                type="button"
                              >
                                Mark paid
                              </button>
                            </div>
                          ),
                        },
                      ]}
                      emptyMessage="There are no partner commissions yet."
                      rows={(finance.partnerCommissions || []).slice(0, 12)}
                    />
                  </Subcard>
                </div>
              </>
            )}
          </Section>

          <Section
            eyebrow="Section 8"
            id="partners"
            onRefresh={() => void loadSingleSection("partners")}
            title="Partners"
          >
            {sectionErrors["partners"] ? (
              <ErrorState message={sectionErrors["partners"]} title="Partners unavailable" />
            ) : (
              <>
                <div className="subgrid">
                  <form
                    className="subcard"
                    onSubmit={(event) => {
                      event.preventDefault();
                      startTransition(() => void loadSingleSection("partners"));
                    }}
                  >
                    <div className="subcard-header">
                      <div>
                        <span>Search</span>
                        <h4>Partner list</h4>
                      </div>
                      <button className="primary-button" type="submit">
                        Search
                      </button>
                    </div>
                    <div className="toolbar">
                      <label>
                        Search partner
                        <input
                          onChange={(event) =>
                            setFilters((current) => ({
                              ...current,
                              partnersSearch: event.target.value,
                            }))
                          }
                          placeholder="Name, slug, contact"
                          value={filters.partnersSearch}
                        />
                      </label>
                    </div>
                  </form>

                  <form className="subcard" onSubmit={(event) => void submitPartner(event)}>
                    <div className="subcard-header">
                      <div>
                        <span>Create</span>
                        <h4>Add partner</h4>
                      </div>
                      <button className="primary-button" type="submit">
                        Create partner
                      </button>
                    </div>
                    <div className="form-grid">
                      <label>
                        Name
                        <input name="name" required />
                      </label>
                      <label>
                        Slug
                        <input name="slug" required />
                      </label>
                      <label>
                        Contact email
                        <input name="contact_email" type="email" />
                      </label>
                      <label>
                        Contact phone
                        <input name="contact_phone" />
                      </label>
                      <label>
                        Partner fee
                        <input defaultValue="0" min="0" name="default_partner_fee_amount" type="number" />
                      </label>
                      <label>
                        Commission value
                        <input
                          defaultValue="0"
                          min="0"
                          name="default_commission_value"
                          step="0.01"
                          type="number"
                        />
                      </label>
                      <label>
                        Commission type
                        <select name="default_commission_type">
                          <option value="flat">flat</option>
                          <option value="percentage_of_service_fee">percentage_of_service_fee</option>
                          <option value="percentage_of_partner_fee">percentage_of_partner_fee</option>
                        </select>
                      </label>
                      <label>
                        Payout schedule
                        <select defaultValue="monthly" name="payout_schedule">
                          <option value="manual">manual</option>
                          <option value="weekly">weekly</option>
                          <option value="biweekly">biweekly</option>
                          <option value="monthly">monthly</option>
                        </select>
                      </label>
                    </div>
                  </form>
                </div>

                {loadingSections["partners"] ? (
                  <LoadingCard message="Refreshing partners..." />
                ) : (
                  <Subcard eyebrow="Attribution + payouts" title="Partner marketplace">
                    <DataTable
                      columns={[
                        {
                          label: "Partner",
                          render: (partner) => (
                            <Stack
                              subtitle={partner.slug}
                              tertiary={partner.contact_email || partner.contact_phone || "No contact"}
                              title={partner.name}
                            />
                          ),
                        },
                        {
                          label: "Economics",
                          render: (partner) => (
                            <Stack
                              subtitle={`${partner.default_commission_type} / ${String(partner.default_commission_value || 0)}`}
                              title={`Fee ${formatCurrency(partner.default_partner_fee_amount)}`}
                            />
                          ),
                        },
                        {
                          label: "Network",
                          render: (partner) => (
                            <Stack
                              subtitle={`${String(partner.members?.length || 0)} members / ${String(partner.attribution_count || 0)} ride attributions`}
                              title={`${String(partner.total_customer_links || 0)} customer links`}
                            />
                          ),
                        },
                        {
                          label: "Status",
                          render: (partner) => (
                            <Pill
                              label={partner.status}
                              tone={renderTone(partner.status || "")}
                            />
                          ),
                        },
                        {
                          label: "Actions",
                          render: (partner) => (
                            <div className="inline-actions">
                              <button
                                className="ghost-button"
                                onClick={() =>
                                  void handlePartnerStatus(
                                    String(partner.id),
                                    partner.status === "active" ? "paused" : "active",
                                  )
                                }
                                type="button"
                              >
                                {partner.status === "active" ? "Pause" : "Activate"}
                              </button>
                            </div>
                          ),
                        },
                      ]}
                      emptyMessage="No partners match the current search."
                      rows={partners}
                    />
                  </Subcard>
                )}
              </>
            )}
          </Section>

          <Section
            eyebrow="Section 9"
            id="support"
            onRefresh={() => void loadSingleSection("support")}
            title="Support"
          >
            {sectionErrors["support"] ? (
              <ErrorState message={sectionErrors["support"]} title="Support unavailable" />
            ) : (
              <>
                <div className="subgrid">
                  <form
                    className="subcard"
                    onSubmit={(event) => {
                      event.preventDefault();
                      startTransition(() => void loadSingleSection("support"));
                    }}
                  >
                    <div className="subcard-header">
                      <div>
                        <span>Search</span>
                        <h4>Support queue</h4>
                      </div>
                      <button className="primary-button" type="submit">
                        Search
                      </button>
                    </div>
                    <div className="toolbar">
                      <label>
                        Search reports
                        <input
                          onChange={(event) =>
                            setFilters((current) => ({
                              ...current,
                              supportSearch: event.target.value,
                            }))
                          }
                          placeholder="Category, description, reporter"
                          value={filters.supportSearch}
                        />
                      </label>
                    </div>
                  </form>

                  <form className="subcard" onSubmit={(event) => void submitNotification(event)}>
                    <div className="subcard-header">
                      <div>
                        <span>Broadcast</span>
                        <h4>Send push notification</h4>
                      </div>
                      <button className="primary-button" type="submit">
                        Send
                      </button>
                    </div>
                    <div className="form-grid">
                      <label>
                        Recipient IDs
                        <textarea name="recipientIds" placeholder="Paste comma-separated profile UUIDs" />
                      </label>
                      <label>
                        Title
                        <input name="title" required />
                      </label>
                      <label>
                        Body
                        <textarea name="body" required />
                      </label>
                      <label>
                        Channel ID
                        <input defaultValue="trip-alerts" name="channelId" />
                      </label>
                    </div>
                  </form>
                </div>

                {loadingSections["support"] ? (
                  <LoadingCard message="Refreshing support..." />
                ) : !support ? (
                  <EmptyState message="Support data has not loaded yet." title="No data" />
                ) : (
                  <div className="subgrid">
                    <Subcard eyebrow="Customer + driver issues" title="Reports">
                      <DataTable
                        columns={[
                          {
                            label: "Report",
                            render: (report) => (
                              <Stack
                                subtitle={report.description || "No description"}
                                tertiary={String(report.id)}
                                title={report.issue_category || "General"}
                              />
                            ),
                          },
                          {
                            label: "Actors",
                            render: (report) => (
                              <Stack
                                subtitle={`Target: ${report.target?.full_name || "Unspecified"}`}
                                title={report.reporter?.full_name || "Unknown reporter"}
                              />
                            ),
                          },
                          {
                            label: "Status",
                            render: (report) => (
                              <Pill
                                label={report.status || "pending"}
                                tone={renderTone(report.status || "")}
                              />
                            ),
                          },
                          {
                            label: "Actions",
                            render: (report) => (
                              <div className="inline-actions">
                                <button
                                  className="ghost-button"
                                  onClick={() =>
                                    void handleReportStatus(String(report.id), "under_review")
                                  }
                                  type="button"
                                >
                                  Under review
                                </button>
                                <button
                                  className="success-button"
                                  onClick={() =>
                                    void handleReportStatus(String(report.id), "resolved")
                                  }
                                  type="button"
                                >
                                  Resolve
                                </button>
                              </div>
                            ),
                          },
                        ]}
                        emptyMessage="There are no support reports right now."
                        rows={support.reports || []}
                      />
                    </Subcard>

                    <Subcard eyebrow="Ride chat feed" title="Latest messages">
                      <DataTable
                        columns={[
                          {
                            label: "Ride",
                            render: (message) => (
                              <Stack
                                subtitle={message.ride?.destination_address || "No destination"}
                                title={message.ride?.pickup_address || "Unknown ride"}
                              />
                            ),
                          },
                          {
                            label: "Message",
                            render: (message) => (
                              <Stack
                                subtitle={message.content || "[image message]"}
                                title={message.sender?.full_name || "Unknown sender"}
                              />
                            ),
                          },
                          {
                            label: "When",
                            render: (message) => <span>{formatDateTime(message.created_at)}</span>,
                          },
                        ]}
                        emptyMessage="There are no ride messages to show."
                        rows={(support.messages || []).slice(0, 16)}
                      />
                    </Subcard>
                  </div>
                )}
              </>
            )}
          </Section>

          <Section
            eyebrow="Section 10"
            id="settings"
            onRefresh={() => void loadSingleSection("settings")}
            title="Settings"
          >
            {loadingSections["settings"] ? (
              <LoadingCard message="Refreshing settings..." />
            ) : sectionErrors["settings"] ? (
              <ErrorState message={sectionErrors["settings"]} title="Settings unavailable" />
            ) : !settings ? (
              <EmptyState message="Settings have not loaded yet." title="No data" />
            ) : (
              <>
                <div className="settings-grid">
                  <form className="subcard" onSubmit={(event) => void submitDispatch(event)}>
                    <div className="subcard-header">
                      <div>
                        <span>Dispatch</span>
                        <h4>Routing controls</h4>
                      </div>
                      <button className="primary-button" type="submit">
                        Save dispatch settings
                      </button>
                    </div>
                    <div className="form-grid">
                      <label>
                        Max pickup distance (m)
                        <input
                          defaultValue={String(
                            settings.dispatchSettings?.maxPickupDistanceM ??
                              settings.dispatchSettings?.max_pickup_distance_m ??
                              15000,
                          )}
                          min="1000"
                          name="maxPickupDistanceM"
                          type="number"
                        />
                      </label>
                      <label>
                        Driver stale seconds
                        <input
                          defaultValue={String(
                            settings.dispatchSettings?.driverLocationStaleSeconds ??
                              settings.dispatchSettings?.driver_location_stale_seconds ??
                              300,
                          )}
                          min="30"
                          name="driverLocationStaleSeconds"
                          type="number"
                        />
                      </label>
                      <label>
                        Routing provider
                        <input
                          defaultValue={
                            settings.dispatchSettings?.routingProvider ??
                            settings.dispatchSettings?.routing_provider ??
                            "google_routes"
                          }
                          name="routingProvider"
                        />
                      </label>
                      <label>
                        Routing candidate limit
                        <input
                          defaultValue={String(
                            settings.dispatchSettings?.routingCandidateLimit ??
                              settings.dispatchSettings?.routing_candidate_limit_per_service ??
                              3,
                          )}
                          min="1"
                          name="routingCandidateLimit"
                          type="number"
                        />
                      </label>
                      <label>
                        Routing timeout (ms)
                        <input
                          defaultValue={String(
                            settings.dispatchSettings?.routingRequestTimeoutMs ??
                              settings.dispatchSettings?.routing_request_timeout_ms ??
                              6000,
                          )}
                          min="1000"
                          name="routingRequestTimeoutMs"
                          type="number"
                        />
                      </label>
                      <label>
                        Routing preference
                        <input
                          defaultValue={
                            settings.dispatchSettings?.routingPreference ??
                            settings.dispatchSettings?.routing_preference ??
                            "TRAFFIC_AWARE_OPTIMAL"
                          }
                          name="routingPreference"
                        />
                      </label>
                      <label>
                        Live ETA refresh (sec)
                        <input
                          defaultValue={String(
                            settings.dispatchSettings?.liveEtaRefreshSeconds ??
                              settings.dispatchSettings?.live_eta_refresh_seconds ??
                              90,
                          )}
                          min="15"
                          name="liveEtaRefreshSeconds"
                          type="number"
                        />
                      </label>
                      <label>
                        Routing enabled
                        <select
                          defaultValue={String(
                            settings.dispatchSettings?.routingEnabled ??
                              settings.dispatchSettings?.routing_enabled ??
                              false,
                          )}
                          name="routingEnabled"
                        >
                          <option value="true">true</option>
                          <option value="false">false</option>
                        </select>
                      </label>
                    </div>
                  </form>

                  <form className="subcard" onSubmit={(event) => void submitFeeConfig(event)}>
                    <div className="subcard-header">
                      <div>
                        <span>Billing</span>
                        <h4>Driver subscription fee</h4>
                      </div>
                      <button className="primary-button" type="submit">
                        Save fee
                      </button>
                    </div>
                    <div className="form-grid">
                      <label>
                        Amount
                        <input
                          defaultValue={String(settings.appConfigs?.find?.((item: AnyRecord) => item.key === "driver_monthly_fee")?.value?.amount || 0)}
                          min="0"
                          name="amount"
                          type="number"
                        />
                      </label>
                      <label>
                        Currency
                        <input
                          defaultValue={
                            settings.appConfigs?.find?.((item: AnyRecord) => item.key === "driver_monthly_fee")?.value?.currency ||
                            "NGN"
                          }
                          name="currency"
                        />
                      </label>
                      <label>
                        Provider fee %
                        <input
                          defaultValue={String(
                            settings.appConfigs?.find?.((item: AnyRecord) => item.key === "driver_monthly_fee")?.value?.payment_provider_fee_percent ||
                              1.5,
                          )}
                          min="0"
                          name="payment_provider_fee_percent"
                          step="0.01"
                          type="number"
                        />
                      </label>
                    </div>
                  </form>

                  <form className="subcard" onSubmit={(event) => void submitHybridConfig(event)}>
                    <div className="subcard-header">
                      <div>
                        <span>Marketplace</span>
                        <h4>Hybrid finance settings</h4>
                      </div>
                      <button className="primary-button" type="submit">
                        Save hybrid finance
                      </button>
                    </div>
                    <div className="form-grid">
                      {(() => {
                        const hybridConfig =
                          settings.appConfigs?.find?.(
                            (item: AnyRecord) => item.key === "hybrid_finance_settings",
                          )?.value || {};
                        return (
                          <>
                            <label>
                              Customer provider fee %
                              <input
                                defaultValue={String(hybridConfig.payment_provider_customer_fee_percent || 0)}
                                min="0"
                                name="payment_provider_customer_fee_percent"
                                step="0.01"
                                type="number"
                              />
                            </label>
                            <label>
                              Driver minimum withdrawal
                              <input
                                defaultValue={String(hybridConfig.driver_minimum_withdrawal_amount || 1000)}
                                min="0"
                                name="driver_minimum_withdrawal_amount"
                                type="number"
                              />
                            </label>
                            <label>
                              Partner hold days
                              <input
                                defaultValue={String(hybridConfig.partner_commission_hold_days || 7)}
                                min="0"
                                name="partner_commission_hold_days"
                                type="number"
                              />
                            </label>
                            <label>
                              Driver auto withdraw default
                              <select
                                defaultValue={String(
                                  hybridConfig.driver_auto_withdraw_enabled_default ?? false,
                                )}
                                name="driver_auto_withdraw_enabled_default"
                              >
                                <option value="true">true</option>
                                <option value="false">false</option>
                              </select>
                            </label>
                            <label>
                              Service fee bands JSON
                              <textarea
                                defaultValue={JSON.stringify(
                                  hybridConfig.service_fee_bands || [],
                                  null,
                                  2,
                                )}
                                name="service_fee_bands"
                              />
                            </label>
                          </>
                        );
                      })()}
                    </div>
                  </form>
                </div>

                <div className="settings-grid">
                  <form className="subcard" onSubmit={(event) => void submitServiceTypeCreate(event)}>
                    <div className="subcard-header">
                      <div>
                        <span>Create</span>
                        <h4>Add service type</h4>
                      </div>
                      <button className="primary-button" type="submit">
                        Create service
                      </button>
                    </div>
                    <div className="form-grid">
                      <label>
                        Name
                        <select defaultValue="car" name="name">
                          {[
                            "car",
                            "bike",
                            "van_truck",
                            "drop_plus",
                            "drop_family",
                            "shuttle",
                            "bus",
                            "mini_van",
                          ].map((option) => (
                            <option key={option} value={option}>
                              {option}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label>
                        Label
                        <input name="label" required />
                      </label>
                      <label>
                        Description
                        <input name="description" />
                      </label>
                      <label>
                        Sort order
                        <input defaultValue="0" name="sort_order" type="number" />
                      </label>
                      <label>
                        Capacity
                        <input defaultValue="4" name="capacity" type="number" />
                      </label>
                    </div>
                  </form>

                  <form className="subcard" onSubmit={(event) => void submitCancelReasonCreate(event)}>
                    <div className="subcard-header">
                      <div>
                        <span>Create</span>
                        <h4>Add cancel reason</h4>
                      </div>
                      <button className="primary-button" type="submit">
                        Create reason
                      </button>
                    </div>
                    <div className="form-grid">
                      <label>
                        Role
                        <select defaultValue="customer" name="role">
                          <option value="customer">customer</option>
                          <option value="driver">driver</option>
                        </select>
                      </label>
                      <label>
                        Label
                        <input name="label" required />
                      </label>
                      <label>
                        Value
                        <input name="value" required />
                      </label>
                      <label>
                        Order
                        <input defaultValue="0" name="display_order" type="number" />
                      </label>
                    </div>
                  </form>
                </div>

                <Subcard eyebrow="Operational catalog" title="Service types">
                  <div className="settings-grid">
                    {(settings.serviceTypes || []).map((service: AnyRecord) => (
                      <form
                        className="subcard"
                        key={service.id}
                        onSubmit={(event) => void submitServiceTypeUpdate(event, String(service.id))}
                      >
                        <div className="subcard-header">
                          <div>
                            <span>Service type</span>
                            <h4>{service.label || service.name}</h4>
                          </div>
                          <button className="ghost-button" type="submit">
                            Save
                          </button>
                        </div>
                        <div className="form-grid">
                          <label>
                            Label
                            <input defaultValue={service.label || ""} name="label" />
                          </label>
                          <label>
                            Description
                            <input defaultValue={service.description || ""} name="description" />
                          </label>
                          <label>
                            Sort order
                            <input defaultValue={String(service.sort_order || 0)} name="sort_order" type="number" />
                          </label>
                          <label>
                            Capacity
                            <input defaultValue={String(service.capacity || 4)} name="capacity" type="number" />
                          </label>
                          <label>
                            Active
                            <select defaultValue={String(service.is_active)} name="is_active">
                              <option value="true">true</option>
                              <option value="false">false</option>
                            </select>
                          </label>
                        </div>
                      </form>
                    ))}
                  </div>
                </Subcard>

                <Subcard eyebrow="App choice lists" title="Cancel reasons">
                  <div className="settings-grid">
                    {(settings.cancelReasons || []).map((reason: AnyRecord) => (
                      <form
                        className="subcard"
                        key={reason.id}
                        onSubmit={(event) =>
                          void submitCancelReasonUpdate(event, String(reason.id))
                        }
                      >
                        <div className="subcard-header">
                          <div>
                            <span>{reason.role} reason</span>
                            <h4>{reason.label}</h4>
                          </div>
                          <button className="ghost-button" type="submit">
                            Save
                          </button>
                        </div>
                        <div className="form-grid">
                          <label>
                            Label
                            <input defaultValue={reason.label} name="label" />
                          </label>
                          <label>
                            Value
                            <input defaultValue={reason.value} name="value" />
                          </label>
                          <label>
                            Order
                            <input
                              defaultValue={String(reason.display_order || 0)}
                              name="display_order"
                              type="number"
                            />
                          </label>
                          <label>
                            Active
                            <select defaultValue={String(reason.is_active)} name="is_active">
                              <option value="true">true</option>
                              <option value="false">false</option>
                            </select>
                          </label>
                        </div>
                      </form>
                    ))}
                  </div>
                </Subcard>
              </>
            )}
          </Section>
        </main>
      </div>

      {toast ? (
        <div className="toast-stack">
          <div className={`toast ${toast.tone}`}>
            <strong>{toast.title}</strong>
            <span>{toast.message}</span>
          </div>
        </div>
      ) : null}
    </>
  );
}
