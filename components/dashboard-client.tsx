"use client";

import {
  FormEvent,
  MouseEvent,
  ReactNode,
  isValidElement,
  useEffect,
  useEffectEvent,
  useRef,
  useState,
} from "react";
import { getSupabaseBrowserClient } from "@/lib/supabase-browser";
import type {
  AnyRecord,
  DashboardActionName,
  DashboardSectionName,
  DashboardSession,
} from "@/lib/types";

type DashboardClientProps = {
  csrfToken: string;
};

type SectionKey = DashboardSectionName;
type DashboardRole = DashboardSession["role"];

type TableColumn<Row extends AnyRecord> = {
  label: string;
  render: (row: Row) => ReactNode;
};

type PromptField = {
  defaultValue?: string;
  label: string;
  name: string;
  options?: Array<{
    label: string;
    value: string;
  }>;
  placeholder?: string;
  required?: boolean;
  type?: "password" | "select" | "text" | "textarea";
};

type SectionDescriptor = {
  description: string;
  eyebrow: string;
  label: string;
  title: string;
};

type SectionSignalRow = {
  event_version?: number;
  id?: number;
  last_source_table?: string;
  scope?: string | null;
  scope_key?: string | null;
  section?: string | null;
  updated_at?: string | null;
};

const DASHBOARD_SECTION_STORAGE_KEY = "drop.dashboard.active-section";

const leadershipSectionOrder: SectionKey[] = [
  "overview",
  "live-ops",
  "support",
  "access",
  "rides",
  "drivers",
  "customers",
  "scheduled-rides",
  "finance",
  "partners",
  "settings",
];

const staffSectionOrder: SectionKey[] = [
  "overview",
  "live-ops",
  "support",
  "rides",
  "drivers",
  "customers",
  "scheduled-rides",
];

const partnerSectionOrder: SectionKey[] = ["workspace"];
const staffRolePresetOptions = [
  { label: "Customer Rep", value: "customer_rep" },
  { label: "Dispatch", value: "dispatch" },
  { label: "Risk & Trust", value: "risk_trust" },
  { label: "Custom", value: "custom" },
] as const;
const filterableSections = new Set<SectionKey>([
  "rides",
  "drivers",
  "customers",
  "scheduled-rides",
  "partners",
  "support",
]);

const sectionDescriptors: Record<SectionKey, SectionDescriptor> = {
  access: {
    description:
      "Create operators, rotate passwords, grant partner portal access, and keep account security healthy.",
    eyebrow: "Admin access",
    label: "Admins",
    title: "Admins, passwords, and permissions",
  },
  customers: {
    description:
      "Review customer trust signals, current activity, and verification state in one place.",
    eyebrow: "Customer network",
    label: "Customers",
    title: "Customer directory",
  },
  drivers: {
    description:
      "Handle driver onboarding, subscriptions, availability, and payout readiness without leaving the control room.",
    eyebrow: "Driver operations",
    label: "Drivers",
    title: "Driver roster",
  },
  finance: {
    description:
      "Monitor collections, wallets, commissions, payouts, and the current marketplace margin picture.",
    eyebrow: "Financial health",
    label: "Finance",
    title: "Revenue and settlement",
  },
  "live-ops": {
    description:
      "Watch live rides, the dispatch queue, and active driver supply from a focused operations view.",
    eyebrow: "Live operations",
    label: "Live Ops",
    title: "Dispatch and active trips",
  },
  overview: {
    description:
      "Start with the pulse of the marketplace, current risk pockets, and the latest operating signals.",
    eyebrow: "Control room",
    label: "Overview",
    title: "Marketplace pulse",
  },
  partners: {
    description:
      "Create partners, review their economics, and keep the referral network active and accountable.",
    eyebrow: "Growth network",
    label: "Partners",
    title: "Partner management",
  },
  rides: {
    description:
      "Search rides, resolve payment follow-up, and intervene when a trip needs manual attention.",
    eyebrow: "Trip control",
    label: "Rides",
    title: "Ride command board",
  },
  "scheduled-rides": {
    description:
      "Keep the future dispatch queue clean, spot gaps early, and cancel problematic scheduled jobs quickly.",
    eyebrow: "Demand planning",
    label: "Scheduled",
    title: "Scheduled queue",
  },
  settings: {
    description:
      "Adjust dispatch, pricing, service catalog, and cancellation rules that shape the whole service.",
    eyebrow: "Operating system",
    label: "Settings",
    title: "Platform controls",
  },
  support: {
    description:
      "Work the live support inbox, review reports, track new messages, and send precise updates to customers and drivers.",
    eyebrow: "Support operations",
    label: "Support",
    title: "Support inbox and response desk",
  },
  workspace: {
    description:
      "Partners land in a scoped portal with their own referrals, rides, commissions, payouts, and account tools.",
    eyebrow: "Partner portal",
    label: "Workspace",
    title: "Partner workspace",
  },
};

const initialSectionData: Record<SectionKey, AnyRecord | AnyRecord[] | null> = {
  access: null,
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
  workspace: null,
};

const formatCurrency = (value: unknown) =>
  new Intl.NumberFormat("en-NG", {
    currency: "NGN",
    maximumFractionDigits: 0,
    style: "currency",
  }).format(Number(value || 0));

const formatNumber = (value: unknown) =>
  new Intl.NumberFormat("en-US").format(Number(value || 0));

const formatMoney = (value: unknown, currency: unknown = "NGN") => {
  const currencyCode = String(currency || "NGN").toUpperCase();
  const amount = Number(value || 0);

  try {
    return new Intl.NumberFormat("en-NG", {
      currency: currencyCode,
      maximumFractionDigits: Number.isInteger(amount) ? 0 : 2,
      style: "currency",
    }).format(amount);
  } catch {
    return `${currencyCode} ${formatNumber(amount)}`;
  }
};

const formatMoneyBreakdown = (value: unknown) => {
  if (!value || typeof value !== "object") {
    return "—";
  }

  const entries = Object.entries(value as Record<string, unknown>).filter(
    ([, amount]) => Number(amount || 0) > 0,
  );

  return entries.length
    ? entries.map(([currency, amount]) => formatMoney(amount, currency)).join(" • ")
    : "—";
};

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

const DEFAULT_DASHBOARD_LOGO = "/drop-logo.png";

const normalizeAssetUrl = (value: unknown, fallback = DEFAULT_DASHBOARD_LOGO) => {
  const normalized = String(value || "").trim();
  return normalized || fallback;
};

const getInitials = (value: unknown, fallback = "DR") => {
  const cleaned = String(value || "")
    .trim()
    .replace(/[^a-z0-9\s]/gi, " ");

  const parts = cleaned
    .split(/\s+/)
    .map((part) => part.trim())
    .filter(Boolean);

  if (!parts.length) {
    return fallback;
  }

  const initials = parts
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() || "")
    .join("");

  return initials || fallback;
};

const createInitialsLogoDataUrl = (value: unknown) => {
  const initials = getInitials(value, "DP");
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="128" height="128" viewBox="0 0 128 128">
      <defs>
        <linearGradient id="g" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="#d16138" />
          <stop offset="100%" stop-color="#8f351d" />
        </linearGradient>
      </defs>
      <rect width="128" height="128" rx="36" fill="url(#g)" />
      <text
        x="64"
        y="70"
        text-anchor="middle"
        font-family="ui-sans-serif, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif"
        font-size="44"
        font-weight="700"
        letter-spacing="2"
        fill="#fff7ef"
      >
        ${initials}
      </text>
    </svg>
  `;

  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
};

const readImageFileAsDataUrl = (file: File) =>
  new Promise<string>((resolve, reject) => {
    if (!file.type.startsWith("image/")) {
      reject(new Error("Choose an image file for the logo."));
      return;
    }

    if (file.size > 1024 * 1024) {
      reject(new Error("Logo files must be 1 MB or smaller."));
      return;
    }

    const reader = new FileReader();

    reader.onerror = () => {
      reject(new Error("The logo file could not be read."));
    };

    reader.onload = () => {
      resolve(String(reader.result || ""));
    };

    reader.readAsDataURL(file);
  });

const maskAccountNumber = (value: unknown) => {
  const digits = String(value || "").replace(/\D/g, "");
  if (!digits) {
    return "No payout account";
  }

  return `Acct ••••${digits.slice(-4)}`;
};

const formatDetailText = (value: unknown): string => {
  if (value === null || value === undefined) {
    return "—";
  }

  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed || "—";
  }

  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }

  if (Array.isArray(value)) {
    const entries = value
      .map((entry) => formatDetailText(entry))
      .filter((entry) => entry !== "—");

    return entries.length ? entries.join(", ") : "—";
  }

  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    const preferredFields = ["name", "full_name", "phone", "relationship", "email", "address"];
    const preferredValues = preferredFields
      .map((field) => record[field])
      .map((entry) => formatDetailText(entry))
      .filter((entry) => entry !== "—");

    if (preferredValues.length) {
      return preferredValues.join(" • ");
    }

    const fallbackEntries = Object.entries(record)
      .map(([key, entry]) => {
        const formattedValue = formatDetailText(entry);
        if (formattedValue === "—") {
          return null;
        }

        return `${key.replace(/_/g, " ")}: ${formattedValue}`;
      })
      .filter(Boolean)
      .slice(0, 4) as string[];

    return fallbackEntries.length ? fallbackEntries.join(" • ") : "—";
  }

  return String(value);
};

const renderTone = (value: string) => {
  if (
    [
      "active",
      "approved",
      "available",
      "enabled",
      "ok",
      "online",
      "paid",
      "resolved",
      "success",
      "successful",
      "verified",
      "true",
    ].includes(value)
  ) {
    return "success";
  }

  if (
    [
      "attention",
      "awaiting_subscription",
      "dispatching",
      "manual",
      "pending",
      "processing",
      "queued",
      "under_review",
      "warning",
    ].includes(value)
  ) {
    return "warning";
  }

  if (
    [
      "cancelled",
      "danger",
      "failed",
      "inactive",
      "paused",
      "pending_verification",
      "refunded",
      "reversed",
    ].includes(value)
  ) {
    return "danger";
  }

  return "neutral";
};

const isLeadershipRole = (role?: DashboardRole | null) =>
  role === "super_admin" || role === "admin";

const getRoleLabel = (role?: DashboardRole | null, roleTitle?: unknown) => {
  const customTitle = String(roleTitle || "").trim();
  if (role === "staff" && customTitle) {
    return customTitle;
  }

  switch (role) {
    case "super_admin":
      return "Super admin";
    case "admin":
      return "Admin";
    case "staff":
      return "Staff";
    case "partner":
      return "Partner";
    default:
      return "Team";
  }
};

const formatDuration = (value: unknown) => {
  const totalSeconds = Number(value || 0);

  if (!Number.isFinite(totalSeconds) || totalSeconds <= 0) {
    return "—";
  }

  const totalMinutes = Math.ceil(totalSeconds / 60);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  if (hours && minutes) {
    return `${hours}h ${minutes}m`;
  }

  if (hours) {
    return `${hours}h`;
  }

  return `${minutes}m`;
};

const isOtpActive = (otp: AnyRecord | null | undefined) => {
  const expiresAt = otp?.expires_at ? new Date(String(otp.expires_at)).getTime() : 0;
  return Boolean(expiresAt && expiresAt > Date.now());
};

const getOtpStatusLabel = (otp: AnyRecord | null | undefined) => {
  if (!otp?.code) {
    return "No OTP";
  }

  return isOtpActive(otp) ? "Active" : "Expired";
};

const getRideTypeLabel = (ride: AnyRecord) => (ride?.is_delivery ? "Delivery" : "Ride");

const getAirportTripLabel = (ride: AnyRecord) => {
  const hasPickupAirport = Boolean(ride?.airport_pickup_zone_code || ride?.airport_pickup_zone_name);
  const hasDropoffAirport = Boolean(ride?.airport_dropoff_zone_code || ride?.airport_dropoff_zone_name);

  if (hasPickupAirport && hasDropoffAirport) {
    return "Airport to airport";
  }

  if (hasPickupAirport) {
    return "Airport pickup";
  }

  if (hasDropoffAirport) {
    return "Airport dropoff";
  }

  return ride?.is_airport_trip ? "Airport trip" : "";
};

const getDeliveryImageUrl = (ride: AnyRecord) => {
  const fromPayload = String(ride?.delivery_item_info?.image || "").trim();
  const direct = String(ride?.item_image_url || "").trim();
  return fromPayload || direct || "";
};

const resolveStaffRoleTitle = (preset: string, customValue: string) => {
  const customTitle = customValue.trim();
  if (preset === "custom") {
    return customTitle;
  }

  return (
    staffRolePresetOptions.find((option) => option.value === preset)?.label ||
    customTitle ||
    "Staff"
  );
};

const getDefaultSection = (role: DashboardRole) =>
  role === "partner" ? "workspace" : "overview";

const getAllowedSections = (role?: DashboardRole | null) =>
  role === "partner"
    ? partnerSectionOrder
    : role === "staff"
      ? staffSectionOrder
      : leadershipSectionOrder;

const getStoredSection = (allowedSections: SectionKey[]) => {
  try {
    const stored = window.localStorage.getItem(DASHBOARD_SECTION_STORAGE_KEY);
    if (!stored) {
      return null;
    }

    return allowedSections.includes(stored as SectionKey) ? (stored as SectionKey) : null;
  } catch {
    return null;
  }
};

const rememberSection = (section: SectionKey) => {
  try {
    window.localStorage.setItem(DASHBOARD_SECTION_STORAGE_KEY, section);
  } catch {
    // Ignore storage failures in private mode.
  }
};

const parseJsonInput = (
  value: FormDataEntryValue | null,
  fallback: unknown,
) => {
  const rawValue = String(value || "").trim();
  if (!rawValue) {
    return fallback;
  }

  return JSON.parse(rawValue);
};

const isEditingField = () => {
  const activeElement = document.activeElement;
  if (!activeElement) {
    return false;
  }

  const tagName = activeElement.tagName;
  return (
    tagName === "INPUT" ||
    tagName === "TEXTAREA" ||
    tagName === "SELECT" ||
    (activeElement as HTMLElement).isContentEditable
  );
};

const matchesVisibleSectionSignal = (
  row: SectionSignalRow,
  activeSection: SectionKey,
  session: DashboardSession,
) => {
  if (row.section !== activeSection) {
    return false;
  }

  if (activeSection === "workspace") {
    return (
      session.role === "partner" &&
      row.scope === "partner" &&
      row.scope_key === session.partnerId
    );
  }

  return row.scope === "global";
};

function Pill({ label, tone }: { label: string; tone?: string }) {
  return <span className={`pill ${tone || "neutral"}`}>{label}</span>;
}

function CodeCard({
  code,
  hint,
  label,
  tone,
}: {
  code?: unknown;
  hint?: string;
  label: string;
  tone?: string;
}) {
  const displayCode = String(code || "").trim() || "—";

  return (
    <div className="code-card">
      <div className="code-card-head">
        <span>{label}</span>
        {hint ? <Pill label={hint} tone={tone} /> : null}
      </div>
      <strong className="code-card-value">{displayCode}</strong>
    </div>
  );
}

function VerificationCodesCard({ ride }: { ride: AnyRecord }) {
  const rideTypeLabel = getRideTypeLabel(ride);

  return (
    <div className="detail-note-card">
      <strong>{rideTypeLabel} verification codes</strong>
      <p>These sync live from the trip record so support can confirm the exact pickup and dropoff codes in use.</p>
      <div className="verification-grid">
        <CodeCard
          code={ride?.pickup_code}
          hint="Pickup"
          label="Pickup code"
          tone="info"
        />
        <CodeCard
          code={ride?.dropoff_code}
          hint="Dropoff"
          label="Dropoff code"
          tone="warning"
        />
      </div>
    </div>
  );
}

function OtpSnapshotCard({
  otp,
  phone,
  title,
}: {
  otp?: AnyRecord | null;
  phone?: unknown;
  title: string;
}) {
  if (!otp?.code) {
    return (
      <div className="detail-note-card">
        <strong>{title}</strong>
        <p>No recent verification OTP is available for this phone right now.</p>
      </div>
    );
  }

  const active = isOtpActive(otp);

  return (
    <div className="detail-note-card">
      <strong>{title}</strong>
      <div className="verification-grid">
        <CodeCard
          code={otp.code}
          hint={getOtpStatusLabel(otp)}
          label="Latest OTP"
          tone={active ? "success" : "danger"}
        />
        <div className="detail-field">
          <span>Delivery</span>
          <strong>{String(phone || otp.phone || "—")}</strong>
          <p className="detail-note">
            Sent {formatDateTime(otp.created_at)} • Expires {formatDateTime(otp.expires_at)}
          </p>
        </div>
      </div>
    </div>
  );
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

function BrandingPreview({
  alt,
  src,
  title,
}: {
  alt: string;
  src: string;
  title: string;
}) {
  return (
    <div className="branding-preview-card">
      <div className="branding-preview-frame">
        <img
          alt={alt}
          className="branding-preview-image"
          onError={(event) => {
            event.currentTarget.src = DEFAULT_DASHBOARD_LOGO;
          }}
          src={src}
        />
      </div>
      <div className="branding-preview-copy">
        <strong>{title}</strong>
      </div>
    </div>
  );
}

function PartnerIdentity({ partner }: { partner: AnyRecord }) {
  const logoSrc = String(
    partner?.metadata?.portal_logo_url || partner?.metadata?.portalLogoUrl || "",
  ).trim();
  const initials = getInitials(partner?.name || partner?.slug || "Partner", "DP");

  return (
    <div className="entity-with-mark">
      <div className="entity-mark" aria-hidden="true">
        <span>{initials}</span>
        {logoSrc ? (
          <img
            alt=""
            onError={(event) => {
              event.currentTarget.style.display = "none";
            }}
            src={logoSrc}
          />
        ) : null}
      </div>
      <Stack
        subtitle={partner.slug}
        tertiary={partner.contact_email || partner.contact_phone || "No contact"}
        title={partner.name}
      />
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

function PanelShell({
  actions,
  children,
  descriptor,
  lastRefresh,
}: {
  actions?: ReactNode;
  children: ReactNode;
  descriptor: SectionDescriptor;
  lastRefresh?: string;
}) {
  return (
    <section className="panel-shell">
      <div className="section-head section-head-wide">
        <div className="panel-copy">
          <p className="eyebrow">{descriptor.eyebrow}</p>
          <h3>{descriptor.title}</h3>
          <p className="panel-description">{descriptor.description}</p>
        </div>
        <div className="panel-meta">
          <Pill label={lastRefresh ? `Synced ${lastRefresh}` : "Waiting for first sync"} tone="neutral" />
          {actions}
        </div>
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
  isLoading,
  loadingMessage,
  onRowClick,
  rows,
  selectedRowId,
}: {
  columns: TableColumn<Row>[];
  emptyMessage: string;
  isLoading?: boolean;
  loadingMessage?: string;
  onRowClick?: (row: Row) => void;
  rows: Row[];
  selectedRowId?: string | null;
}) {
  if (!rows.length) {
    return <EmptyState message={emptyMessage} title="Nothing to show" />;
  }

  return (
    <div aria-busy={isLoading ? "true" : "false"} className={`table-shell ${isLoading ? "is-loading" : ""}`}>
      {isLoading ? (
        <div className="table-loading-banner">
          <span className="activity-dot table-loading-dot" />
          {loadingMessage || "Refreshing rows..."}
        </div>
      ) : null}
      <table>
        <thead>
          <tr>
            {columns.map((column) => (
              <th key={column.label}>{column.label}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => {
            const rowKey = String(row.id || row.key || index);
            const isSelected = selectedRowId === rowKey;

            return (
            <tr
              aria-selected={isSelected}
              className={`${onRowClick ? "is-clickable" : ""} ${isSelected ? "is-selected" : ""}`}
              key={rowKey}
              onClick={onRowClick ? () => onRowClick(row) : undefined}
              onKeyDown={
                onRowClick
                  ? (event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        onRowClick(row);
                      }
                    }
                  : undefined
              }
              tabIndex={onRowClick ? 0 : undefined}
            >
              {columns.map((column) => (
                <td key={`${rowKey}-${column.label}`}>{column.render(row)}</td>
              ))}
            </tr>
            );
          })}
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

function IdentityCard({
  avatarUrl,
  subtitle,
  tertiary,
  title,
}: {
  avatarUrl?: string | null;
  subtitle?: string;
  tertiary?: string;
  title: string;
}) {
  const src = String(avatarUrl || "").trim() || createInitialsLogoDataUrl(title);

  return (
    <div className="detail-identity">
      <img
        alt={title}
        className="detail-avatar"
        onError={(event) => {
          event.currentTarget.src = createInitialsLogoDataUrl(title);
        }}
        src={src}
      />
      <Stack subtitle={subtitle} tertiary={tertiary} title={title} />
    </div>
  );
}

function DetailField({
  label,
  value,
}: {
  label: string;
  value: unknown;
}) {
  return (
    <div className="detail-field">
      <span>{label}</span>
      <strong>{isValidElement(value) ? value : formatDetailText(value)}</strong>
    </div>
  );
}

function ImageGallery({
  images,
}: {
  images: Array<{
    label: string;
    url: string;
  }>;
}) {
  if (!images.length) {
    return <p className="detail-note">No images available on this record yet.</p>;
  }

  return (
    <div className="detail-image-grid">
      {images.map((image) => (
        <a
          className="detail-image-card"
          href={image.url}
          key={`${image.label}-${image.url}`}
          rel="noreferrer"
          target="_blank"
        >
          <img alt={image.label} src={image.url} />
          <span>{image.label}</span>
        </a>
      ))}
    </div>
  );
}

function PasswordResetCard({
  heading,
  isDisabled,
  onSubmit,
  submitLabel,
}: {
  heading: string;
  isDisabled?: boolean;
  onSubmit: (event: FormEvent<HTMLFormElement>) => Promise<void>;
  submitLabel: string;
}) {
  return (
    <form className="subcard" onSubmit={(event) => void onSubmit(event)}>
      <div className="subcard-header">
        <div>
          <span>Credentials</span>
          <h4>{heading}</h4>
        </div>
        <button className="primary-button" disabled={isDisabled} type="submit">
          {submitLabel}
        </button>
      </div>
      <div className="form-grid">
        <label>
          Current password
          <input autoComplete="current-password" minLength={12} name="currentPassword" required type="password" />
        </label>
        <label>
          New password
          <input autoComplete="new-password" minLength={12} name="newPassword" required type="password" />
        </label>
        <label>
          Confirm new password
          <input autoComplete="new-password" minLength={12} name="confirmPassword" required type="password" />
        </label>
      </div>
    </form>
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
    throw new Error("Your session has expired.");
  }

  if (!response.ok || payload.error) {
    throw new Error(payload.error || `Could not load ${section}.`);
  }

  return payload.data;
}

export function DashboardClient({ csrfToken }: DashboardClientProps) {
  const [session, setSession] = useState<DashboardSession | null>(null);
  const [isBooting, setIsBooting] = useState(true);
  const [activeSection, setActiveSection] = useState<SectionKey>("overview");
  const [sectionData, setSectionData] = useState(initialSectionData);
  const [sectionErrors, setSectionErrors] = useState<Record<string, string>>({});
  const [loadingSections, setLoadingSections] = useState<Record<string, boolean>>({});
  const [lastRefresh, setLastRefresh] = useState<Record<string, string>>({});
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
    ridesTripType: "all",
    scheduledSearch: "",
    scheduledStatus: "all",
    supportSearch: "",
  });
  const [pendingActions, setPendingActions] = useState<Record<string, boolean>>({});
  const [confirmState, setConfirmState] = useState<{
    confirmLabel?: string;
    message: string;
    tone?: "danger" | "primary" | "success";
    title: string;
  } | null>(null);
  const [promptState, setPromptState] = useState<{
    confirmLabel?: string;
    fields: PromptField[];
    message: string;
    tone?: "danger" | "primary" | "success";
    title: string;
  } | null>(null);
  const [promptValues, setPromptValues] = useState<Record<string, string>>({});
  const [supportComposer, setSupportComposer] = useState<"broadcast" | "reply" | null>(null);
  const [supportReplyBody, setSupportReplyBody] = useState("");
  const [supportReplyAudience, setSupportReplyAudience] = useState<"both" | "customer" | "driver">(
    "both",
  );
  const [supportBroadcastDraft, setSupportBroadcastDraft] = useState<{
    audience: "both" | "custom" | "customers" | "drivers";
    body: string;
    channelId: string;
    recipientIds: string;
    title: string;
  }>({
    audience: "both",
    body: "",
    channelId: "trip-alerts",
    recipientIds: "",
    title: "",
  });
  const [selectedSupportRideId, setSelectedSupportRideId] = useState<string | null>(null);
  const [selectedRideId, setSelectedRideId] = useState<string | null>(null);
  const [selectedDriverId, setSelectedDriverId] = useState<string | null>(null);
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(null);
  const [leadershipRole, setLeadershipRole] = useState<"admin" | "super_admin">("admin");
  const [staffRolePreset, setStaffRolePreset] = useState<string>(staffRolePresetOptions[0].value);
  const [supportTypingLabel, setSupportTypingLabel] = useState("");
  const [supportUnreadByRide, setSupportUnreadByRide] = useState<Record<string, number>>({});
  const [supportUnreadTotal, setSupportUnreadTotal] = useState(0);
  const hasHydratedRef = useRef(false);
  const inflightSectionsRef = useRef<Partial<Record<SectionKey, Promise<void>>>>({});
  const loadedSectionsRef = useRef<Partial<Record<SectionKey, boolean>>>({});
  const loadingSectionsRef = useRef<Record<string, boolean>>({});
  const appliedFilterSignaturesRef = useRef<Partial<Record<SectionKey, string>>>({});
  const confirmResolverRef = useRef<((value: boolean) => void) | null>(null);
  const promptResolverRef = useRef<((value: Record<string, string> | null) => void) | null>(null);
  const filterDebounceRef = useRef<number | null>(null);
  const panelStageRef = useRef<HTMLDivElement | null>(null);
  const supportSeenMessageRef = useRef<Record<string, number>>({});
  const supportTypingTimeoutRef = useRef<number | null>(null);
  const refreshTimerRef = useRef<number | null>(null);
  const pendingSignalRefreshRef = useRef(false);

  const allowedSections = getAllowedSections(session?.role);
  const isActiveSectionLoading = Boolean(loadingSections[activeSection]);
  const pendingActionCount = Object.keys(pendingActions).length;

  const notify = (
    title: string,
    message: string,
    tone: "error" | "info" | "success" | "warning",
  ) => {
    setToast({ message, title, tone });
    window.setTimeout(() => setToast(null), 3600);
  };

  const isActionPending = (key: string) => Boolean(pendingActions[key]);

  const runWithPending = async <T,>(key: string, task: () => Promise<T>) => {
    setPendingActions((current) => ({ ...current, [key]: true }));

    try {
      return await task();
    } finally {
      setPendingActions((current) => {
        const next = { ...current };
        delete next[key];
        return next;
      });
    }
  };

  const requestConfirmation = (options: {
    confirmLabel?: string;
    message: string;
    tone?: "danger" | "primary" | "success";
    title: string;
  }) =>
    new Promise<boolean>((resolve) => {
      confirmResolverRef.current = resolve;
      setConfirmState(options);
    });

  const resolveConfirmation = (value: boolean) => {
    confirmResolverRef.current?.(value);
    confirmResolverRef.current = null;
    setConfirmState(null);
  };

  const requestPrompt = (options: {
    confirmLabel?: string;
    fields: PromptField[];
    message: string;
    tone?: "danger" | "primary" | "success";
    title: string;
  }) =>
    new Promise<Record<string, string> | null>((resolve) => {
      promptResolverRef.current = resolve;
      setPromptValues(
        Object.fromEntries(
          options.fields.map((field) => [field.name, field.defaultValue || ""]),
        ),
      );
      setPromptState(options);
    });

  const resolvePrompt = (value: Record<string, string> | null) => {
    promptResolverRef.current?.(value);
    promptResolverRef.current = null;
    setPromptState(null);
    setPromptValues({});
  };

  const runConfirmedAction = async <T,>(
    key: string,
    options: {
      confirmLabel?: string;
      message: string;
      tone?: "danger" | "primary" | "success";
      title: string;
    },
    task: () => Promise<T>,
  ) => {
    const confirmed = await requestConfirmation(options);
    if (!confirmed) {
      return null;
    }

    return runWithPending(key, task);
  };

  const getSectionParams = (section: SectionKey) => {
    if (section === "rides") {
      return new URLSearchParams({
        paymentStatus: filters.ridesPaymentStatus,
        search: filters.ridesSearch,
        status: filters.ridesStatus,
        tripType: filters.ridesTripType,
      });
    }

    if (section === "drivers") {
      return new URLSearchParams({ search: filters.driversSearch });
    }

    if (section === "customers") {
      return new URLSearchParams({ search: filters.customersSearch });
    }

    if (section === "scheduled-rides") {
      return new URLSearchParams({
        search: filters.scheduledSearch,
        status: filters.scheduledStatus,
      });
    }

    if (section === "partners") {
      return new URLSearchParams({ search: filters.partnersSearch });
    }

    if (section === "support") {
      return new URLSearchParams({ search: filters.supportSearch });
    }

    return undefined;
  };

  const getSectionFilterSignature = (section: SectionKey) =>
    getSectionParams(section)?.toString() || "";

  const scrollToContentArea = () => {
    if (window.innerWidth >= 1100) {
      return;
    }

    window.requestAnimationFrame(() => {
      panelStageRef.current?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    });
  };

  const handleSectionSelect = (section: SectionKey) => {
    setActiveSection(section);
    scrollToContentArea();
  };

  const loadSession = async () => {
    const response = await fetch("/api/auth/session", {
      cache: "no-store",
    });
    const payload = (await response.json()) as {
      data?: DashboardSession;
      error?: string;
    };

    if (response.status === 401) {
      window.location.href = "/login";
      throw new Error("Your session has expired.");
    }

    if (!response.ok || payload.error || !payload.data) {
      throw new Error(payload.error || "Could not restore your session.");
    }

    setSession(payload.data);
    return payload.data;
  };

  const loadSingleSection = async (
    section: SectionKey,
    options: { background?: boolean } = {},
  ) => {
    const existingRequest = inflightSectionsRef.current[section];
    if (existingRequest) {
      await existingRequest;
      return;
    }

    const filterSignature = getSectionFilterSignature(section);
    const params = getSectionParams(section);

    const request = (async () => {
      setLoadingSections((current) => {
        const next = { ...current, [section]: true };
        loadingSectionsRef.current = next;
        return next;
      });

      setSectionErrors((current) => ({ ...current, [section]: "" }));

      try {
        const data = await fetchSection(section, params);

        loadedSectionsRef.current[section] = true;
        appliedFilterSignaturesRef.current[section] = filterSignature;
        setSectionData((current) => ({ ...current, [section]: data }));
        setLastRefresh((current) => ({
          ...current,
          [section]: new Date().toLocaleString("en-NG", {
            dateStyle: "medium",
            timeStyle: "short",
          }),
        }));
      } catch (error) {
        setSectionErrors((current) => ({
          ...current,
          [section]:
            error instanceof Error ? error.message : `Could not load ${section}.`,
        }));
      } finally {
        setLoadingSections((current) => {
          const next = { ...current, [section]: false };
          loadingSectionsRef.current = next;
          return next;
        });
      }
    })();

    inflightSectionsRef.current[section] = request;

    try {
      await request;
    } finally {
      if (inflightSectionsRef.current[section] === request) {
        delete inflightSectionsRef.current[section];
      }
    }
  };

  const refreshSections = async (
    sections: SectionKey[],
    options: { background?: boolean } = {},
  ) => {
    await Promise.all(
      Array.from(new Set(sections)).map((section) => loadSingleSection(section, options)),
    );
  };

  const hydrateDashboard = useEffectEvent(async () => {
    try {
      const nextSession = await loadSession();
      const nextAllowedSections = getAllowedSections(nextSession.role);
      const initialSection =
        getStoredSection(nextAllowedSections) ?? getDefaultSection(nextSession.role);

      setActiveSection(initialSection);
      await loadSingleSection(initialSection);
    } finally {
      setIsBooting(false);
    }
  });

  useEffect(() => {
    if (hasHydratedRef.current) {
      return;
    }

    hasHydratedRef.current = true;
    void hydrateDashboard();
  }, []);

  const queueSignalRefresh = useEffectEvent(() => {
    if (document.hidden) {
      pendingSignalRefreshRef.current = true;
      return;
    }

    if (isEditingField()) {
      pendingSignalRefreshRef.current = true;
      return;
    }

    if (loadingSectionsRef.current[activeSection]) {
      pendingSignalRefreshRef.current = true;
      return;
    }

    pendingSignalRefreshRef.current = false;

    if (refreshTimerRef.current) {
      window.clearTimeout(refreshTimerRef.current);
    }

    refreshTimerRef.current = window.setTimeout(() => {
      void loadSingleSection(activeSection, {
        background: Boolean(loadedSectionsRef.current[activeSection]),
      });
      refreshTimerRef.current = null;
    }, 600);
  });

  useEffect(() => {
    const flushPendingRefresh = () => {
      if (!pendingSignalRefreshRef.current || document.hidden || isEditingField()) {
        return;
      }

      queueSignalRefresh();
    };

    const handleFocusOut = () => {
      window.setTimeout(flushPendingRefresh, 0);
    };

    const handleVisibilityChange = () => {
      if (!document.hidden) {
        flushPendingRefresh();
      }
    };

    document.addEventListener("focusout", handleFocusOut);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      document.removeEventListener("focusout", handleFocusOut);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, []);

  useEffect(() => {
    if (
      !isActiveSectionLoading &&
      pendingSignalRefreshRef.current &&
      !document.hidden &&
      !isEditingField()
    ) {
      queueSignalRefresh();
    }
  }, [activeSection, isActiveSectionLoading]);

  useEffect(() => {
    if (!session || !filterableSections.has(activeSection)) {
      return;
    }

    const nextSignature = getSectionFilterSignature(activeSection);
    const previousSignature = appliedFilterSignaturesRef.current[activeSection] || "";
    const hasLoadedSection = Boolean(loadedSectionsRef.current[activeSection]);

    if (hasLoadedSection && previousSignature === nextSignature) {
      return;
    }

    if (filterDebounceRef.current) {
      window.clearTimeout(filterDebounceRef.current);
    }

    filterDebounceRef.current = window.setTimeout(() => {
      void loadSingleSection(activeSection, {
        background: Boolean(loadedSectionsRef.current[activeSection]),
      });
      filterDebounceRef.current = null;
    }, 320);

    return () => {
      if (filterDebounceRef.current) {
        window.clearTimeout(filterDebounceRef.current);
        filterDebounceRef.current = null;
      }
    };
  }, [
    activeSection,
    filters.customersSearch,
    filters.driversSearch,
    filters.partnersSearch,
    filters.ridesPaymentStatus,
    filters.ridesSearch,
    filters.ridesStatus,
    filters.ridesTripType,
    filters.scheduledSearch,
    filters.scheduledStatus,
    filters.supportSearch,
    session,
  ]);

  useEffect(() => {
    if (!session) {
      return;
    }

    if (!allowedSections.includes(activeSection)) {
      setActiveSection(getDefaultSection(session.role));
      return;
    }

    rememberSection(activeSection);

    const activeFilterSignature = getSectionFilterSignature(activeSection);
    if (
      (!loadedSectionsRef.current[activeSection] ||
        appliedFilterSignaturesRef.current[activeSection] !== activeFilterSignature) &&
      !inflightSectionsRef.current[activeSection] &&
      !loadingSectionsRef.current[activeSection]
    ) {
      void loadSingleSection(activeSection, {
        background: Boolean(loadedSectionsRef.current[activeSection]),
      });
    }
  }, [activeSection, allowedSections, session]);

  useEffect(() => {
    if (!session) {
      return;
    }

    const supabase = getSupabaseBrowserClient();
    if (!supabase) {
      return;
    }

    const channel = supabase
      .channel(
        `dashboard-section:${session.role}:${activeSection}:${session.accountId || session.username}`,
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          filter: `section=eq.${activeSection}`,
          schema: "public",
          table: "dashboard_section_signals",
        },
        (payload) => {
          const nextRow = payload.new as SectionSignalRow;

          if (!matchesVisibleSectionSignal(nextRow, activeSection, session)) {
            return;
          }

          queueSignalRefresh();
        },
      )
      .subscribe();

    return () => {
      pendingSignalRefreshRef.current = false;

      if (refreshTimerRef.current) {
        window.clearTimeout(refreshTimerRef.current);
        refreshTimerRef.current = null;
      }

      void supabase.removeChannel(channel);
    };
  }, [activeSection, session]);

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
      throw new Error("Your session has expired.");
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
    const promptResult = await requestPrompt({
      confirmLabel: "Use this reason",
      fields: [
        {
          defaultValue: "Cancelled by Drop team",
          label: "Cancellation reason",
          name: "reason",
          placeholder: "Explain why the ride is being cancelled",
          required: true,
          type: "textarea",
        },
      ],
      message: "Give the operations log a clear cancellation reason before ending the ride.",
      title: "Cancellation reason",
      tone: "danger",
    });

    if (!promptResult) {
      return;
    }

    const reason = promptResult.reason?.trim() || "Cancelled by Drop team";

    await runConfirmedAction(
      `cancel-ride:${rideId}`,
      {
        confirmLabel: "Cancel ride",
        message:
          "This will stop the ride across operations and record the cancellation in the system log.",
        title: "Cancel this ride?",
        tone: "danger",
      },
      async () => {
        await adminAction("cancel_ride", { reason, rideId });
        await refreshSections(["overview", "live-ops", "rides"]);
        notify("Ride cancelled", "The ride was cancelled successfully.", "success");
      },
    );
  }

  async function handleRideFollowUp(rideId: string, currentStatus: string, currentNote: string) {
    const promptResult = await requestPrompt({
      confirmLabel: "Use follow-up details",
      fields: [
        {
          defaultValue: currentStatus || "none",
          label: "Follow-up status",
          name: "status",
          options: [
            { label: "None", value: "none" },
            { label: "Customer paying soon", value: "customer_paying_soon" },
            { label: "Under review", value: "under_review" },
            { label: "Resolved", value: "resolved" },
          ],
          required: true,
          type: "select",
        },
        {
          defaultValue: currentNote || "",
          label: "Follow-up note",
          name: "note",
          placeholder: "Add context for the operations team",
          type: "textarea",
        },
      ],
      message: "Update the follow-up state and note that operations should see on this ride.",
      title: "Payment follow-up details",
      tone: "primary",
    });

    if (!promptResult) {
      return;
    }

    const status = promptResult.status || currentStatus || "none";
    const note = promptResult.note || "";

    await runConfirmedAction(
      `follow-up:${rideId}`,
      {
        confirmLabel: "Update follow-up",
        message:
          "This updates the payment follow-up status for the ride and refreshes the support and trip queues.",
        title: "Save payment follow-up?",
        tone: "primary",
      },
      async () => {
        await adminAction("update_ride_follow_up", {
          payment_follow_up_note: note,
          payment_follow_up_reported_at: new Date().toISOString(),
          payment_follow_up_status: status,
          rideId,
        });
        await refreshSections(["overview", "live-ops", "rides"]);
        notify("Ride updated", "Payment follow-up was updated.", "success");
      },
    );
  }

  async function handleDriverToggle(
    driverId: string,
    field: "has_paid" | "is_verified",
    nextValue: boolean,
  ) {
    const actionLabel =
      field === "is_verified"
        ? nextValue
          ? "Approve driver"
          : "Revoke driver verification"
        : nextValue
          ? "Mark driver as paid"
          : "Mark driver as unpaid";

    await runConfirmedAction(
      `driver:${field}:${driverId}`,
      {
        confirmLabel: actionLabel,
        message:
          "This changes the driver's operational eligibility and updates the relevant live operations views.",
        title: `${actionLabel}?`,
        tone: nextValue ? "success" : "danger",
      },
      async () => {
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
        await refreshSections(["overview", "live-ops", "drivers"]);
        notify("Driver updated", "Driver access state was updated.", "success");
      },
    );
  }

  async function handleCustomerVerify(customerId: string, nextValue: boolean) {
    await runConfirmedAction(
      `customer-verify:${customerId}`,
      {
        confirmLabel: nextValue ? "Verify customer" : "Mark unverified",
        message:
          "This changes the customer's verification state and updates the customer directory immediately.",
        title: nextValue ? "Verify this customer?" : "Mark this customer unverified?",
        tone: nextValue ? "success" : "danger",
      },
      async () => {
        await adminAction("update_customer", {
          customerId,
          is_verified: nextValue,
        });
        await refreshSections(["customers"]);
        notify("Customer updated", "Customer verification was updated.", "success");
      },
    );
  }

  async function handleScheduledCancel(scheduledRideId: string) {
    await runConfirmedAction(
      `scheduled-cancel:${scheduledRideId}`,
      {
        confirmLabel: "Cancel booking",
        message:
          "This removes the scheduled ride from future dispatch and updates all queue views.",
        title: "Cancel this scheduled ride?",
        tone: "danger",
      },
      async () => {
        await adminAction("cancel_scheduled_ride", { scheduledRideId });
        await refreshSections(["overview", "live-ops", "scheduled-rides"]);
        notify("Scheduled ride cancelled", "The booking was cancelled.", "success");
      },
    );
  }

  async function handlePartnerStatus(partnerId: string, nextStatus: string) {
    await runConfirmedAction(
      `partner-status:${partnerId}`,
      {
        confirmLabel: nextStatus === "active" ? "Activate partner" : "Pause partner",
        message:
          "This changes whether the partner remains operational in the marketplace and partner portal.",
        title: nextStatus === "active" ? "Activate this partner?" : "Pause this partner?",
        tone: nextStatus === "active" ? "success" : "danger",
      },
      async () => {
        await adminAction("update_partner", {
          partnerId,
          status: nextStatus,
        });
        await refreshSections(["partners", "access"], { background: true });
        notify("Partner updated", "Partner status was updated.", "success");
      },
    );
  }

  async function handleCommissionStatus(commissionId: string, nextStatus: string) {
    await runConfirmedAction(
      `commission:${commissionId}:${nextStatus}`,
      {
        confirmLabel: nextStatus === "paid" ? "Mark paid" : "Approve commission",
        message:
          "This changes the settlement state of the partner commission and updates the finance views.",
        title:
          nextStatus === "paid"
            ? "Mark this commission as paid?"
            : "Approve this commission?",
        tone: "success",
      },
      async () => {
        await adminAction("update_partner_commission", {
          approved_at: nextStatus === "approved" ? new Date().toISOString() : undefined,
          commissionId,
          paid_at: nextStatus === "paid" ? new Date().toISOString() : undefined,
          status: nextStatus,
        });
        await refreshSections(["finance", "partners"]);
        notify("Commission updated", "Partner commission status was updated.", "success");
      },
    );
  }

  async function handleReportStatus(reportId: string, status: string) {
    await runConfirmedAction(
      `report:${reportId}:${status}`,
      {
        confirmLabel: status === "resolved" ? "Resolve report" : "Move to review",
        message:
          "This changes the support report state and will update support, overview, and live operations.",
        title:
          status === "resolved"
            ? "Resolve this report?"
            : "Move this report under review?",
        tone: status === "resolved" ? "success" : "primary",
      },
      async () => {
        await adminAction("update_report", {
          reportId,
          status,
        });
        await refreshSections(["overview", "live-ops", "support"]);
        notify("Report updated", "Support report status was updated.", "success");
      },
    );
  }

  async function submitNotification(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const audience = supportBroadcastDraft.audience;
    const recipientIds = supportBroadcastDraft.recipientIds
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean);

    if (audience === "custom" && !recipientIds.length) {
      notify(
        "Recipient IDs required",
        "Paste one or more profile IDs when sending a custom notification.",
        "warning",
      );
      return;
    }

    await runConfirmedAction(
      "send-notification",
      {
        confirmLabel: "Send notification",
        message:
          audience === "custom"
            ? "This will notify the selected recipients immediately."
            : `This will notify the ${audience} audience across the app.`,
        title: "Send this push notification?",
        tone: "primary",
      },
      async () => {
        await adminAction("send_push_notification", {
          audience,
          body: supportBroadcastDraft.body.trim(),
          channelId: supportBroadcastDraft.channelId || "trip-alerts",
          recipientIds,
          title: supportBroadcastDraft.title.trim(),
        });
        setSupportComposer(null);
        setSupportBroadcastDraft({
          audience: "both",
          body: "",
          channelId: "trip-alerts",
          recipientIds: "",
          title: "",
        });
        notify("Notification sent", "Push notification has been queued.", "success");
      },
    );
  }

  async function submitPartner(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const name = String(form.get("name") || "");

    await runConfirmedAction(
      "create-partner",
      {
        confirmLabel: "Create partner",
        message: "This will create a new partner record and make it available for portal access.",
        title: `Create ${name || "this"} partner?`,
        tone: "success",
      },
      async () => {
        const partner = await adminAction("create_partner", {
          contact_email: String(form.get("contact_email") || ""),
          contact_name: String(form.get("contact_name") || ""),
          contact_phone: String(form.get("contact_phone") || ""),
          default_commission_type: String(form.get("default_commission_type") || "flat"),
          default_commission_value: Number(form.get("default_commission_value") || 0),
          default_partner_fee_amount: Number(form.get("default_partner_fee_amount") || 0),
          name,
          payout_schedule: String(form.get("payout_schedule") || "monthly"),
          slug: String(form.get("slug") || ""),
        });
        formElement.reset();
        setSectionData((current) => {
          const nextPartners = [partner, ...(((current.partners as AnyRecord[]) || []) as AnyRecord[])];
          const currentAccess = (current.access as AnyRecord | null) || null;
          const nextAccess = currentAccess
            ? {
                ...currentAccess,
                partnerOptions: [partner, ...((currentAccess.partnerOptions as AnyRecord[]) || [])],
                totals: {
                  ...(currentAccess.totals || {}),
                  totalPartners: Number(currentAccess.totals?.totalPartners || 0) + 1,
                },
              }
            : current.access;

          return {
            ...current,
            access: nextAccess,
            partners: nextPartners,
          };
        });
        await refreshSections(["partners", "access"], { background: true });
        notify("Partner created", "The partner was added successfully.", "success");
      },
    );
  }

  async function submitCreateAdmin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const username = String(form.get("username") || "");
    const nextRole = String(form.get("role") || leadershipRole) as "admin" | "super_admin";
    const roleTitle = getRoleLabel(nextRole);

    await runConfirmedAction(
      "create-admin",
      {
        confirmLabel: "Create admin",
        message:
          "This will create a new leadership account with full operating access to the Drop control room.",
        title: `Create ${username || "this"} ${roleTitle.toLowerCase()} account?`,
        tone: "success",
      },
      async () => {
        await adminAction("create_admin", {
          displayName: String(form.get("displayName") || ""),
          password: String(form.get("password") || ""),
          role: nextRole,
          roleTitle,
          username,
        });

        formElement.reset();
        setLeadershipRole("admin");
        await refreshSections(["access"], { background: true });
        notify(
          "Leadership account created",
          `A new ${roleTitle.toLowerCase()} account can now sign in to operate Drop.`,
          "success",
        );
      },
    );
  }

  async function submitCreateStaff(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const username = String(form.get("username") || "");
    const rolePreset = String(form.get("rolePreset") || staffRolePreset);
    const roleTitle = resolveStaffRoleTitle(
      rolePreset,
      String(form.get("customRoleTitle") || ""),
    );

    if (!roleTitle) {
      notify("Role title required", "Choose or enter a staff role title.", "warning");
      return;
    }

    await runConfirmedAction(
      "create-staff",
      {
        confirmLabel: "Add staff",
        message:
          "This will create a staff account with operations access and the selected role title.",
        title: `Add ${username || "this"} staff account?`,
        tone: "success",
      },
      async () => {
        await adminAction("create_staff", {
          displayName: String(form.get("displayName") || ""),
          password: String(form.get("password") || ""),
          roleTitle,
          username,
        });

        formElement.reset();
        setStaffRolePreset(staffRolePresetOptions[0].value);
        await refreshSections(["access"], { background: true });
        notify("Staff added", `${roleTitle} can now sign in with staff access.`, "success");
      },
    );
  }

  async function submitCreatePartnerAccess(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const username = String(form.get("username") || "");

    await runConfirmedAction(
      "create-partner-access",
      {
        confirmLabel: "Enable partner",
        message:
          "This will create the partner's portal credentials and unlock their workspace inside the admin product.",
        title: `Enable portal access for ${username || "this partner"}?`,
        tone: "success",
      },
      async () => {
        await adminAction("create_partner_access", {
          displayName: String(form.get("displayName") || ""),
          partnerId: String(form.get("partnerId") || ""),
          password: String(form.get("password") || ""),
          username,
        });

        formElement.reset();
        await refreshSections(["access", "partners"], { background: true });
        notify(
          "Partner access created",
          "This partner can now sign in to their workspace.",
          "success",
        );
      },
    );
  }

  async function submitResetPassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const currentPassword = String(form.get("currentPassword") || "");
    const newPassword = String(form.get("newPassword") || "");
    const confirmPassword = String(form.get("confirmPassword") || "");

    if (newPassword !== confirmPassword) {
      notify("Password mismatch", "The new password confirmation does not match.", "error");
      return;
    }

    await runConfirmedAction(
      "reset-own-password",
      {
        confirmLabel: "Update password",
        message: "This will immediately replace your current password for future sign-ins.",
        title: "Update your password?",
        tone: "primary",
      },
      async () => {
        await adminAction("reset_password", {
          currentPassword,
          newPassword,
        });

        formElement.reset();
        if (session?.role === "partner") {
          await refreshSections(["workspace"], { background: true });
        } else {
          await refreshSections(["access"], { background: true });
        }
        notify("Password updated", "Your password was changed successfully.", "success");
      },
    );
  }

  async function handleAccountStatusToggle(
    accountId: string,
    isCurrentlyActive: boolean,
    label: string,
  ) {
    await runConfirmedAction(
      `account-status:${accountId}`,
      {
        confirmLabel: isCurrentlyActive ? "Deactivate account" : "Reactivate account",
        message: isCurrentlyActive
          ? "This removes the account's access until it is reactivated."
          : "This restores the account's ability to sign in again.",
        title: isCurrentlyActive
          ? `Deactivate ${label}?`
          : `Reactivate ${label}?`,
        tone: isCurrentlyActive ? "danger" : "success",
      },
      async () => {
        await adminAction("toggle_account_status", {
          accountId,
          isActive: !isCurrentlyActive,
        });
        await refreshSections(["access"], { background: true });
        notify(
          isCurrentlyActive ? "Account deactivated" : "Account reactivated",
          `${label} was updated successfully.`,
          "success",
        );
      },
    );
  }

  async function submitDispatch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);

    await runConfirmedAction(
      "dispatch-settings",
      {
        confirmLabel: "Save dispatch",
        message: "These changes affect live dispatch, routing, and ETA behavior across the service.",
        title: "Apply dispatch settings?",
        tone: "primary",
      },
      async () => {
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
        await refreshSections(["overview", "settings"]);
        notify("Dispatch saved", "Dispatch settings were updated.", "success");
      },
    );
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
    await refreshSections(sectionsToRefresh);
  }

  async function submitFeeConfig(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);

    await runConfirmedAction(
      "config-driver-fee",
      {
        confirmLabel: "Save fee",
        message: "This updates the subscription and provider fee settings used across driver billing.",
        title: "Save driver fee settings?",
        tone: "primary",
      },
      async () => {
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
      },
    );
  }

  async function submitHybridConfig(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    let serviceFeeBands: unknown[] = [];

    try {
      serviceFeeBands = parseJsonInput(form.get("service_fee_bands"), []) as unknown[];
    } catch {
      notify(
        "Invalid JSON",
        "Service fee bands must be valid JSON before they can be saved.",
        "error",
      );
      return;
    }

    await runConfirmedAction(
      "config-hybrid-finance",
      {
        confirmLabel: "Save finance settings",
        message:
          "This updates service fee, withdrawal, and partner settlement behavior for the marketplace.",
        title: "Save hybrid finance settings?",
        tone: "primary",
      },
      async () => {
        await submitAppConfig(
          "hybrid_finance_settings",
          "Hybrid marketplace settings for service fees, withdrawals, and partner settlement.",
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
      },
    );
  }

  async function submitTripBillingConfig(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);

    await runConfirmedAction(
      "config-trip-billing",
      {
        confirmLabel: "Save trip billing",
        message:
          "These rules control the wait timer shown to customers, the real grace windows, and every flat waiting surcharge across rides and deliveries.",
        title: "Save wait-time billing rules?",
        tone: "primary",
      },
      async () => {
        await submitAppConfig(
          "trip_billing_settings",
          "Trip billing rules for wait timers, grace windows, and flat waiting surcharges.",
          {
            customer_visible_wait_timer_minutes: Number(
              form.get("customer_visible_wait_timer_minutes") || 7,
            ),
            pickup_wait_grace_minutes: Number(
              form.get("pickup_wait_grace_minutes") || 10,
            ),
            delivery_wait_charge_grace_minutes: Number(
              form.get("delivery_wait_charge_grace_minutes") || 10,
            ),
            wait_fee_interval_minutes: Number(
              form.get("wait_fee_interval_minutes") || 5,
            ),
            wait_fee_amount: Number(form.get("wait_fee_amount") || 10),
            delivery_wait_fee_interval_minutes: Number(
              form.get("delivery_wait_fee_interval_minutes") || 5,
            ),
            delivery_wait_fee_amount: Number(
              form.get("delivery_wait_fee_amount") || 10,
            ),
            allow_price_reduction:
              String(form.get("allow_price_reduction")) === "true",
            charge_only_when_customer_not_ready:
              String(form.get("charge_only_when_customer_not_ready")) !== "false",
            charge_for_traffic:
              String(form.get("charge_for_traffic")) === "true",
            charge_for_driver_delay:
              String(form.get("charge_for_driver_delay")) === "true",
            charge_for_route_delay:
              String(form.get("charge_for_route_delay")) === "true",
          },
          ["overview", "rides", "scheduled-rides", "settings"],
        );
        notify(
          "Trip billing saved",
          "Wait-time timers and surcharge rules were updated.",
          "success",
        );
      },
    );
  }

  async function submitAirportConfig(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    let zones: unknown[] = [];

    try {
      zones = parseJsonInput(form.get("zones"), []) as unknown[];
    } catch {
      notify(
        "Invalid JSON",
        "Airport zones must be valid JSON before they can be saved.",
        "error",
      );
      return;
    }

    await runConfirmedAction(
      "config-airport-pricing",
      {
        confirmLabel: "Save airport pricing",
        message:
          "These settings control airport pickup fees, reservation fees, included wait time, and the airport zones used in booking and dispatch.",
        title: "Save airport trip settings?",
        tone: "primary",
      },
      async () => {
        await submitAppConfig(
          "airport_trip_settings",
          "Airport ride pricing and reservation settings controlled centrally by the platform.",
          {
            enabled: String(form.get("enabled")) !== "false",
            reservation_enabled:
              String(form.get("reservation_enabled")) !== "false",
            enforce_in_app_price_only:
              String(form.get("enforce_in_app_price_only")) !== "false",
            default_pickup_access_fee_amount: Number(
              form.get("default_pickup_access_fee_amount") || 0,
            ),
            default_pickup_convenience_fee_amount: Number(
              form.get("default_pickup_convenience_fee_amount") || 0,
            ),
            default_dropoff_fee_amount: Number(
              form.get("default_dropoff_fee_amount") || 0,
            ),
            default_reservation_fee_amount: Number(
              form.get("default_reservation_fee_amount") || 1200,
            ),
            default_reservation_dispatch_lead_minutes: Number(
              form.get("default_reservation_dispatch_lead_minutes") || 45,
            ),
            default_reservation_included_wait_minutes: Number(
              form.get("default_reservation_included_wait_minutes") || 30,
            ),
            default_reservation_min_lead_minutes: Number(
              form.get("default_reservation_min_lead_minutes") || 30,
            ),
            policy_copy: String(form.get("policy_copy") || "").trim(),
            reservation_copy: String(form.get("reservation_copy") || "").trim(),
            zones,
          },
          ["overview", "rides", "scheduled-rides", "settings"],
        );
        notify(
          "Airport pricing saved",
          "Airport fees and reservation rules were updated.",
          "success",
        );
      },
    );
  }

  async function submitWorkspaceBranding(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const logoFile = form.get("logo_file");
    const clearLogo = String(form.get("clear_logo") || "") === "true";
    let logoUrl = String(form.get("logo_url") || "").trim();

    if (logoFile instanceof File && logoFile.size > 0) {
      try {
        logoUrl = await readImageFileAsDataUrl(logoFile);
      } catch (error) {
        notify(
          "Logo upload failed",
          error instanceof Error ? error.message : "The logo could not be processed.",
          "error",
        );
        return;
      }
    }

    await runConfirmedAction(
      "workspace-branding",
      {
        confirmLabel: clearLogo ? "Use default logo" : "Save logo",
        message: clearLogo
          ? "This will remove your custom partner logo and return your workspace to the default brand mark."
          : "This will update your partner workspace logo anywhere your portal branding is shown.",
        title: clearLogo ? "Remove your custom logo?" : "Save your workspace logo?",
        tone: "primary",
      },
      async () => {
        await adminAction("update_partner_branding", {
          clearLogo,
          logoUrl,
        });
        formElement.reset();
        await refreshSections(["workspace"], { background: true });
        notify(
          "Workspace branding saved",
          clearLogo
            ? "Your workspace is back on the default Drop brand."
            : "Your logo was updated successfully.",
          "success",
        );
      },
    );
  }

  async function submitServiceTypeCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);

    await runConfirmedAction(
      "create-service-type",
      {
        confirmLabel: "Create service",
        message: "This adds a new service type to the marketplace configuration.",
        title: "Create this service type?",
        tone: "success",
      },
      async () => {
        await adminAction("create_service_type", {
          capacity: Number(form.get("capacity") || 4),
          description: String(form.get("description") || ""),
          label: String(form.get("label") || ""),
          name: String(form.get("name") || "car"),
          sort_order: Number(form.get("sort_order") || 0),
        });
        formElement.reset();
        await refreshSections(["settings"]);
        notify("Service created", "The service type was added.", "success");
      },
    );
  }

  async function submitCancelReasonCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);

    await runConfirmedAction(
      "create-cancel-reason",
      {
        confirmLabel: "Create reason",
        message: "This adds a new cancellation reason to the product configuration.",
        title: "Create this cancellation reason?",
        tone: "success",
      },
      async () => {
        await adminAction("create_cancel_reason", {
          display_order: Number(form.get("display_order") || 0),
          label: String(form.get("label") || ""),
          role: String(form.get("role") || "customer"),
          value: String(form.get("value") || ""),
        });
        formElement.reset();
        await refreshSections(["settings"]);
        notify("Reason created", "The cancel reason was added.", "success");
      },
    );
  }

  async function submitServiceTypeUpdate(
    event: FormEvent<HTMLFormElement>,
    serviceTypeId: string,
  ) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);

    await runConfirmedAction(
      `update-service-type:${serviceTypeId}`,
      {
        confirmLabel: "Save service",
        message: "This updates the live service catalog configuration.",
        title: "Save service type changes?",
        tone: "primary",
      },
      async () => {
        await adminAction("update_service_type", {
          capacity: Number(form.get("capacity") || 4),
          description: String(form.get("description") || ""),
          is_active: String(form.get("is_active")) === "true",
          label: String(form.get("label") || ""),
          serviceTypeId,
          sort_order: Number(form.get("sort_order") || 0),
        });
        await refreshSections(["settings"]);
        notify("Service updated", "Service type changes were saved.", "success");
      },
    );
  }

  async function submitCancelReasonUpdate(
    event: FormEvent<HTMLFormElement>,
    cancelReasonId: string,
  ) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);

    await runConfirmedAction(
      `update-cancel-reason:${cancelReasonId}`,
      {
        confirmLabel: "Save reason",
        message: "This updates the cancellation reasons shown across the apps.",
        title: "Save cancellation reason changes?",
        tone: "primary",
      },
      async () => {
        await adminAction("update_cancel_reason", {
          cancelReasonId,
          display_order: Number(form.get("display_order") || 0),
          is_active: String(form.get("is_active")) === "true",
          label: String(form.get("label") || ""),
          value: String(form.get("value") || ""),
        });
        await refreshSections(["settings"]);
        notify("Cancel reason updated", "Cancel reason changes were saved.", "success");
      },
    );
  }

  async function submitSupportReply(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!selectedSupportThread?.ride_id) {
      notify("Select a thread", "Choose a support conversation before replying.", "warning");
      return;
    }

    const messageBody = supportReplyBody.trim();
    if (!messageBody) {
      notify("Message required", "Write a support response before sending it.", "warning");
      return;
    }

    await runConfirmedAction(
      `support-reply:${selectedSupportThread.ride_id}`,
      {
        confirmLabel: "Send response",
        message:
          "This sends a support response to the selected ride participants and records it in the support timeline.",
        title: "Send this support response?",
        tone: "primary",
      },
      async () => {
        await adminAction("send_support_reply", {
          audience: supportReplyAudience,
          body: messageBody,
          channelId: "trip-alerts",
          rideId: selectedSupportThread.ride_id,
          title: "Support response from Drop",
        });
        setSupportReplyBody("");
        setSupportComposer(null);
        await refreshSections(["support"], { background: true });
        notify("Support reply sent", "The response was delivered and logged.", "success");
      },
    );
  }

  async function handleAccountPasswordReset(accountId: string, username: string) {
    const promptResult = await requestPrompt({
      confirmLabel: "Use temporary password",
      fields: [
        {
          label: "Temporary password",
          name: "newPassword",
          placeholder: `New temporary password for ${username}`,
          required: true,
          type: "password",
        },
      ],
      message: "Set a temporary password that you can share securely with this operator.",
      title: `Temporary password for ${username}`,
      tone: "danger",
    });

    const newPassword = promptResult?.newPassword?.trim() || "";
    if (!newPassword) {
      return;
    }

    await runConfirmedAction(
      `account-reset:${accountId}`,
      {
        confirmLabel: "Reset password",
        message:
          "This replaces the account password immediately. Share the temporary password securely with the operator.",
        title: `Reset ${username}'s password?`,
        tone: "danger",
      },
      async () => {
        await adminAction("reset_password", {
          accountId,
          newPassword,
        });
        await refreshSections(["access"], { background: true });
        notify("Password reset", "A new temporary password was saved for the account.", "success");
      },
    );
  }

  const overview = sectionData.overview as AnyRecord | null;
  const liveOps = sectionData["live-ops"] as AnyRecord | null;
  const rides = (sectionData.rides as AnyRecord[]) || [];
  const drivers = (sectionData.drivers as AnyRecord[]) || [];
  const customers = (sectionData.customers as AnyRecord[]) || [];
  const scheduledRides = (sectionData["scheduled-rides"] as AnyRecord[]) || [];
  const finance = sectionData.finance as AnyRecord | null;
  const partners = (sectionData.partners as AnyRecord[]) || [];
  const support = sectionData.support as AnyRecord | null;
  const supportThreads = (support?.threads as AnyRecord[]) || [];
  const supportConversationThreads = supportThreads.filter(
    (thread) => Array.isArray(thread.transcript) && thread.transcript.length > 0,
  );
  const access = sectionData.access as AnyRecord | null;
  const settings = sectionData.settings as AnyRecord | null;
  const workspace = sectionData.workspace as AnyRecord | null;
  const workspacePartnerLogoOverride = String(
    workspace?.partner?.metadata?.portal_logo_url ||
      workspace?.partner?.metadata?.portalLogoUrl ||
      "",
  ).trim();
  const partnerIdentityLabel =
    workspace?.partner?.name || session?.displayName || session?.username || "Partner";
  const selectedSupportThread =
    supportConversationThreads.find((thread) => String(thread.ride_id) === selectedSupportRideId) ||
    supportConversationThreads[0] ||
    null;
  const supportNavUnreadCount = activeSection === "support" ? 0 : supportUnreadTotal;
  const selectedRide =
    rides.find((ride) => String(ride.id) === selectedRideId) || null;
  const selectedDriver =
    drivers.find((driver) => String(driver.id) === selectedDriverId) || null;
  const selectedCustomer =
    customers.find((customer) => String(customer.id) === selectedCustomerId) || null;
  const isLeadershipSession = isLeadershipRole(session?.role);
  const isSuperAdminSession = session?.role === "super_admin";
  const isStaffSession = session?.role === "staff";
  const canManageLeadershipAccounts = isSuperAdminSession;
  const canManageStaffAccounts = isLeadershipSession;
  const canReviewDriverDocuments = isLeadershipSession;
  const canEditOperationalRecords = isLeadershipSession;
  const canModerateSupport = isLeadershipSession || isStaffSession;
  const canBroadcastNotifications = isLeadershipSession;
  const currentRoleLabel = getRoleLabel(session?.role, session?.roleTitle);

  const canResetManagedAccountPassword = (accountRow: AnyRecord) => {
    if (!session) {
      return false;
    }

    if (isSuperAdminSession) {
      return true;
    }

    if (session.role === "admin") {
      return accountRow.role === "staff" || accountRow.role === "partner";
    }

    return false;
  };

  const canToggleManagedAccount = (accountRow: AnyRecord) => {
    if (!session || !canManageStaffAccounts) {
      return false;
    }

    if (String(accountRow.id || "") === String(session.accountId || "")) {
      return false;
    }

    if (accountRow.is_bootstrap) {
      return false;
    }

    return accountRow.role === "staff";
  };

  const getAppConfigValue = (key: string) =>
    settings?.appConfigs?.find?.((item: AnyRecord) => item.key === key)?.value || {};
  const adminLogoSrc = DEFAULT_DASHBOARD_LOGO;
  const partnerInitialsLogoSrc = createInitialsLogoDataUrl(partnerIdentityLabel);
  const partnerFallbackLogoSrc = partnerInitialsLogoSrc;
  const partnerLogoSrc = normalizeAssetUrl(
    workspacePartnerLogoOverride,
    partnerFallbackLogoSrc,
  );
  const activeBrandLogoSrc = session?.role === "partner" ? partnerLogoSrc : adminLogoSrc;
  const activeBrowserIconSrc = session?.role === "partner" ? partnerLogoSrc : adminLogoSrc;
  const activeBrandFallbackSrc =
    session?.role === "partner" ? partnerFallbackLogoSrc : DEFAULT_DASHBOARD_LOGO;

  useEffect(() => {
    if (selectedRideId && !rides.some((ride) => String(ride.id) === selectedRideId)) {
      setSelectedRideId(null);
    }
  }, [rides, selectedRideId]);

  useEffect(() => {
    if (selectedDriverId && !drivers.some((driver) => String(driver.id) === selectedDriverId)) {
      setSelectedDriverId(null);
    }
  }, [drivers, selectedDriverId]);

  useEffect(() => {
    if (
      selectedCustomerId &&
      !customers.some((customer) => String(customer.id) === selectedCustomerId)
    ) {
      setSelectedCustomerId(null);
    }
  }, [customers, selectedCustomerId]);

  useEffect(() => {
    if (!supportConversationThreads.length) {
      setSelectedSupportRideId(null);
      return;
    }

    if (
      !selectedSupportRideId ||
      !supportConversationThreads.some((thread) => String(thread.ride_id) === selectedSupportRideId)
    ) {
      setSelectedSupportRideId(String(supportConversationThreads[0].ride_id));
    }
  }, [selectedSupportRideId, supportConversationThreads]);

  useEffect(() => {
    if (activeSection === "support") {
      setSupportUnreadTotal(0);
    }
  }, [activeSection]);

  useEffect(() => {
    if (
      activeSection !== "support" ||
      !session?.accountId ||
      !selectedSupportThread?.ride_id ||
      !selectedSupportThread?.last_message?.id
    ) {
      return;
    }

    const rideId = String(selectedSupportThread.ride_id);
    const latestMessageId = Number(selectedSupportThread.last_message.id || 0);
    if (!latestMessageId || supportSeenMessageRef.current[rideId] === latestMessageId) {
      return;
    }

    supportSeenMessageRef.current[rideId] = latestMessageId;
    setSupportUnreadByRide((current) => ({
      ...current,
      [rideId]: 0,
    }));

    void adminAction("mark_support_thread_seen", {
      lastSeenMessageId: latestMessageId,
      rideId,
    }).catch(() => {
      supportSeenMessageRef.current[rideId] = 0;
    });
  }, [activeSection, selectedSupportThread, session?.accountId]);

  useEffect(() => {
    if (typeof document === "undefined" || !activeBrowserIconSrc) {
      return;
    }

    const applyLink = (rel: string) => {
      let link = document.head.querySelector(`link[rel="${rel}"]`) as HTMLLinkElement | null;

      if (!link) {
        link = document.createElement("link");
        link.rel = rel;
        document.head.appendChild(link);
      }

      link.href = activeBrowserIconSrc;
    };

    applyLink("icon");
    applyLink("shortcut icon");
    applyLink("apple-touch-icon");
  }, [activeBrowserIconSrc]);

  useEffect(() => {
    if (!session) {
      return;
    }

    const supabase = getSupabaseBrowserClient();
    if (!supabase) {
      return;
    }

    const channel = supabase
      .channel(`dashboard-support-unread:${session.accountId || session.username}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "ride_messages",
        },
        (payload) => {
          const rideId = String(payload.new?.ride_id || "");
          if (!rideId) {
            return;
          }

          if (activeSection === "support" && rideId === String(selectedSupportThread?.ride_id || "")) {
            return;
          }

          setSupportUnreadByRide((current) => ({
            ...current,
            [rideId]: Number(current[rideId] || 0) + 1,
          }));

          if (activeSection !== "support") {
            setSupportUnreadTotal((current) => current + 1);
          }
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [activeSection, selectedSupportThread?.ride_id, session]);

  useEffect(() => {
    if (activeSection !== "support" || !selectedSupportThread?.ride_id) {
      setSupportTypingLabel("");
      return;
    }

    const supabase = getSupabaseBrowserClient();
    if (!supabase) {
      return;
    }

    const rideId = String(selectedSupportThread.ride_id);
    const channel = supabase
      .channel(`dashboard-support-typing:${rideId}`)
      .on("broadcast", { event: "typing" }, (payload) => {
        const typingPayload = payload?.payload as AnyRecord | undefined;
        if (!typingPayload) {
          return;
        }

        const typingUserId = String(typingPayload.userId || "");
        const typingUser =
          typingUserId && typingUserId === selectedSupportThread.customer?.id
            ? selectedSupportThread.customer
            : typingUserId && typingUserId === selectedSupportThread.driver?.id
              ? selectedSupportThread.driver
              : null;

        if (supportTypingTimeoutRef.current) {
          window.clearTimeout(supportTypingTimeoutRef.current);
          supportTypingTimeoutRef.current = null;
        }

        if (!typingPayload.isTyping) {
          setSupportTypingLabel("");
          return;
        }

        setSupportTypingLabel(
          `${typingUser?.full_name || "A participant"} is typing a message...`,
        );

        supportTypingTimeoutRef.current = window.setTimeout(() => {
          setSupportTypingLabel("");
          supportTypingTimeoutRef.current = null;
        }, 2400);
      })
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);

      if (supportTypingTimeoutRef.current) {
        window.clearTimeout(supportTypingTimeoutRef.current);
        supportTypingTimeoutRef.current = null;
      }
    };
  }, [activeSection, selectedSupportThread]);

  const renderOverviewSection = () => (
    <PanelShell descriptor={sectionDescriptors.overview} lastRefresh={lastRefresh.overview}>
      {loadingSections.overview && !overview ? (
        <LoadingCard message="Loading marketplace overview..." />
      ) : sectionErrors.overview ? (
        <ErrorState message={sectionErrors.overview} title="Overview unavailable" />
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

            <Subcard eyebrow="Snapshot" title="Dispatch and pricing">
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
    </PanelShell>
  );

  const renderLiveOpsSection = () => (
    <PanelShell descriptor={sectionDescriptors["live-ops"]} lastRefresh={lastRefresh["live-ops"]}>
      {loadingSections["live-ops"] && !liveOps ? (
        <LoadingCard message="Loading live operations..." />
      ) : sectionErrors["live-ops"] ? (
        <ErrorState message={sectionErrors["live-ops"]} title="Live operations unavailable" />
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
                  label: "Codes",
                  render: (ride) => (
                    <div className="inline-code-stack">
                      <span className="inline-code-label">PU</span>
                      <strong className="inline-code-value">
                        {String(ride.pickup_code || "—")}
                      </strong>
                      <span className="inline-code-label">DO</span>
                      <strong className="inline-code-value">
                        {String(ride.dropoff_code || "—")}
                      </strong>
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

          <Subcard eyebrow="Support shortcuts" title="Verification & trip codes">
            <DataTable
              columns={[
                {
                  label: "Trip",
                  render: (ride) => (
                    <Stack
                      subtitle={ride.customer?.full_name || "No customer"}
                      tertiary={ride.id}
                      title={ride.pickup_address || "Unknown pickup"}
                    />
                  ),
                },
                {
                  label: "Type",
                  render: (ride) => (
                    <div className="tag-set">
                      <Pill
                        label={getRideTypeLabel(ride)}
                        tone={ride.is_delivery ? "warning" : "info"}
                      />
                      <Pill
                        label={ride.status || "unknown"}
                        tone={renderTone(ride.status || "")}
                      />
                    </div>
                  ),
                },
                {
                  label: "Pickup code",
                  render: (ride) => (
                    <strong className="inline-code-value">
                      {String(ride.pickup_code || "—")}
                    </strong>
                  ),
                },
                {
                  label: "Dropoff code",
                  render: (ride) => (
                    <strong className="inline-code-value">
                      {String(ride.dropoff_code || "—")}
                    </strong>
                  ),
                },
              ]}
              emptyMessage="No active rides or deliveries are generating trip codes right now. As soon as a trip becomes active, its pickup and dropoff codes will show here."
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

          <Subcard eyebrow="Trust + verification" title="Recent OTPs">
            {!isLeadershipSession ? (
              <div className="detail-note-card">
                <strong>Restricted for staff accounts</strong>
                <p>Live OTP visibility is limited to admin and super admin sessions.</p>
              </div>
            ) : (
              <DataTable
                columns={[
                  {
                    label: "OTP",
                    render: (otp) => (
                      <div className="inline-code-stack">
                        <strong className="inline-code-value">{String(otp.code || "—")}</strong>
                        <Pill
                          label={getOtpStatusLabel(otp)}
                          tone={isOtpActive(otp) ? "success" : "danger"}
                        />
                      </div>
                    ),
                  },
                  {
                    label: "Phone",
                    render: (otp) => (
                      <Stack
                        subtitle={`Expires ${formatDateTime(otp.expires_at)}`}
                        title={String(otp.phone || "No phone")}
                      />
                    ),
                  },
                  {
                    label: "Created",
                    render: (otp) => <span>{formatDateTime(otp.created_at)}</span>,
                  },
                ]}
                emptyMessage="No recent OTP activity is available right now."
                rows={liveOps.recentOtps || []}
              />
            )}
          </Subcard>
        </div>
      )}
    </PanelShell>
  );

  const renderRidesSection = () => (
    <PanelShell descriptor={sectionDescriptors.rides} lastRefresh={lastRefresh.rides}>
      {sectionErrors.rides ? (
        <ErrorState message={sectionErrors.rides} title="Rides unavailable" />
      ) : (
        <>
          <form
            className="subcard"
            onSubmit={(event) => {
              event.preventDefault();
            }}
          >
            <div className="subcard-header">
              <div>
                <span>Filters</span>
                <h4>Ride query</h4>
              </div>
              <Pill label="Auto applies" tone="success" />
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
                  {["all", "pending", "accepted", "arrived", "on_trip", "completed", "cancelled"].map(
                    (option) => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ),
                  )}
                </select>
              </label>
              <label>
                Trip type
                <select
                  onChange={(event) =>
                    setFilters((current) => ({
                      ...current,
                      ridesTripType: event.target.value,
                    }))
                  }
                  value={filters.ridesTripType}
                >
                  <option value="all">All trips</option>
                  <option value="ride">All rides</option>
                  <option value="delivery">All deliveries</option>
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

          {loadingSections.rides && !rides.length ? (
            <LoadingCard message="Refreshing rides..." />
          ) : (
            <div className="detail-layout">
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
                          <Pill label={getRideTypeLabel(ride)} tone={ride.is_delivery ? "warning" : "info"} />
                          {ride.is_airport_trip ? (
                            <Pill label={getAirportTripLabel(ride)} tone="warning" />
                          ) : null}
                          <Pill label={ride.status || "unknown"} tone={renderTone(ride.status || "")} />
                          <Pill
                            label={ride.payment_status || "pending"}
                            tone={renderTone(ride.payment_status || "")}
                          />
                        </div>
                      ),
                    },
                    {
                      label: "Actions",
                      render: (ride) =>
                        canEditOperationalRecords ? (
                          <div className="inline-actions">
                            <button
                              className="ghost-button"
                              disabled={
                                isActionPending(`follow-up:${String(ride.id)}`) ||
                                isActionPending(`cancel-ride:${String(ride.id)}`)
                              }
                              onClick={(event) => {
                                event.stopPropagation();
                                void handleRideFollowUp(
                                  String(ride.id),
                                  String(ride.payment_follow_up_status || "none"),
                                  String(ride.payment_follow_up_note || ""),
                                );
                              }}
                              type="button"
                            >
                              {isActionPending(`follow-up:${String(ride.id)}`) ? "Saving..." : "Follow-up"}
                            </button>
                            <button
                              className="danger-button"
                              disabled={isActionPending(`cancel-ride:${String(ride.id)}`)}
                              onClick={(event) => {
                                event.stopPropagation();
                                void handleRideCancel(String(ride.id));
                              }}
                              type="button"
                            >
                              {isActionPending(`cancel-ride:${String(ride.id)}`) ? "Cancelling..." : "Cancel"}
                            </button>
                          </div>
                        ) : (
                          <span className="muted">Click row to inspect</span>
                        ),
                    },
                  ]}
                  emptyMessage="No rides match the current filters."
                  isLoading={loadingSections.rides}
                  loadingMessage="Refreshing rides..."
                  onRowClick={(ride) => setSelectedRideId(String(ride.id))}
                  rows={rides}
                  selectedRowId={selectedRideId}
                />
              </Subcard>

              <Subcard
                eyebrow="Selected trip"
                title={selectedRide ? `${getRideTypeLabel(selectedRide)} ${selectedRide.id}` : "Choose a ride"}
              >
                {!selectedRide ? (
                  <EmptyState
                    message="Click any ride row to inspect the customer, driver, payment, timing, and delivery image details."
                    title="No ride selected"
                  />
                ) : (
                  <>
                    <div className="detail-identity-grid">
                      <IdentityCard
                        avatarUrl={String(selectedRide.customer?.avatar_url || "")}
                        subtitle={selectedRide.customer?.phone || "No phone"}
                        tertiary={selectedRide.customer?.email || "No email"}
                        title={selectedRide.customer?.full_name || "Unknown customer"}
                      />
                      <IdentityCard
                        avatarUrl={String(selectedRide.driver?.avatar_url || "")}
                        subtitle={selectedRide.driver?.phone || "No phone"}
                        tertiary={selectedRide.driver?.email || "No email"}
                        title={selectedRide.driver?.full_name || "Unassigned driver"}
                      />
                    </div>

                    <div className="tag-set">
                      <Pill label={getRideTypeLabel(selectedRide)} tone={selectedRide.is_delivery ? "warning" : "info"} />
                      {selectedRide.is_airport_trip ? (
                        <Pill label={getAirportTripLabel(selectedRide)} tone="warning" />
                      ) : null}
                      <Pill label={selectedRide.status || "unknown"} tone={renderTone(selectedRide.status || "")} />
                      <Pill
                        label={selectedRide.payment_status || "pending"}
                        tone={renderTone(selectedRide.payment_status || "")}
                      />
                      <Pill
                        label={selectedRide.payment_follow_up_status || "none"}
                        tone={renderTone(selectedRide.payment_follow_up_status || "")}
                      />
                    </div>

                    {selectedRide.sensitive_fields_hidden ? (
                      <div className="detail-note-card">
                        Internal payout and margin figures are hidden for staff accounts.
                      </div>
                    ) : null}

                    {selectedRide.is_airport_trip ? (
                      <div className="detail-note-card">
                        <strong>Airport pricing policy</strong>
                        <p>
                          Airport trips must follow the in-app price only. Drivers should not
                          request separate airport cash outside the platform.
                        </p>
                      </div>
                    ) : null}

                    <VerificationCodesCard ride={selectedRide} />

                    <div className="detail-grid">
                      <DetailField label="Pickup" value={selectedRide.pickup_address || "—"} />
                      <DetailField label="Dropoff" value={selectedRide.destination_address || "—"} />
                      <DetailField
                        label="Airport pickup zone"
                        value={selectedRide.airport_pickup_zone_name || "—"}
                      />
                      <DetailField
                        label="Airport dropoff zone"
                        value={selectedRide.airport_dropoff_zone_name || "—"}
                      />
                      <DetailField label="Driver fare" value={formatCurrency(selectedRide.price)} />
                      <DetailField
                        label="Customer charge"
                        value={
                          selectedRide.financials?.customer_total_amount != null
                            ? formatCurrency(selectedRide.financials.customer_total_amount)
                            : "—"
                        }
                      />
                      <DetailField
                        label="Service fee"
                        value={
                          selectedRide.financials?.service_fee_amount != null
                            ? formatCurrency(selectedRide.financials.service_fee_amount)
                            : "—"
                        }
                      />
                      <DetailField
                        label="Quoted fare"
                        value={
                          selectedRide.quoted_price_amount != null
                            ? formatCurrency(selectedRide.quoted_price_amount)
                            : "—"
                        }
                      />
                      <DetailField
                        label="Airport surcharge"
                        value={formatCurrency(selectedRide.airport_surcharge_amount)}
                      />
                      <DetailField label="Payment mode" value={selectedRide.paymentMode || "—"} />
                      <DetailField
                        label="Payment record"
                        value={
                          selectedRide.latest_payment
                            ? `${selectedRide.latest_payment.payment_method || "payment"} / ${selectedRide.latest_payment.provider || "provider"}`
                            : "—"
                        }
                      />
                      <DetailField label="Created" value={formatDateTime(selectedRide.created_at)} />
                      <DetailField label="Accepted" value={formatDateTime(selectedRide.accepted_at)} />
                      <DetailField label="Completed" value={formatDateTime(selectedRide.completed_at)} />
                      <DetailField
                        label="Trip duration"
                        value={formatDuration(selectedRide.actual_trip_seconds)}
                      />
                      <DetailField
                        label="Pickup wait"
                        value={formatDuration(selectedRide.pickup_wait_seconds)}
                      />
                      <DetailField
                        label="Billable wait"
                        value={formatDuration(selectedRide.billable_waiting_seconds)}
                      />
                    </div>

                    {selectedRide.payment_follow_up_note ? (
                      <div className="detail-note-card">
                        <strong>Follow-up note</strong>
                        <p>{selectedRide.payment_follow_up_note}</p>
                      </div>
                    ) : null}

                    {selectedRide.delivery_item_info ? (
                      <div className="detail-json-card">
                        <span>Delivery metadata</span>
                        <pre>{JSON.stringify(selectedRide.delivery_item_info, null, 2)}</pre>
                      </div>
                    ) : null}

                    <ImageGallery
                      images={[
                        { label: "Delivery item", url: getDeliveryImageUrl(selectedRide) },
                      ].filter((image) => image.url)}
                    />
                  </>
                )}
              </Subcard>
            </div>
          )}
        </>
      )}
    </PanelShell>
  );

  const renderDriversSection = () => (
    <PanelShell descriptor={sectionDescriptors.drivers} lastRefresh={lastRefresh.drivers}>
      {sectionErrors.drivers ? (
        <ErrorState message={sectionErrors.drivers} title="Drivers unavailable" />
      ) : (
        <>
          <form
            className="subcard"
            onSubmit={(event) => {
              event.preventDefault();
            }}
          >
            <div className="subcard-header">
              <div>
                <span>Search</span>
                <h4>Driver roster</h4>
              </div>
              <Pill label="Auto applies" tone="success" />
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

          {loadingSections.drivers && !drivers.length ? (
            <LoadingCard message="Refreshing drivers..." />
          ) : (
            <div className="detail-layout">
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
                      label: "Payouts",
                      render: (driver) => {
                        const latestPayout = driver.recent_payouts?.[0] || null;
                        const payoutAccount = driver.default_payout_account || null;

                        return (
                          <Stack
                            subtitle={
                              payoutAccount
                                ? `${payoutAccount.bank_name || payoutAccount.provider || "Payout account"} / ${maskAccountNumber(payoutAccount.account_number)}`
                                : driver.sensitive_fields_hidden
                                  ? "Hidden for staff access"
                                  : "No payout account configured"
                            }
                            tertiary={
                              latestPayout
                                ? `${formatCurrency(latestPayout.amount)} / ${latestPayout.status || "requested"} / ${formatDateTime(latestPayout.completed_at || latestPayout.requested_at)}`
                                : "No payout requests yet"
                            }
                            title={
                              payoutAccount?.account_name ||
                              payoutAccount?.provider_email ||
                              (driver.sensitive_fields_hidden ? "Restricted" : "Payout readiness not set")
                            }
                          />
                        );
                      },
                    },
                    {
                      label: "Actions",
                      render: (driver) =>
                        canReviewDriverDocuments ? (
                          <div className="inline-actions">
                            <button
                              className="success-button"
                              disabled={
                                isActionPending(`driver:is_verified:${String(driver.id)}`) ||
                                isActionPending(`driver:has_paid:${String(driver.id)}`)
                              }
                              onClick={(event) => {
                                event.stopPropagation();
                                void handleDriverToggle(
                                  String(driver.id),
                                  "is_verified",
                                  !driver.is_verified,
                                );
                              }}
                              type="button"
                            >
                              {isActionPending(`driver:is_verified:${String(driver.id)}`)
                                ? "Updating..."
                                : driver.is_verified
                                  ? "Revoke verification"
                                  : "Approve driver"}
                            </button>
                            <button
                              className="success-button"
                              disabled={
                                isActionPending(`driver:has_paid:${String(driver.id)}`) ||
                                isActionPending(`driver:is_verified:${String(driver.id)}`)
                              }
                              onClick={(event) => {
                                event.stopPropagation();
                                void handleDriverToggle(String(driver.id), "has_paid", !driver.has_paid);
                              }}
                              type="button"
                            >
                              {isActionPending(`driver:has_paid:${String(driver.id)}`)
                                ? "Updating..."
                                : driver.has_paid
                                  ? "Mark unpaid"
                                  : "Mark paid"}
                            </button>
                          </div>
                        ) : (
                          <span className="muted">Click row to inspect</span>
                        ),
                    },
                  ]}
                  emptyMessage="No drivers match the current search."
                  isLoading={loadingSections.drivers}
                  loadingMessage="Refreshing drivers..."
                  onRowClick={(driver) => setSelectedDriverId(String(driver.id))}
                  rows={drivers}
                  selectedRowId={selectedDriverId}
                />
              </Subcard>

              <Subcard
                eyebrow="Selected driver"
                title={selectedDriver ? selectedDriver.full_name || "Driver record" : "Choose a driver"}
              >
                {!selectedDriver ? (
                  <EmptyState
                    message="Click a driver row to review uploaded particulars, linked vehicle details, avatars, and recent trip activity."
                    title="No driver selected"
                  />
                ) : (
                  <>
                    <IdentityCard
                      avatarUrl={String(selectedDriver.avatar_url || "")}
                      subtitle={selectedDriver.phone || "No phone"}
                      tertiary={selectedDriver.email || "No email"}
                      title={selectedDriver.full_name || "Unnamed driver"}
                    />

                    <div className="tag-set">
                      <Pill
                        label={selectedDriver.activation_state || "unknown"}
                        tone={renderTone(selectedDriver.activation_state || "")}
                      />
                      <Pill
                        label={selectedDriver.is_verified ? "Verified" : "Not verified"}
                        tone={selectedDriver.is_verified ? "success" : "danger"}
                      />
                      <Pill
                        label={selectedDriver.has_paid ? "Paid" : "Unpaid"}
                        tone={selectedDriver.has_paid ? "success" : "warning"}
                      />
                    </div>

                    {selectedDriver.sensitive_fields_hidden ? (
                      <div className="detail-note-card">
                        Government IDs, verification documents, wallet balances, and payout details are hidden for staff accounts.
                      </div>
                    ) : null}

                    {canReviewDriverDocuments ? (
                      <OtpSnapshotCard
                        otp={selectedDriver.latest_otp}
                        phone={selectedDriver.phone}
                        title="Latest driver OTP"
                      />
                    ) : null}

                    {canReviewDriverDocuments ? (
                      <div className="inline-actions">
                        <button
                          className="success-button"
                          disabled={
                            isActionPending(`driver:is_verified:${String(selectedDriver.id)}`) ||
                            isActionPending(`driver:has_paid:${String(selectedDriver.id)}`)
                          }
                          onClick={() =>
                            void handleDriverToggle(
                              String(selectedDriver.id),
                              "is_verified",
                              !selectedDriver.is_verified,
                            )
                          }
                          type="button"
                        >
                          {selectedDriver.is_verified ? "Revoke verification" : "Approve driver"}
                        </button>
                        <button
                          className="success-button"
                          disabled={
                            isActionPending(`driver:has_paid:${String(selectedDriver.id)}`) ||
                            isActionPending(`driver:is_verified:${String(selectedDriver.id)}`)
                          }
                          onClick={() =>
                            void handleDriverToggle(
                              String(selectedDriver.id),
                              "has_paid",
                              !selectedDriver.has_paid,
                            )
                          }
                          type="button"
                        >
                          {selectedDriver.has_paid ? "Mark unpaid" : "Mark paid"}
                        </button>
                      </div>
                    ) : null}

                    <div className="detail-grid">
                      <DetailField label="Gender" value={selectedDriver.gender || "—"} />
                      <DetailField label="Date of birth" value={formatDate(selectedDriver.dob)} />
                      <DetailField label="Driver type" value={selectedDriver.driver_type || "—"} />
                      <DetailField label="Vehicle category" value={selectedDriver.vehicle_category || "—"} />
                      <DetailField label="Rating" value={String(selectedDriver.rating || "—")} />
                      <DetailField label="Total trips" value={formatNumber(selectedDriver.total_trips || 0)} />
                      <DetailField label="Subscription expiry" value={formatDate(selectedDriver.subscription_expires_at)} />
                      <DetailField label="Last online" value={formatDateTime(selectedDriver.last_online_at)} />
                      <DetailField
                        label="Vehicle"
                        value={
                          selectedDriver.vehicle
                            ? `${selectedDriver.vehicle.make || ""} ${selectedDriver.vehicle.model || ""} ${selectedDriver.vehicle.plate_number ? `(${selectedDriver.vehicle.plate_number})` : ""}`.trim()
                            : "No vehicle linked"
                        }
                      />
                      <DetailField
                        label="Wallet"
                        value={
                          selectedDriver.wallet
                            ? `${formatCurrency(selectedDriver.wallet.available_balance || 0)} available`
                            : selectedDriver.sensitive_fields_hidden
                              ? "Hidden for staff"
                              : "No wallet data"
                        }
                      />
                      <DetailField
                        label="Payout account"
                        value={
                          selectedDriver.default_payout_account
                            ? `${selectedDriver.default_payout_account.bank_name || selectedDriver.default_payout_account.provider || "Account"} / ${maskAccountNumber(selectedDriver.default_payout_account.account_number)}`
                            : selectedDriver.sensitive_fields_hidden
                              ? "Hidden for staff"
                              : "No payout account"
                        }
                      />
                      <DetailField label="NIN" value={selectedDriver.nin_number || "—"} />
                      <DetailField label="Licence number" value={selectedDriver.license_number || "—"} />
                      <DetailField label="Licence expiry" value={formatDate(selectedDriver.license_expiry)} />
                      <DetailField
                        label="Emergency contact"
                        value={selectedDriver.emergency_contact || "—"}
                      />
                    </div>

                    <ImageGallery
                      images={[
                        { label: "Driver avatar", url: String(selectedDriver.avatar_url || "") },
                        { label: "Vehicle photo", url: String(selectedDriver.vehicle?.vehicle_image_url || "") },
                        { label: "Vehicle registration", url: String(selectedDriver.vehicle?.registration_photo_url || "") },
                        { label: "Licence photo", url: String(selectedDriver.license_photo_url || "") },
                        { label: "Licence selfie", url: String(selectedDriver.license_selfie_url || "") },
                      ].filter((image) => image.url)}
                    />

                    <div className="detail-list-stack">
                      <span className="detail-section-label">Recent rides</span>
                      {(selectedDriver.recent_rides || []).length ? (
                        (selectedDriver.recent_rides || []).map((ride: AnyRecord) => (
                          <div className="detail-list-row" key={String(ride.id)}>
                            <Stack
                              subtitle={ride.destination_address || "Unknown destination"}
                              tertiary={formatDateTime(ride.created_at)}
                              title={ride.pickup_address || "Unknown pickup"}
                            />
                            <div className="tag-set">
                              <Pill label={getRideTypeLabel(ride)} tone={ride.is_delivery ? "warning" : "info"} />
                              <Pill label={ride.status || "unknown"} tone={renderTone(ride.status || "")} />
                            </div>
                          </div>
                        ))
                      ) : (
                        <p className="detail-note">No recent rides recorded for this driver yet.</p>
                      )}
                    </div>
                  </>
                )}
              </Subcard>
            </div>
          )}
        </>
      )}
    </PanelShell>
  );

  const renderCustomersSection = () => (
    <PanelShell descriptor={sectionDescriptors.customers} lastRefresh={lastRefresh.customers}>
      {sectionErrors.customers ? (
        <ErrorState message={sectionErrors.customers} title="Customers unavailable" />
      ) : (
        <>
          <form
            className="subcard"
            onSubmit={(event) => {
              event.preventDefault();
            }}
          >
            <div className="subcard-header">
              <div>
                <span>Search</span>
                <h4>Customer directory</h4>
              </div>
              <Pill label="Auto applies" tone="success" />
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

          {loadingSections.customers && !customers.length ? (
            <LoadingCard message="Refreshing customers..." />
          ) : (
            <div className="detail-layout">
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
                        <div className="stack">
                          <div className="tag-set">
                            <Pill
                              label={customer.is_verified ? "Verified" : "Unverified"}
                              tone={customer.is_verified ? "success" : "danger"}
                            />
                            <Pill
                              label={`${String(customer.total_trips || 0)} trips`}
                              tone="neutral"
                            />
                          </div>
                          <span className="muted">
                            Rating {String(customer.rating || "—")}
                          </span>
                        </div>
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
                      render: (customer) =>
                        canEditOperationalRecords ? (
                          <div className="inline-actions">
                            <button
                              className="success-button"
                              disabled={isActionPending(`customer-verify:${String(customer.id)}`)}
                              onClick={(event) => {
                                event.stopPropagation();
                                void handleCustomerVerify(String(customer.id), !customer.is_verified);
                              }}
                              type="button"
                            >
                              {isActionPending(`customer-verify:${String(customer.id)}`)
                                ? "Updating..."
                                : customer.is_verified
                                  ? "Mark unverified"
                                  : "Mark verified"}
                            </button>
                          </div>
                        ) : (
                          <span className="muted">Click row to inspect</span>
                        ),
                    },
                  ]}
                  emptyMessage="No customers match the current search."
                  isLoading={loadingSections.customers}
                  loadingMessage="Refreshing customers..."
                  onRowClick={(customer) => setSelectedCustomerId(String(customer.id))}
                  rows={customers}
                  selectedRowId={selectedCustomerId}
                />
              </Subcard>

              <Subcard
                eyebrow="Selected customer"
                title={selectedCustomer ? selectedCustomer.full_name || "Customer record" : "Choose a customer"}
              >
                {!selectedCustomer ? (
                  <EmptyState
                    message="Click a customer row to inspect profile details, avatars, and their latest ride history."
                    title="No customer selected"
                  />
                ) : (
                  <>
                    <IdentityCard
                      avatarUrl={String(selectedCustomer.avatar_url || "")}
                      subtitle={selectedCustomer.phone || "No phone"}
                      tertiary={selectedCustomer.email || "No email"}
                      title={selectedCustomer.full_name || "Unnamed customer"}
                    />

                    <div className="tag-set">
                      <Pill
                        label={selectedCustomer.is_verified ? "Verified" : "Unverified"}
                        tone={selectedCustomer.is_verified ? "success" : "danger"}
                      />
                      <Pill
                        label={`${String(selectedCustomer.total_trips || 0)} trips`}
                        tone="neutral"
                      />
                    </div>

                    {canEditOperationalRecords ? (
                      <OtpSnapshotCard
                        otp={selectedCustomer.latest_otp}
                        phone={selectedCustomer.phone}
                        title="Latest customer OTP"
                      />
                    ) : null}

                    {canEditOperationalRecords ? (
                      <div className="inline-actions">
                        <button
                          className="success-button"
                          disabled={isActionPending(`customer-verify:${String(selectedCustomer.id)}`)}
                          onClick={() =>
                            void handleCustomerVerify(
                              String(selectedCustomer.id),
                              !selectedCustomer.is_verified,
                            )
                          }
                          type="button"
                        >
                          {selectedCustomer.is_verified ? "Mark unverified" : "Mark verified"}
                        </button>
                      </div>
                    ) : null}

                    <div className="detail-grid">
                      <DetailField label="Gender" value={selectedCustomer.gender || "—"} />
                      <DetailField label="Date of birth" value={formatDate(selectedCustomer.dob)} />
                      <DetailField label="Rating" value={String(selectedCustomer.rating || "—")} />
                      <DetailField
                        label="Active ride"
                        value={selectedCustomer.active_ride?.status || "Idle"}
                      />
                      <DetailField
                        label="Latest route"
                        value={
                          selectedCustomer.latest_ride?.pickup_address ||
                          selectedCustomer.active_ride?.pickup_address ||
                          "—"
                        }
                      />
                      <DetailField
                        label="Latest payment"
                        value={selectedCustomer.latest_ride?.payment_status || "—"}
                      />
                    </div>

                    <ImageGallery
                      images={[
                        { label: "Customer avatar", url: String(selectedCustomer.avatar_url || "") },
                      ].filter((image) => image.url)}
                    />

                    <div className="detail-list-stack">
                      <span className="detail-section-label">Recent rides</span>
                      {(selectedCustomer.recent_rides || []).length ? (
                        (selectedCustomer.recent_rides || []).map((ride: AnyRecord) => (
                          <div className="detail-list-row" key={String(ride.id)}>
                            <Stack
                              subtitle={ride.destination_address || "Unknown destination"}
                              tertiary={formatDateTime(ride.created_at)}
                              title={ride.pickup_address || "Unknown pickup"}
                            />
                            <div className="tag-set">
                              <Pill label={ride.status || "unknown"} tone={renderTone(ride.status || "")} />
                              <Pill
                                label={ride.payment_status || "pending"}
                                tone={renderTone(ride.payment_status || "")}
                              />
                            </div>
                          </div>
                        ))
                      ) : (
                        <p className="detail-note">No ride history recorded for this customer yet.</p>
                      )}
                    </div>
                  </>
                )}
              </Subcard>
            </div>
          )}
        </>
      )}
    </PanelShell>
  );

  const renderScheduledSection = () => (
    <PanelShell
      descriptor={sectionDescriptors["scheduled-rides"]}
      lastRefresh={lastRefresh["scheduled-rides"]}
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
            }}
          >
            <div className="subcard-header">
              <div>
                <span>Queue search</span>
                <h4>Scheduled dispatch view</h4>
              </div>
              <Pill label="Auto applies" tone="success" />
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
                  {["all", "scheduled", "dispatching", "completed", "cancelled"].map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          </form>

          {loadingSections["scheduled-rides"] && !scheduledRides.length ? (
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
                          disabled={isActionPending(`scheduled-cancel:${String(ride.id)}`)}
                          onClick={() => void handleScheduledCancel(String(ride.id))}
                          type="button"
                        >
                          {isActionPending(`scheduled-cancel:${String(ride.id)}`)
                            ? "Cancelling..."
                            : "Cancel"}
                        </button>
                      </div>
                    ),
                  },
                ]}
                emptyMessage="No scheduled rides match the current filters."
                isLoading={loadingSections["scheduled-rides"]}
                loadingMessage="Refreshing scheduled rides..."
                rows={scheduledRides}
              />
            </Subcard>
          )}
        </>
      )}
    </PanelShell>
  );

  const renderFinanceSection = () => {
    const flutterwaveReport = (finance?.flutterwaveTransactions || {}) as AnyRecord;
    const flutterwaveWarnings = (flutterwaveReport.warnings || []) as string[];

    return (
    <PanelShell descriptor={sectionDescriptors.finance} lastRefresh={lastRefresh.finance}>
      {loadingSections.finance && !finance ? (
        <LoadingCard message="Loading finance..." />
      ) : sectionErrors.finance ? (
        <ErrorState message={sectionErrors.finance} title="Finance unavailable" />
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

          <div className="finance-stack">
            <Subcard eyebrow="Flutterwave" title="Transaction status report">
              {!flutterwaveReport.configured ? (
                <p className="support-card-note">
                  Set FLUTTERWAVE_SECRET_KEY on the drop-admin edge function to load
                  Flutterwave transaction statuses.
                </p>
              ) : !flutterwaveReport.available ? (
                <p className="support-card-note">
                  Flutterwave transactions could not be loaded:{" "}
                  {flutterwaveReport.error || "unknown provider error"}.
                </p>
              ) : (
                <div className="finance-report-stack">
                  <div className="alert-list">
                    <div className="alert-row">
                      <strong>Report window</strong>
                      <span>
                        {formatDate(flutterwaveReport.from)} to{" "}
                        {formatDate(flutterwaveReport.to)}
                      </span>
                    </div>
                    <div className="alert-row">
                      <strong>Provider rows</strong>
                      <span>{formatNumber(flutterwaveReport.total_provider_count)}</span>
                    </div>
                    <div className="alert-row">
                      <strong>Loaded rows</strong>
                      <span>
                        {formatNumber(flutterwaveReport.loaded_count)}
                        {flutterwaveReport.has_more ? " shown so far" : ""}
                      </span>
                    </div>
                  </div>

                  {flutterwaveWarnings.length ? (
                    <p className="support-card-note">
                      {flutterwaveWarnings.join(" ")}
                    </p>
                  ) : null}

                  <DataTable
                    columns={[
                      {
                        label: "Status",
                        render: (summary) => (
                          <Pill
                            label={summary.status || "unknown"}
                            tone={renderTone(String(summary.status || ""))}
                          />
                        ),
                      },
                      {
                        label: "Provider count",
                        render: (summary) => (
                          <Stack
                            subtitle={`${formatNumber(summary.loaded_count)} loaded`}
                            title={formatNumber(summary.provider_count)}
                          />
                        ),
                      },
                      {
                        label: "Charged value",
                        render: (summary) => (
                          <span>{formatMoneyBreakdown(summary.amounts_by_currency)}</span>
                        ),
                      },
                      {
                        label: "Settled value",
                        render: (summary) => (
                          <span>{formatMoneyBreakdown(summary.settled_by_currency)}</span>
                        ),
                      },
                    ]}
                    emptyMessage="Flutterwave returned no transaction status rows for this window."
                    isLoading={loadingSections.finance}
                    loadingMessage="Refreshing Flutterwave status report..."
                    rows={flutterwaveReport.status_summary || []}
                  />

                  <DataTable
                    columns={[
                      {
                        label: "Transaction",
                        render: (transaction) => (
                          <Stack
                            subtitle={transaction.flw_ref || "No Flutterwave ref"}
                            tertiary={transaction.tx_ref || String(transaction.transaction_id || "")}
                            title={formatMoney(
                              transaction.charged_amount || transaction.amount,
                              transaction.currency,
                            )}
                          />
                        ),
                      },
                      {
                        label: "Customer",
                        render: (transaction) => (
                          <Stack
                            subtitle={transaction.customer_email || transaction.customer_phone || "No contact"}
                            title={transaction.customer_name || "Unknown customer"}
                          />
                        ),
                      },
                      {
                        label: "Status",
                        render: (transaction) => (
                          <Pill
                            label={transaction.status || "unknown"}
                            tone={renderTone(String(transaction.status || ""))}
                          />
                        ),
                      },
                      {
                        label: "Method",
                        render: (transaction) => (
                          <Stack
                            subtitle={transaction.processor_response || "No processor note"}
                            title={transaction.payment_type || "payment"}
                          />
                        ),
                      },
                      {
                        label: "Created",
                        render: (transaction) => (
                          <span>{formatDateTime(transaction.created_at)}</span>
                        ),
                      },
                    ]}
                    emptyMessage="Flutterwave returned no transactions for this report window."
                    isLoading={loadingSections.finance}
                    loadingMessage="Refreshing Flutterwave transactions..."
                    rows={flutterwaveReport.transactions || []}
                  />
                </div>
              )}
            </Subcard>

            <Subcard eyebrow="Flutterwave" title="Local payment attempts">
              <DataTable
                columns={[
                  {
                    label: "Attempt",
                    render: (attempt) => (
                      <Stack
                        subtitle={attempt.provider_reference || "No local reference"}
                        tertiary={attempt.payment_type || "payment"}
                        title={formatMoney(attempt.amount, attempt.currency)}
                      />
                    ),
                  },
                  {
                    label: "Driver / customer",
                    render: (attempt) => (
                      <Stack
                        subtitle={
                          attempt.driver?.phone ||
                          attempt.customer?.phone ||
                          attempt.actor_user_id ||
                          "No contact"
                        }
                        title={
                          attempt.driver?.full_name ||
                          attempt.customer?.full_name ||
                          "Unknown user"
                        }
                      />
                    ),
                  },
                  {
                    label: "Status",
                    render: (attempt) => (
                      <Pill
                        label={attempt.status || "unknown"}
                        tone={renderTone(String(attempt.status || ""))}
                      />
                    ),
                  },
                  {
                    label: "Provider note",
                    render: (attempt) => (
                      <Stack
                        subtitle={attempt.provider_transaction_id || "No provider transaction"}
                        title={attempt.error_message || attempt.checkout_url || "—"}
                      />
                    ),
                  },
                  {
                    label: "Created",
                    render: (attempt) => <span>{formatDateTime(attempt.created_at)}</span>,
                  },
                ]}
                emptyMessage="No local Flutterwave payment attempts have been recorded yet."
                isLoading={loadingSections.finance}
                loadingMessage="Refreshing local payment attempts..."
                rows={finance.paymentAttempts || []}
              />
            </Subcard>

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
                isLoading={loadingSections.finance}
                loadingMessage="Refreshing customer payments..."
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
                isLoading={loadingSections.finance}
                loadingMessage="Refreshing driver wallets..."
                rows={(finance.driverWallets || []).slice(0, 12)}
              />
            </Subcard>

            <Subcard eyebrow="Payouts" title="Driver payouts">
              <DataTable
                columns={[
                  {
                    label: "Driver",
                    render: (payout) => (
                      <Stack
                        subtitle={payout.driver?.phone || "No phone"}
                        title={payout.driver?.full_name || "Unknown driver"}
                      />
                    ),
                  },
                  {
                    label: "Amount",
                    render: (payout) => (
                      <Stack
                        subtitle={payout.provider || "manual"}
                        title={formatCurrency(payout.amount)}
                      />
                    ),
                  },
                  {
                    label: "Status",
                    render: (payout) => (
                      <Pill label={payout.status || "pending"} tone={renderTone(payout.status || "")} />
                    ),
                  },
                  {
                    label: "Requested",
                    render: (payout) => (
                      <span>{formatDateTime(payout.completed_at || payout.requested_at)}</span>
                    ),
                  },
                ]}
                emptyMessage="There are no driver payouts yet."
                isLoading={loadingSections.finance}
                loadingMessage="Refreshing driver payouts..."
                rows={(finance.driverPayouts || []).slice(0, 12)}
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
                          disabled={
                            isActionPending(`commission:${String(commission.id)}:approved`) ||
                            isActionPending(`commission:${String(commission.id)}:paid`)
                          }
                          onClick={() =>
                            void handleCommissionStatus(String(commission.id), "approved")
                          }
                          type="button"
                        >
                          {isActionPending(`commission:${String(commission.id)}:approved`)
                            ? "Approving..."
                            : "Approve"}
                        </button>
                        <button
                          className="success-button"
                          disabled={
                            isActionPending(`commission:${String(commission.id)}:paid`) ||
                            isActionPending(`commission:${String(commission.id)}:approved`)
                          }
                          onClick={() =>
                            void handleCommissionStatus(String(commission.id), "paid")
                          }
                          type="button"
                        >
                          {isActionPending(`commission:${String(commission.id)}:paid`)
                            ? "Paying..."
                            : "Mark paid"}
                        </button>
                      </div>
                    ),
                  },
                ]}
                emptyMessage="There are no partner commissions yet."
                isLoading={loadingSections.finance}
                loadingMessage="Refreshing partner commissions..."
                rows={(finance.partnerCommissions || []).slice(0, 12)}
              />
            </Subcard>

            <Subcard eyebrow="Partner payouts" title="Recent partner payouts">
              <DataTable
                columns={[
                  {
                    label: "Partner",
                    render: (payout) => (
                      <Stack
                        subtitle={`${formatDate(payout.period_start)} to ${formatDate(payout.period_end)}`}
                        title={payout.partner?.name || "Unknown partner"}
                      />
                    ),
                  },
                  {
                    label: "Net payout",
                    render: (payout) => (
                      <Stack
                        subtitle={`Gross ${formatCurrency(payout.gross_commission_amount)}`}
                        title={formatCurrency(payout.net_payout_amount)}
                      />
                    ),
                  },
                  {
                    label: "Status",
                    render: (payout) => (
                      <Pill label={payout.status || "pending"} tone={renderTone(payout.status || "")} />
                    ),
                  },
                  {
                    label: "Paid",
                    render: (payout) => <span>{formatDateTime(payout.paid_at || payout.created_at)}</span>,
                  },
                ]}
                emptyMessage="There are no partner payouts yet."
                isLoading={loadingSections.finance}
                loadingMessage="Refreshing partner payouts..."
                rows={(finance.partnerPayouts || []).slice(0, 12)}
              />
            </Subcard>

            <Subcard eyebrow="Unit economics" title="Ride financials">
              <DataTable
                columns={[
                  {
                    label: "Ride",
                    render: (entry) => (
                      <Stack
                        subtitle={entry.ride?.destination_address || "No destination"}
                        tertiary={entry.ride_id}
                        title={entry.ride?.pickup_address || "Unknown pickup"}
                      />
                    ),
                  },
                  {
                    label: "Revenue",
                    render: (entry) => (
                      <Stack
                        subtitle={`Service fee ${formatCurrency(entry.service_fee_amount)}`}
                        title={formatCurrency(entry.customer_total_amount)}
                      />
                    ),
                  },
                  {
                    label: "Driver payout",
                    render: (entry) => (
                      <Stack
                        subtitle={`Gross ${formatCurrency(entry.driver_gross_amount)}`}
                        title={formatCurrency(entry.driver_net_payout_amount)}
                      />
                    ),
                  },
                  {
                    label: "Drop margin",
                    render: (entry) => (
                      <Pill
                        label={formatCurrency(entry.drop_net_margin_amount)}
                        tone={Number(entry.drop_net_margin_amount || 0) >= 0 ? "success" : "danger"}
                      />
                    ),
                  },
                ]}
                emptyMessage="There are no ride financial rows yet."
                isLoading={loadingSections.finance}
                loadingMessage="Refreshing ride financials..."
                rows={(finance.rideFinancials || []).slice(0, 12)}
              />
            </Subcard>
          </div>
        </>
      )}
    </PanelShell>
    );
  };

  const renderPartnersSection = () => (
    <PanelShell descriptor={sectionDescriptors.partners} lastRefresh={lastRefresh.partners}>
      {sectionErrors.partners ? (
        <ErrorState message={sectionErrors.partners} title="Partners unavailable" />
      ) : (
        <>
          <div className="subgrid">
            <form
              className="subcard"
              onSubmit={(event) => {
                event.preventDefault();
              }}
            >
              <div className="subcard-header">
                <div>
                  <span>Search</span>
                  <h4>Partner list</h4>
                </div>
                <Pill label="Auto applies" tone="success" />
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
                <button
                  className="primary-button"
                  disabled={isActionPending("create-partner")}
                  type="submit"
                >
                  {isActionPending("create-partner") ? "Creating..." : "Create partner"}
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
                  Contact name
                  <input name="contact_name" />
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

          {loadingSections.partners && !partners.length ? (
            <LoadingCard message="Refreshing partners..." />
          ) : (
            <Subcard eyebrow="Attribution + payouts" title="Partner marketplace">
              <DataTable
                columns={[
                  {
                    label: "Partner",
                    render: (partner) => <PartnerIdentity partner={partner} />,
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
                    label: "Access",
                    render: (partner) => (
                      <div className="stack">
                        <Pill
                          label={
                            partner.access_account?.username
                              ? `Portal active: ${partner.access_account.username}`
                              : "Portal not enabled"
                          }
                          tone={partner.access_account?.username ? "success" : "warning"}
                        />
                        <span className="muted">
                          {partner.access_account?.last_login_at
                            ? `Last login ${formatDateTime(partner.access_account.last_login_at)}`
                            : "Create access from Access control"}
                        </span>
                      </div>
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
                      <Pill label={partner.status} tone={renderTone(partner.status || "")} />
                    ),
                  },
                  {
                    label: "Actions",
                    render: (partner) => (
                      <div className="inline-actions">
                        <button
                          className="ghost-button"
                          disabled={isActionPending(`partner-status:${String(partner.id)}`)}
                          onClick={() =>
                            void handlePartnerStatus(
                              String(partner.id),
                              partner.status === "active" ? "paused" : "active",
                            )
                          }
                          type="button"
                        >
                          {isActionPending(`partner-status:${String(partner.id)}`)
                            ? "Updating..."
                            : partner.status === "active"
                              ? "Pause"
                              : "Activate"}
                        </button>
                      </div>
                    ),
                  },
                ]}
                emptyMessage="No partners match the current search."
                isLoading={loadingSections.partners}
                loadingMessage="Refreshing partners..."
                rows={partners}
              />
            </Subcard>
          )}
        </>
      )}
    </PanelShell>
  );

  const renderSupportSection = () => (
    <PanelShell
      actions={
        canBroadcastNotifications ? (
        <button
          className="primary-button"
          onClick={() => setSupportComposer("broadcast")}
          type="button"
        >
          Send push notification
        </button>
        ) : undefined
      }
      descriptor={sectionDescriptors.support}
      lastRefresh={lastRefresh.support}
    >
      {sectionErrors.support ? (
        <ErrorState message={sectionErrors.support} title="Support unavailable" />
      ) : loadingSections.support && !support ? (
        <LoadingCard message="Refreshing support..." />
      ) : !support ? (
        <EmptyState message="Support data has not loaded yet." title="No data" />
      ) : (
        <>
          <div className="metric-grid">
            <MetricCard
              label="Open reports"
              note="Issues still needing an operator"
              value={formatNumber(support.counts?.openReports)}
            />
            <MetricCard
              label="Live threads"
              note="Threads that already have conversation activity"
              value={formatNumber(supportConversationThreads.length)}
            />
            <MetricCard
              label="New messages"
              note="Unread since the last support review"
              value={formatNumber(support.counts?.unreadMessages || supportNavUnreadCount)}
            />
            <MetricCard
              label="Low ratings"
              note="Reviews at 3 stars or below"
              value={formatNumber(support.counts?.lowRatingReviews)}
            />
          </div>

          <div className="support-ops-grid">
            <Subcard eyebrow="Issue queue" title="Reports waiting on action">
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
                    label: "People",
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
                      <Pill label={report.status || "pending"} tone={renderTone(report.status || "")} />
                    ),
                  },
                  {
                    label: "Actions",
                    render: (report) => (
                      <div className="inline-actions">
                        <button
                          className="ghost-button"
                          disabled={
                            isActionPending(`report:${String(report.id)}:under_review`) ||
                            isActionPending(`report:${String(report.id)}:resolved`)
                          }
                          onClick={() =>
                            void handleReportStatus(String(report.id), "under_review")
                          }
                          type="button"
                        >
                          {isActionPending(`report:${String(report.id)}:under_review`)
                            ? "Updating..."
                            : "Under review"}
                        </button>
                        <button
                          className="success-button"
                          disabled={
                            isActionPending(`report:${String(report.id)}:resolved`) ||
                            isActionPending(`report:${String(report.id)}:under_review`)
                          }
                          onClick={() => void handleReportStatus(String(report.id), "resolved")}
                          type="button"
                        >
                          {isActionPending(`report:${String(report.id)}:resolved`)
                            ? "Resolving..."
                            : "Resolve"}
                        </button>
                      </div>
                    ),
                  },
                ]}
                emptyMessage="There are no support reports right now."
                isLoading={loadingSections.support}
                loadingMessage="Refreshing reports..."
                rows={support.reports || []}
              />
            </Subcard>

            <Subcard eyebrow="Service quality" title="Low-rating reviews">
              <DataTable
                columns={[
                  {
                    label: "Review",
                    render: (review) => (
                      <Stack
                        subtitle={review.comment || "No written feedback"}
                        tertiary={String(review.id)}
                        title={`${String(review.rating || "—")} star review`}
                      />
                    ),
                  },
                  {
                    label: "Context",
                    render: (review) => (
                      <Stack
                        subtitle={review.ride?.destination_address || "No destination"}
                        title={review.ride?.pickup_address || "Unknown route"}
                      />
                    ),
                  },
                  {
                    label: "Reviewer",
                    render: (review) => (
                      <Stack
                        subtitle={`Target: ${review.target?.full_name || "Unknown user"}`}
                        title={review.reviewer?.full_name || "Unknown reviewer"}
                      />
                    ),
                  },
                ]}
                emptyMessage="No low-rating reviews need attention right now."
                isLoading={loadingSections.support}
                loadingMessage="Refreshing reviews..."
                rows={(support.reviews || []).filter((review: AnyRecord) => Number(review.rating || 0) <= 3)}
              />
            </Subcard>
          </div>

          <div className="support-desk">
            <Subcard eyebrow="Inbox" title={`Conversation inbox (${formatNumber(supportConversationThreads.length)})`}>
              <div className="toolbar support-search-toolbar">
                <label>
                  Search inbox
                  <input
                    onChange={(event) =>
                      setFilters((current) => ({
                        ...current,
                        supportSearch: event.target.value,
                      }))
                    }
                    placeholder="Ride, customer, driver, report, message"
                    value={filters.supportSearch}
                  />
                </label>
                <div className="support-helper-card">
                  <Pill
                    label={loadingSections.support ? "Refreshing..." : "Conversation only"}
                    tone={loadingSections.support ? "warning" : "success"}
                  />
                  <p>
                    Only rides with actual conversation activity appear here.
                    {canBroadcastNotifications
                      ? " Use the Broadcast button to reach wider audiences without leaving the desk."
                      : " Leadership accounts can still send broader push broadcasts when needed."}
                  </p>
                </div>
              </div>

              <div className="support-thread-list">
                {loadingSections.support && !supportConversationThreads.length ? (
                  <LoadingCard message="Refreshing inbox..." />
                ) : supportConversationThreads.length ? (
                  supportConversationThreads.map((thread: AnyRecord) => {
                    const rideId = String(thread.ride_id);
                    const unreadCount = Number(
                      supportUnreadByRide[rideId] || thread.unread_messages || 0,
                    );
                    const isSelected = selectedSupportThread?.ride_id === thread.ride_id;
                    const latestTranscriptEntry =
                      thread.transcript?.[Math.max(Number(thread.transcript?.length || 1) - 1, 0)] || null;

                    return (
                      <button
                        className={`support-thread-card ${isSelected ? "active" : ""}`}
                        key={rideId}
                        onClick={() => setSelectedSupportRideId(rideId)}
                        type="button"
                      >
                        <div className="support-thread-head">
                          <strong>
                            {(thread.customer?.full_name || "Customer") +
                              " / " +
                              (thread.driver?.full_name || "Driver")}
                          </strong>
                          {unreadCount > 0 ? (
                            <span className="thread-unread-badge">{unreadCount}</span>
                          ) : (
                            <span className="thread-time">{formatDateTime(thread.last_activity_at)}</span>
                          )}
                        </div>
                        <div className="support-thread-route">
                          <span>{thread.ride?.pickup_address || "Unknown pickup"}</span>
                          <span>{thread.ride?.destination_address || "Unknown dropoff"}</span>
                        </div>
                        <div className="tag-set">
                          <Pill
                            label={thread.hasOpenReport ? "Open report" : "Conversation"}
                            tone={thread.hasOpenReport ? "warning" : "success"}
                          />
                          <Pill
                            label={thread.ride?.status || "unknown"}
                            tone={renderTone(thread.ride?.status || "")}
                          />
                        </div>
                        <p className="thread-preview">
                          {latestTranscriptEntry?.body ||
                            latestTranscriptEntry?.content ||
                            "No conversation preview yet"}
                        </p>
                      </button>
                    );
                  })
                ) : (
                  <EmptyState
                    message="No support conversations match the current filter."
                    title="Inbox is clear"
                  />
                )}
              </div>
            </Subcard>

            <div className="support-thread-workspace">
              <Subcard
                actions={
                  <button
                    className="primary-button"
                    disabled={!selectedSupportThread?.ride_id}
                    onClick={() => setSupportComposer("reply")}
                    type="button"
                  >
                    {selectedSupportThread?.ride_id ? "Send response" : "Select a thread"}
                  </button>
                }
                eyebrow="Selected thread"
                title={
                  selectedSupportThread?.ride_id
                    ? `Ride ${selectedSupportThread.ride_id}`
                    : "Choose a conversation"
                }
              >
                {!selectedSupportThread ? (
                  <EmptyState
                    message="Choose a conversation from the inbox to inspect the transcript, reports, and context."
                    title="No conversation selected"
                  />
                ) : (
                  <>
                    <div className="support-thread-summary">
                      <div className="support-summary-card">
                        <span>Customer</span>
                        <strong>{selectedSupportThread.customer?.full_name || "Unknown customer"}</strong>
                        <small>{selectedSupportThread.customer?.phone || "No phone"}</small>
                      </div>
                      <div className="support-summary-card">
                        <span>Driver</span>
                        <strong>{selectedSupportThread.driver?.full_name || "Unknown driver"}</strong>
                        <small>{selectedSupportThread.driver?.phone || "No phone"}</small>
                      </div>
                      <div className="support-summary-card">
                        <span>Ride route</span>
                        <strong>{selectedSupportThread.ride?.pickup_address || "Unknown pickup"}</strong>
                        <small>{selectedSupportThread.ride?.destination_address || "Unknown dropoff"}</small>
                      </div>
                    </div>

                    <div className="tag-set">
                      <Pill
                        label={selectedSupportThread.ride?.status || "unknown"}
                        tone={renderTone(selectedSupportThread.ride?.status || "")}
                      />
                      <Pill
                        label={
                          selectedSupportThread.hasOpenReport
                            ? `${String(selectedSupportThread.reports?.length || 0)} open reports`
                            : "No open report"
                        }
                        tone={selectedSupportThread.hasOpenReport ? "warning" : "success"}
                      />
                      <Pill
                        label={`${String(selectedSupportThread.transcript?.length || 0)} timeline entries`}
                        tone="neutral"
                      />
                    </div>

                    {supportTypingLabel ? (
                      <div className="typing-banner">{supportTypingLabel}</div>
                    ) : null}

                    <div className="support-transcript">
                      {(selectedSupportThread.transcript || []).length ? (
                        (selectedSupportThread.transcript || []).map((entry: AnyRecord, index: number) => (
                          <div
                            className={`support-entry ${
                              entry.entry_type === "response"
                                ? "agent"
                                : entry.sender?.role === "driver"
                                  ? "driver"
                                  : "customer"
                            }`}
                            key={`${entry.entry_type}-${String(entry.id || index)}`}
                          >
                            <div className="support-entry-head">
                              <strong>
                                {entry.entry_type === "response"
                                  ? entry.created_by_username || "Drop support"
                                  : entry.sender?.full_name || "Participant"}
                              </strong>
                              <span>{formatDateTime(entry.created_at)}</span>
                            </div>
                            <p>{entry.body || entry.content || "[image message]"}</p>
                            {entry.image_url ? (
                              <a
                                className="support-image-link"
                                href={entry.image_url}
                                rel="noreferrer"
                                target="_blank"
                              >
                                View image attachment
                              </a>
                            ) : null}
                          </div>
                        ))
                      ) : (
                        <EmptyState
                          message="There are no conversation entries on this ride yet."
                          title="No transcript"
                        />
                      )}
                    </div>
                  </>
                )}
              </Subcard>
            </div>
          </div>
        </>
      )}
    </PanelShell>
  );

  const renderAccessSection = () => (
    <PanelShell descriptor={sectionDescriptors.access} lastRefresh={lastRefresh.access}>
      {loadingSections.access && !access ? (
        <LoadingCard message="Loading access controls..." />
      ) : sectionErrors.access ? (
        <ErrorState message={sectionErrors.access} title="Access controls unavailable" />
      ) : !access ? (
        <EmptyState message="Access controls have not loaded yet." title="No data" />
      ) : (
        <>
          <div className="metric-grid">
            <MetricCard
              label="Total accounts"
              note="Every portal user in Drop"
              value={formatNumber(access.totals?.totalAccounts)}
            />
            <MetricCard
              label="Super admins"
              note="Highest-privilege operators"
              value={formatNumber(access.totals?.superAdminAccounts)}
            />
            <MetricCard
              label="Admins"
              note="Leadership operators"
              value={formatNumber(access.totals?.adminAccounts)}
            />
            <MetricCard
              label="Staff"
              note="Operations-only accounts"
              value={formatNumber(access.totals?.staffAccounts)}
            />
            <MetricCard
              label="Partner accounts"
              note="Partners with portal access"
              value={formatNumber(access.totals?.partnerAccounts)}
            />
            <MetricCard
              label="Total partners"
              note="Available to enable for portal access"
              value={formatNumber(access.totals?.totalPartners)}
            />
          </div>

          <div className="settings-grid">
            <PasswordResetCard
              heading="Change your own password"
              isDisabled={isActionPending("reset-own-password")}
              onSubmit={submitResetPassword}
              submitLabel={
                isActionPending("reset-own-password") ? "Updating..." : "Update password"
              }
            />

            {canManageLeadershipAccounts ? (
              <form className="subcard" onSubmit={(event) => void submitCreateAdmin(event)}>
                <div className="subcard-header">
                  <div>
                    <span>Leadership</span>
                    <h4>Create a leadership account</h4>
                  </div>
                  <button
                    className="primary-button"
                    disabled={isActionPending("create-admin")}
                    type="submit"
                  >
                    {isActionPending("create-admin") ? "Creating..." : "Create account"}
                  </button>
                </div>
                <div className="form-grid">
                  <label>
                    Level
                    <select
                      name="role"
                      onChange={(event) =>
                        setLeadershipRole(event.target.value as "admin" | "super_admin")
                      }
                      value={leadershipRole}
                    >
                      <option value="admin">Admin</option>
                      <option value="super_admin">Super admin</option>
                    </select>
                  </label>
                  <label>
                    Display name
                    <input name="displayName" placeholder="Operations lead" />
                  </label>
                  <label>
                    Username
                    <input autoCapitalize="none" autoCorrect="off" name="username" required />
                  </label>
                  <label>
                    Temporary password
                    <input minLength={12} name="password" required type="password" />
                  </label>
                </div>
              </form>
            ) : null}

            {canManageStaffAccounts ? (
              <form className="subcard" onSubmit={(event) => void submitCreateStaff(event)}>
                <div className="subcard-header">
                  <div>
                    <span>Staff</span>
                    <h4>Add operations staff</h4>
                  </div>
                  <button
                    className="primary-button"
                    disabled={isActionPending("create-staff")}
                    type="submit"
                  >
                    {isActionPending("create-staff") ? "Adding..." : "Add staff"}
                  </button>
                </div>
                <div className="form-grid">
                  <label>
                    Role title
                    <select
                      name="rolePreset"
                      onChange={(event) => setStaffRolePreset(event.target.value)}
                      value={staffRolePreset}
                    >
                      {staffRolePresetOptions.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  {staffRolePreset === "custom" ? (
                    <label>
                      Custom title
                      <input name="customRoleTitle" placeholder="Customer Rep" required />
                    </label>
                  ) : null}
                  <label>
                    Display name
                    <input name="displayName" placeholder="Support desk" />
                  </label>
                  <label>
                    Username
                    <input autoCapitalize="none" autoCorrect="off" name="username" required />
                  </label>
                  <label>
                    Temporary password
                    <input minLength={12} name="password" required type="password" />
                  </label>
                </div>
              </form>
            ) : null}

            <form className="subcard" onSubmit={(event) => void submitCreatePartnerAccess(event)}>
              <div className="subcard-header">
                <div>
                  <span>Partners</span>
                  <h4>Grant partner portal access</h4>
                </div>
                <button
                  className="primary-button"
                  disabled={isActionPending("create-partner-access")}
                  type="submit"
                >
                  {isActionPending("create-partner-access") ? "Enabling..." : "Enable partner"}
                </button>
              </div>
              <div className="support-helper-card access-helper-card">
                <p>
                  Partner choices in this dropdown come from the Partners page. Create a partner first,
                  and new ones appear here automatically.
                </p>
                <button
                  className="ghost-button"
                  onClick={() => handleSectionSelect("partners")}
                  type="button"
                >
                  Open partner management
                </button>
              </div>
              <div className="form-grid">
                <label>
                  Partner
                  <select defaultValue="" name="partnerId" required>
                    <option disabled value="">
                      Select a partner
                    </option>
                    {(access.partnerOptions || []).map((partner: AnyRecord) => (
                      <option key={partner.id} value={partner.id}>
                        {partner.name} ({partner.slug})
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Display name
                  <input name="displayName" placeholder="Partner team lead" />
                </label>
                <label>
                  Username
                  <input autoCapitalize="none" autoCorrect="off" name="username" required />
                </label>
                <label>
                  Temporary password
                  <input minLength={12} name="password" required type="password" />
                </label>
              </div>
            </form>

            <div className="subcard">
              <div className="subcard-header">
                <div>
                  <span>Visibility</span>
                  <h4>Role-based privacy</h4>
                </div>
                <Pill label={currentRoleLabel} tone="success" />
              </div>
              <div className="detail-list-stack">
                <p className="detail-note">
                  Staff accounts can work operations, rides, customers, drivers, scheduled trips,
                  and support, but they do not receive driver government IDs, payout details,
                  wallet balances, or internal margin data.
                </p>
                <p className="detail-note">
                  Leadership accounts keep full visibility and can add or remove staff. Only super
                  admins can create new leadership accounts.
                </p>
              </div>
            </div>
          </div>

          <Subcard eyebrow="Directory" title="Account inventory">
            <DataTable
              columns={[
                {
                  label: "Account",
                  render: (accountRow) => (
                    <Stack
                      subtitle={accountRow.display_name || "No display name"}
                      tertiary={`Created ${formatDateTime(accountRow.created_at)}`}
                      title={accountRow.username}
                    />
                  ),
                },
                {
                  label: "Role",
                  render: (accountRow) => (
                    <div className="stack">
                      <div className="tag-set">
                        <Pill
                          label={getRoleLabel(accountRow.role, accountRow.role_title)}
                          tone={renderTone(accountRow.role || "")}
                        />
                        <Pill
                          label={accountRow.is_active === false ? "Inactive" : "Active"}
                          tone={accountRow.is_active === false ? "danger" : "success"}
                        />
                      </div>
                      <span className="muted">
                        System role: {String(accountRow.role || "unknown").replaceAll("_", " ")}
                      </span>
                    </div>
                  ),
                },
                {
                  label: "Scope",
                  render: (accountRow) => (
                    <Stack
                      subtitle={
                        accountRow.partner?.slug
                          ? `Partner slug: ${accountRow.partner.slug}`
                          : "Global access"
                      }
                      title={accountRow.partner?.name || "Drop team"}
                    />
                  ),
                },
                {
                  label: "Security",
                  render: (accountRow) => (
                    <Stack
                      subtitle={`Password updated ${formatDateTime(accountRow.password_updated_at)}`}
                      title={`Last login ${formatDateTime(accountRow.last_login_at)}`}
                    />
                  ),
                },
                {
                  label: "Actions",
                  render: (accountRow) => (
                    <div className="inline-actions">
                      {canResetManagedAccountPassword(accountRow) ? (
                        <button
                          className="ghost-button"
                          disabled={isActionPending(`account-reset:${String(accountRow.id)}`)}
                          onClick={() =>
                            void handleAccountPasswordReset(
                              String(accountRow.id),
                              String(accountRow.username || "account"),
                            )
                          }
                          type="button"
                        >
                          {isActionPending(`account-reset:${String(accountRow.id)}`)
                            ? "Resetting..."
                            : "Set temporary password"}
                        </button>
                      ) : null}
                      {canToggleManagedAccount(accountRow) ? (
                        <button
                          className={accountRow.is_active === false ? "success-button" : "danger-button"}
                          disabled={isActionPending(`account-status:${String(accountRow.id)}`)}
                          onClick={() =>
                            void handleAccountStatusToggle(
                              String(accountRow.id),
                              accountRow.is_active !== false,
                              String(accountRow.display_name || accountRow.username || "staff account"),
                            )
                          }
                          type="button"
                        >
                          {isActionPending(`account-status:${String(accountRow.id)}`)
                            ? "Saving..."
                            : accountRow.is_active === false
                              ? "Reactivate staff"
                              : "Deactivate staff"}
                        </button>
                      ) : null}
                      {!canResetManagedAccountPassword(accountRow) &&
                      !canToggleManagedAccount(accountRow) ? (
                        <span className="muted">Protected account</span>
                      ) : null}
                    </div>
                  ),
                },
                ]}
                emptyMessage="No dashboard accounts exist yet."
                isLoading={loadingSections.access}
                loadingMessage="Refreshing access inventory..."
                rows={access.accounts || []}
              />
          </Subcard>
        </>
      )}
    </PanelShell>
  );

  const renderSettingsSection = () => {
    const driverMonthlyFee = getAppConfigValue("driver_monthly_fee");
    const hybridConfig = getAppConfigValue("hybrid_finance_settings");
    const tripBillingConfig = getAppConfigValue("trip_billing_settings");
    const airportConfig = getAppConfigValue("airport_trip_settings");
    const airportZones = Array.isArray(airportConfig.zones) ? airportConfig.zones : [];

    return (
      <PanelShell descriptor={sectionDescriptors.settings} lastRefresh={lastRefresh.settings}>
        {loadingSections.settings && !settings ? (
          <LoadingCard message="Loading settings..." />
        ) : sectionErrors.settings ? (
          <ErrorState message={sectionErrors.settings} title="Settings unavailable" />
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
                  <button
                    className="primary-button"
                    disabled={isActionPending("dispatch-settings")}
                    type="submit"
                  >
                    {isActionPending("dispatch-settings")
                      ? "Saving..."
                      : "Save dispatch settings"}
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
                  <button
                    className="primary-button"
                    disabled={isActionPending("config-driver-fee")}
                    type="submit"
                  >
                    {isActionPending("config-driver-fee") ? "Saving..." : "Save fee"}
                  </button>
                </div>
                <div className="form-grid">
                  <label>
                    Amount
                    <input
                      defaultValue={String(driverMonthlyFee.amount || 0)}
                      min="0"
                      name="amount"
                      type="number"
                    />
                  </label>
                  <label>
                    Currency
                    <input defaultValue={driverMonthlyFee.currency || "NGN"} name="currency" />
                  </label>
                  <label>
                    Provider fee %
                    <input
                      defaultValue={String(driverMonthlyFee.payment_provider_fee_percent || 1.5)}
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
                  <button
                    className="primary-button"
                    disabled={isActionPending("config-hybrid-finance")}
                    type="submit"
                  >
                    {isActionPending("config-hybrid-finance")
                      ? "Saving..."
                      : "Save hybrid finance"}
                  </button>
                </div>
                <div className="form-grid">
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
                      defaultValue={JSON.stringify(hybridConfig.service_fee_bands || [], null, 2)}
                      name="service_fee_bands"
                    />
                  </label>
                </div>
              </form>

              <form className="subcard" onSubmit={(event) => void submitTripBillingConfig(event)}>
                <div className="subcard-header">
                  <div>
                    <span>Pricing rules</span>
                    <h4>Wait-time billing</h4>
                  </div>
                  <button
                    className="primary-button"
                    disabled={isActionPending("config-trip-billing")}
                    type="submit"
                  >
                    {isActionPending("config-trip-billing")
                      ? "Saving..."
                      : "Save wait-time rules"}
                  </button>
                </div>
                <div className="form-grid">
                  <label>
                    Customer timer shown (mins)
                    <input
                      defaultValue={String(
                        tripBillingConfig.customer_visible_wait_timer_minutes ?? 7,
                      )}
                      min="1"
                      name="customer_visible_wait_timer_minutes"
                      type="number"
                    />
                  </label>
                  <label>
                    Ride pickup grace (mins)
                    <input
                      defaultValue={String(
                        tripBillingConfig.pickup_wait_grace_minutes ?? 10,
                      )}
                      min="0"
                      name="pickup_wait_grace_minutes"
                      type="number"
                    />
                  </label>
                  <label>
                    Delivery code grace (mins)
                    <input
                      defaultValue={String(
                        tripBillingConfig.delivery_wait_charge_grace_minutes ?? 10,
                      )}
                      min="0"
                      name="delivery_wait_charge_grace_minutes"
                      type="number"
                    />
                  </label>
                  <label>
                    Wait fee interval (mins)
                    <input
                      defaultValue={String(
                        tripBillingConfig.wait_fee_interval_minutes ?? 5,
                      )}
                      min="1"
                      name="wait_fee_interval_minutes"
                      type="number"
                    />
                  </label>
                  <label>
                    Wait fee amount
                    <input
                      defaultValue={String(tripBillingConfig.wait_fee_amount ?? 10)}
                      min="0"
                      name="wait_fee_amount"
                      type="number"
                    />
                  </label>
                  <label>
                    Delivery wait interval (mins)
                    <input
                      defaultValue={String(
                        tripBillingConfig.delivery_wait_fee_interval_minutes ??
                          tripBillingConfig.wait_fee_interval_minutes ??
                          5,
                      )}
                      min="1"
                      name="delivery_wait_fee_interval_minutes"
                      type="number"
                    />
                  </label>
                  <label>
                    Delivery wait fee amount
                    <input
                      defaultValue={String(
                        tripBillingConfig.delivery_wait_fee_amount ??
                          tripBillingConfig.wait_fee_amount ??
                          10,
                      )}
                      min="0"
                      name="delivery_wait_fee_amount"
                      type="number"
                    />
                  </label>
                  <label>
                    Charge only when customer is not ready
                    <select
                      defaultValue={String(
                        tripBillingConfig.charge_only_when_customer_not_ready ?? true,
                      )}
                      name="charge_only_when_customer_not_ready"
                    >
                      <option value="true">true</option>
                      <option value="false">false</option>
                    </select>
                  </label>
                  <label>
                    Charge for traffic
                    <select
                      defaultValue={String(tripBillingConfig.charge_for_traffic ?? false)}
                      name="charge_for_traffic"
                    >
                      <option value="false">false</option>
                      <option value="true">true</option>
                    </select>
                  </label>
                  <label>
                    Charge for driver delay
                    <select
                      defaultValue={String(
                        tripBillingConfig.charge_for_driver_delay ?? false,
                      )}
                      name="charge_for_driver_delay"
                    >
                      <option value="false">false</option>
                      <option value="true">true</option>
                    </select>
                  </label>
                  <label>
                    Charge for route delay
                    <select
                      defaultValue={String(
                        tripBillingConfig.charge_for_route_delay ?? false,
                      )}
                      name="charge_for_route_delay"
                    >
                      <option value="false">false</option>
                      <option value="true">true</option>
                    </select>
                  </label>
                  <label>
                    Allow price reduction
                    <select
                      defaultValue={String(
                        tripBillingConfig.allow_price_reduction ?? false,
                      )}
                      name="allow_price_reduction"
                    >
                      <option value="false">false</option>
                      <option value="true">true</option>
                    </select>
                  </label>
                </div>
              </form>

              <form className="subcard" onSubmit={(event) => void submitAirportConfig(event)}>
                <div className="subcard-header">
                  <div>
                    <span>Airport reservations</span>
                    <h4>Airport trip pricing</h4>
                  </div>
                  <button
                    className="primary-button"
                    disabled={isActionPending("config-airport-pricing")}
                    type="submit"
                  >
                    {isActionPending("config-airport-pricing")
                      ? "Saving..."
                      : "Save airport pricing"}
                  </button>
                </div>
                <div className="form-grid">
                  <label>
                    Airport pricing enabled
                    <select
                      defaultValue={String(airportConfig.enabled ?? true)}
                      name="enabled"
                    >
                      <option value="true">true</option>
                      <option value="false">false</option>
                    </select>
                  </label>
                  <label>
                    Reservation enabled
                    <select
                      defaultValue={String(airportConfig.reservation_enabled ?? true)}
                      name="reservation_enabled"
                    >
                      <option value="true">true</option>
                      <option value="false">false</option>
                    </select>
                  </label>
                  <label>
                    Enforce in-app price only
                    <select
                      defaultValue={String(
                        airportConfig.enforce_in_app_price_only ?? true,
                      )}
                      name="enforce_in_app_price_only"
                    >
                      <option value="true">true</option>
                      <option value="false">false</option>
                    </select>
                  </label>
                  <label>
                    Default pickup access fee
                    <input
                      defaultValue={String(
                        airportConfig.default_pickup_access_fee_amount ?? 0,
                      )}
                      min="0"
                      name="default_pickup_access_fee_amount"
                      type="number"
                    />
                  </label>
                  <label>
                    Default pickup convenience fee
                    <input
                      defaultValue={String(
                        airportConfig.default_pickup_convenience_fee_amount ?? 0,
                      )}
                      min="0"
                      name="default_pickup_convenience_fee_amount"
                      type="number"
                    />
                  </label>
                  <label>
                    Default dropoff fee
                    <input
                      defaultValue={String(
                        airportConfig.default_dropoff_fee_amount ?? 0,
                      )}
                      min="0"
                      name="default_dropoff_fee_amount"
                      type="number"
                    />
                  </label>
                  <label>
                    Default reservation fee
                    <input
                      defaultValue={String(
                        airportConfig.default_reservation_fee_amount ?? 1200,
                      )}
                      min="0"
                      name="default_reservation_fee_amount"
                      type="number"
                    />
                  </label>
                  <label>
                    Reservation dispatch lead (mins)
                    <input
                      defaultValue={String(
                        airportConfig.default_reservation_dispatch_lead_minutes ?? 45,
                      )}
                      min="5"
                      name="default_reservation_dispatch_lead_minutes"
                      type="number"
                    />
                  </label>
                  <label>
                    Reservation included wait (mins)
                    <input
                      defaultValue={String(
                        airportConfig.default_reservation_included_wait_minutes ?? 30,
                      )}
                      min="0"
                      name="default_reservation_included_wait_minutes"
                      type="number"
                    />
                  </label>
                  <label>
                    Reservation minimum lead (mins)
                    <input
                      defaultValue={String(
                        airportConfig.default_reservation_min_lead_minutes ?? 30,
                      )}
                      min="5"
                      name="default_reservation_min_lead_minutes"
                      type="number"
                    />
                  </label>
                  <label>
                    Airport policy copy
                    <textarea
                      defaultValue={String(airportConfig.policy_copy || "")}
                      name="policy_copy"
                    />
                  </label>
                  <label>
                    Reservation copy
                    <textarea
                      defaultValue={String(airportConfig.reservation_copy || "")}
                      name="reservation_copy"
                    />
                  </label>
                  <label>
                    Airport zones JSON
                    <textarea
                      defaultValue={JSON.stringify(airportZones, null, 2)}
                      name="zones"
                    />
                  </label>
                </div>
                {airportZones.length ? (
                  <div className="details-grid">
                    {airportZones.map((zone: AnyRecord) => (
                      <MetricCard
                        key={String(zone.code || zone.name || zone.city || "airport-zone")}
                        label={String(zone.city || zone.code || "Airport")}
                        value={`${formatCurrency(
                          Number(zone.pickup_access_fee_amount || 0) +
                            Number(zone.pickup_convenience_fee_amount || 0),
                        )} pickup`}
                        note={`Reserve +${formatCurrency(
                          Number(zone.reservation_fee_amount || 0),
                        )} | Lead ${String(zone.reservation_dispatch_lead_minutes || 0)} mins | Wait ${String(zone.reservation_included_wait_minutes || 0)} mins`}
                      />
                    ))}
                  </div>
                ) : null}
              </form>
            </div>

            <div className="settings-grid">
              <form className="subcard" onSubmit={(event) => void submitServiceTypeCreate(event)}>
                <div className="subcard-header">
                  <div>
                    <span>Create</span>
                    <h4>Add service type</h4>
                  </div>
                  <button
                    className="primary-button"
                    disabled={isActionPending("create-service-type")}
                    type="submit"
                  >
                    {isActionPending("create-service-type") ? "Creating..." : "Create service"}
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
                  <button
                    className="primary-button"
                    disabled={isActionPending("create-cancel-reason")}
                    type="submit"
                  >
                    {isActionPending("create-cancel-reason") ? "Creating..." : "Create reason"}
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
                      <button
                        className="ghost-button"
                        disabled={isActionPending(`update-service-type:${String(service.id)}`)}
                        type="submit"
                      >
                        {isActionPending(`update-service-type:${String(service.id)}`)
                          ? "Saving..."
                          : "Save"}
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
                      <button
                        className="ghost-button"
                        disabled={isActionPending(`update-cancel-reason:${String(reason.id)}`)}
                        type="submit"
                      >
                        {isActionPending(`update-cancel-reason:${String(reason.id)}`)
                          ? "Saving..."
                          : "Save"}
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
      </PanelShell>
    );
  };

  const renderWorkspaceSection = () => (
    <PanelShell descriptor={sectionDescriptors.workspace} lastRefresh={lastRefresh.workspace}>
      {loadingSections.workspace && !workspace ? (
        <LoadingCard message="Loading partner workspace..." />
      ) : sectionErrors.workspace ? (
        <ErrorState message={sectionErrors.workspace} title="Workspace unavailable" />
      ) : !workspace ? (
        <EmptyState message="The partner workspace has not loaded yet." title="No data" />
      ) : (
        <>
          <div className="metric-grid">
            <MetricCard
              label="Customer links"
              note="Attributed customers in your network"
              value={formatNumber(workspace.counts?.customerLinks)}
            />
            <MetricCard
              label="Tracked rides"
              note={`${formatNumber(workspace.counts?.activeRides)} active right now`}
              value={formatNumber(workspace.counts?.totalRides)}
            />
            <MetricCard
              label="Commission due"
              note="Pending partner commission"
              value={formatCurrency(workspace.counts?.commissionDueAmount)}
            />
            <MetricCard
              label="Active referral codes"
              note="Codes still driving attribution"
              value={formatNumber(workspace.counts?.activeReferralCodes)}
            />
          </div>

          <div className="subgrid">
            <Subcard eyebrow="Partner profile" title={workspace.partner?.name || "Partner"}>
              <div className="alert-list">
                <div className="alert-row">
                  <strong>Status</strong>
                  <Pill
                    label={workspace.partner?.status || "unknown"}
                    tone={renderTone(workspace.partner?.status || "")}
                  />
                </div>
                <div className="alert-row">
                  <strong>Portal username</strong>
                  <span>{workspace.account?.username || session?.username || "—"}</span>
                </div>
                <div className="alert-row">
                  <strong>Contact</strong>
                  <span>
                    {workspace.partner?.contact_email ||
                      workspace.partner?.contact_phone ||
                      "No contact details"}
                  </span>
                </div>
                <div className="alert-row">
                  <strong>Payout schedule</strong>
                  <span>{workspace.partner?.payout_schedule || "manual"}</span>
                </div>
              </div>
            </Subcard>

            <form className="subcard" onSubmit={(event) => void submitWorkspaceBranding(event)}>
              <div className="subcard-header">
                <div>
                  <span>Branding</span>
                  <h4>Your workspace logo</h4>
                </div>
                <button
                  className="primary-button"
                  disabled={isActionPending("workspace-branding")}
                  type="submit"
                >
                  {isActionPending("workspace-branding") ? "Saving..." : "Save logo"}
                </button>
              </div>
              <div className="form-grid">
                <label className="support-full-span">
                  Upload logo
                  <input accept="image/*" name="logo_file" type="file" />
                </label>
                <label className="support-full-span">
                  Or use an image URL
                  <input
                    defaultValue={workspacePartnerLogoOverride}
                    name="logo_url"
                    placeholder="https://... or /your-logo.png"
                  />
                </label>
                <label>
                  Reset to default
                  <select defaultValue="false" name="clear_logo">
                    <option value="false">Keep custom logo</option>
                    <option value="true">Use default Drop logo</option>
                  </select>
                </label>
              </div>
              <p className="support-card-note">
                Upload a square image up to 1 MB. Your saved logo appears in your sidebar and tab
                icon while you are signed in.
              </p>
              <div className="branding-preview-grid">
                <BrandingPreview
                  alt="Current partner workspace logo"
                  src={partnerLogoSrc}
                  title="Current workspace logo"
                />
              </div>
            </form>

            <PasswordResetCard
              heading="Reset your portal password"
              isDisabled={isActionPending("reset-own-password")}
              onSubmit={submitResetPassword}
              submitLabel={
                isActionPending("reset-own-password") ? "Updating..." : "Update password"
              }
            />
          </div>

          <div className="subgrid">
            <Subcard eyebrow="Recent rides" title="Attributed trip activity">
              <DataTable
                columns={[
                  {
                    label: "Route",
                    render: (ride) => (
                      <Stack
                        subtitle={ride.destination_address || "No destination"}
                        tertiary={ride.id}
                        title={ride.pickup_address || "Unknown pickup"}
                      />
                    ),
                  },
                  {
                    label: "Customer",
                    render: (ride) => (
                      <Stack
                        subtitle={ride.status || "unknown"}
                        title={ride.customer?.full_name || "Unknown customer"}
                      />
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
                emptyMessage="No partner-attributed rides have been recorded yet."
                rows={workspace.recentRides || []}
              />
            </Subcard>

            <Subcard eyebrow="Commissions" title="Recent commission events">
              <DataTable
                columns={[
                  {
                    label: "Ride",
                    render: (commission) => (
                      <Stack
                        subtitle={commission.ride_id || "No ride"}
                        title={formatCurrency(commission.commission_amount)}
                      />
                    ),
                  },
                  {
                    label: "Type",
                    render: (commission) => (
                      <Stack
                        subtitle={`Value ${String(commission.commission_value || 0)}`}
                        title={commission.commission_type || "flat"}
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
                ]}
                emptyMessage="No commissions are available yet."
                rows={workspace.recentCommissions || []}
              />
            </Subcard>
          </div>

          <div className="subgrid">
            <Subcard eyebrow="Payouts" title="Recent payouts">
              <DataTable
                columns={[
                  {
                    label: "Period",
                    render: (payout) => (
                      <Stack
                        subtitle={`${formatDate(payout.period_start)} to ${formatDate(
                          payout.period_end,
                        )}`}
                        title={formatCurrency(payout.net_payout_amount)}
                      />
                    ),
                  },
                  {
                    label: "Status",
                    render: (payout) => (
                      <Pill label={payout.status || "pending"} tone={renderTone(payout.status || "")} />
                    ),
                  },
                  {
                    label: "Paid",
                    render: (payout) => <span>{formatDateTime(payout.paid_at || payout.created_at)}</span>,
                  },
                ]}
                emptyMessage="No payouts have been issued yet."
                rows={workspace.recentPayouts || []}
              />
            </Subcard>

            <Subcard eyebrow="Relationships" title="Latest customer links">
              <DataTable
                columns={[
                  {
                    label: "Customer",
                    render: (link) => (
                      <Stack
                        subtitle={link.customer?.phone || "No phone"}
                        tertiary={link.customer?.email || "No email"}
                        title={link.customer?.full_name || "Unknown customer"}
                      />
                    ),
                  },
                  {
                    label: "Attribution",
                    render: (link) => (
                      <Stack
                        subtitle={link.source_code || "No code"}
                        title={link.attribution_source || "Direct"}
                      />
                    ),
                  },
                  {
                    label: "Linked",
                    render: (link) => <span>{formatDateTime(link.attributed_at)}</span>,
                  },
                ]}
                emptyMessage="No partner customer links exist yet."
                rows={workspace.recentCustomerLinks || []}
              />
            </Subcard>
          </div>
        </>
      )}
    </PanelShell>
  );

  const renderActiveSection = () => {
    switch (activeSection) {
      case "overview":
        return renderOverviewSection();
      case "live-ops":
        return renderLiveOpsSection();
      case "rides":
        return renderRidesSection();
      case "drivers":
        return renderDriversSection();
      case "customers":
        return renderCustomersSection();
      case "scheduled-rides":
        return renderScheduledSection();
      case "finance":
        return renderFinanceSection();
      case "partners":
        return renderPartnersSection();
      case "support":
        return renderSupportSection();
      case "access":
        return renderAccessSection();
      case "settings":
        return renderSettingsSection();
      case "workspace":
        return renderWorkspaceSection();
      default:
        return <EmptyState message="Choose a section from the left panel." title="No section" />;
    }
  };

  if (isBooting && !session) {
    return (
      <div className="loading-screen">
        <div className="loading-screen-card">
          <p className="eyebrow">Drop control</p>
          <h1>Preparing your workspace</h1>
          <p className="auth-copy">
            Loading live operations, account context, and the latest marketplace state.
          </p>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="shell">
        <aside className="sidebar">
          <div className="sidebar-scroll">
            <div className="brand-block">
              <div className="brand-mark">
                <img
                  alt={session?.role === "partner" ? "Partner workspace logo" : "Drop control logo"}
                  className="brand-logo"
                  onError={(event) => {
                    event.currentTarget.src = activeBrandFallbackSrc;
                  }}
                  src={activeBrandLogoSrc}
                />
                <div>
                  <p className="eyebrow">{session?.role === "partner" ? "Partner portal" : "Drop control"}</p>
                  <h1>{session?.role === "partner" ? "Partner Workspace" : "Operations Dashboard"}</h1>
                </div>
              </div>
              <p className="sidebar-copy">
                {session?.role === "partner"
                  ? "Track attributed rides, commissions, payouts, and your portal access from one place."
                  : session?.role === "staff"
                    ? "Work live operations, riders, drivers, scheduled trips, and support from one focused operations surface."
                    : "Operate rides, dispatch, finance, partners, and trust workflows from one production control surface."}
              </p>
            </div>

            <div className="sidebar-status">
              <div className={`health-pill ${session ? "ok" : "warn"}`}>
                {session?.role === "partner" ? "Partner session active" : "Team session active"}
              </div>
              <p className="sidebar-meta">
                {session?.displayName
                  ? `${session.displayName} (${session.username})`
                  : session?.username || "Signed in"}
              </p>
              {session && session.role !== "partner" ? (
                <p className="sidebar-meta">{currentRoleLabel}</p>
              ) : null}
              <p className="sidebar-meta">
                {lastRefresh[activeSection]
                  ? `Last synced ${lastRefresh[activeSection]}`
                  : "Waiting for first sync"}
              </p>
            </div>

            <nav className="nav-list" aria-label="Dashboard sections">
              {allowedSections.map((section) => (
                <button
                  className={`nav-button ${activeSection === section ? "active" : ""}`}
                  key={section}
                  onClick={() => handleSectionSelect(section)}
                  type="button"
                >
                  <span>
                    {sectionDescriptors[section].label}
                    {section === "support" && supportNavUnreadCount > 0 ? (
                      <span className="nav-badge">{supportNavUnreadCount}</span>
                    ) : null}
                  </span>
                  <small>{sectionDescriptors[section].eyebrow}</small>
                </button>
              ))}
            </nav>

            <div className="section-actions">
              {isLeadershipSession ? (
                <button
                  className="primary-button wide-button"
                  onClick={() => handleSectionSelect("access")}
                  type="button"
                >
                  Manage team access
                </button>
              ) : null}
              {isLeadershipSession ? (
                <button
                  className="ghost-button wide-button"
                  onClick={() => handleSectionSelect("partners")}
                  type="button"
                >
                  Create or manage partners
                </button>
              ) : null}
              <button className="ghost-button wide-button" onClick={handleLogout} type="button">
                Sign out
              </button>
            </div>
          </div>
        </aside>

        <main className="main">
          <div className="panel-stage" key={activeSection} ref={panelStageRef}>
            {renderActiveSection()}
          </div>
        </main>
      </div>

      {pendingActionCount ? (
        <div className="activity-banner" aria-live="polite">
          <span className="activity-dot" />
          {pendingActionCount === 1 ? "Applying change..." : `Applying ${pendingActionCount} changes...`}
        </div>
      ) : null}

      {confirmState ? (
        <div className="confirm-backdrop" role="presentation">
          <div className="confirm-dialog" role="dialog" aria-modal="true" aria-labelledby="confirm-title">
            <p className="eyebrow">Confirm action</p>
            <h3 id="confirm-title">{confirmState.title}</h3>
            <p className="confirm-copy">{confirmState.message}</p>
            <div className="confirm-actions">
              <button className="ghost-button" onClick={() => resolveConfirmation(false)} type="button">
                Cancel
              </button>
              <button
                className={
                  confirmState.tone === "danger"
                    ? "danger-button"
                    : confirmState.tone === "success"
                      ? "success-button"
                      : "primary-button"
                }
                onClick={() => resolveConfirmation(true)}
                type="button"
              >
                {confirmState.confirmLabel || "Continue"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {promptState ? (
        <div className="confirm-backdrop" role="presentation">
          <form
            className="confirm-dialog prompt-dialog"
            onSubmit={(event) => {
              event.preventDefault();
              resolvePrompt(promptValues);
            }}
          >
            <p className="eyebrow">Complete action</p>
            <h3>{promptState.title}</h3>
            <p className="confirm-copy">{promptState.message}</p>
            <div className="prompt-fields">
              {promptState.fields.map((field, index) => {
                const type = field.type || "text";

                return (
                  <label className="prompt-field" key={field.name}>
                    {field.label}
                    {type === "textarea" ? (
                      <textarea
                        autoFocus={index === 0}
                        onChange={(event) =>
                          setPromptValues((current) => ({
                            ...current,
                            [field.name]: event.target.value,
                          }))
                        }
                        placeholder={field.placeholder}
                        required={field.required}
                        value={promptValues[field.name] || ""}
                      />
                    ) : type === "select" ? (
                      <select
                        autoFocus={index === 0}
                        onChange={(event) =>
                          setPromptValues((current) => ({
                            ...current,
                            [field.name]: event.target.value,
                          }))
                        }
                        required={field.required}
                        value={promptValues[field.name] || ""}
                      >
                        {(field.options || []).map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <input
                        autoFocus={index === 0}
                        onChange={(event) =>
                          setPromptValues((current) => ({
                            ...current,
                            [field.name]: event.target.value,
                          }))
                        }
                        placeholder={field.placeholder}
                        required={field.required}
                        type={type}
                        value={promptValues[field.name] || ""}
                      />
                    )}
                  </label>
                );
              })}
            </div>
            <div className="confirm-actions">
              <button className="ghost-button" onClick={() => resolvePrompt(null)} type="button">
                Cancel
              </button>
              <button
                className={
                  promptState.tone === "danger"
                    ? "danger-button"
                    : promptState.tone === "success"
                      ? "success-button"
                      : "primary-button"
                }
                type="submit"
              >
                {promptState.confirmLabel || "Continue"}
              </button>
            </div>
          </form>
        </div>
      ) : null}

      {supportComposer === "broadcast" ? (
        <div className="confirm-backdrop" role="presentation">
          <form className="confirm-dialog support-compose-dialog" onSubmit={(event) => void submitNotification(event)}>
            <div className="support-compose-head">
              <div>
                <p className="eyebrow">Broadcast</p>
                <h3>Send push notification</h3>
                <p className="confirm-copy">
                  Reach drivers, customers, or a custom list from one focused action.
                </p>
              </div>
              <button className="ghost-button" onClick={() => setSupportComposer(null)} type="button">
                Close
              </button>
            </div>
            <div className="form-grid support-compose-grid">
              <label>
                Audience
                <select
                  onChange={(event) =>
                    setSupportBroadcastDraft((current) => ({
                      ...current,
                      audience: event.target.value as "both" | "custom" | "customers" | "drivers",
                    }))
                  }
                  value={supportBroadcastDraft.audience}
                >
                  <option value="both">Drivers and customers</option>
                  <option value="drivers">Drivers only</option>
                  <option value="customers">Customers only</option>
                  <option value="custom">Custom recipient IDs</option>
                </select>
              </label>
              <label>
                Title
                <input
                  onChange={(event) =>
                    setSupportBroadcastDraft((current) => ({
                      ...current,
                      title: event.target.value,
                    }))
                  }
                  required
                  value={supportBroadcastDraft.title}
                />
              </label>
              {supportBroadcastDraft.audience === "custom" ? (
                <label className="support-full-span">
                  Recipient IDs
                  <textarea
                    onChange={(event) =>
                      setSupportBroadcastDraft((current) => ({
                        ...current,
                        recipientIds: event.target.value,
                      }))
                    }
                    placeholder="Paste comma-separated profile UUIDs"
                    value={supportBroadcastDraft.recipientIds}
                  />
                </label>
              ) : null}
              <label className="support-full-span">
                Body
                <textarea
                  onChange={(event) =>
                    setSupportBroadcastDraft((current) => ({
                      ...current,
                      body: event.target.value,
                    }))
                  }
                  required
                  value={supportBroadcastDraft.body}
                />
              </label>
              <label>
                Channel ID
                <input
                  onChange={(event) =>
                    setSupportBroadcastDraft((current) => ({
                      ...current,
                      channelId: event.target.value,
                    }))
                  }
                  value={supportBroadcastDraft.channelId}
                />
              </label>
            </div>
            <p className="support-card-note">
              Send to drivers only, customers only, both audiences, or a custom list when you need precision.
            </p>
            <div className="confirm-actions">
              <button className="ghost-button" onClick={() => setSupportComposer(null)} type="button">
                Cancel
              </button>
              <button
                className="primary-button"
                disabled={isActionPending("send-notification")}
                type="submit"
              >
                {isActionPending("send-notification") ? "Sending..." : "Send notification"}
              </button>
            </div>
          </form>
        </div>
      ) : null}

      {supportComposer === "reply" ? (
        <div className="confirm-backdrop" role="presentation">
          <form className="confirm-dialog support-compose-dialog" onSubmit={(event) => void submitSupportReply(event)}>
            <div className="support-compose-head">
              <div>
                <p className="eyebrow">Support response</p>
                <h3>Reply to selected thread</h3>
                <p className="confirm-copy">
                  Send a clear response to the active ride conversation and log it in the timeline.
                </p>
              </div>
              <button className="ghost-button" onClick={() => setSupportComposer(null)} type="button">
                Close
              </button>
            </div>
            {selectedSupportThread ? (
              <div className="support-compose-context">
                <Pill label={`Ride ${selectedSupportThread.ride_id}`} tone="neutral" />
                <Pill
                  label={selectedSupportThread.customer?.full_name || "Unknown customer"}
                  tone="success"
                />
                <Pill
                  label={selectedSupportThread.driver?.full_name || "Unknown driver"}
                  tone="neutral"
                />
              </div>
            ) : null}
            <div className="form-grid support-compose-grid">
              <label>
                Audience
                <select
                  onChange={(event) =>
                    setSupportReplyAudience(
                      event.target.value as "both" | "customer" | "driver",
                    )
                  }
                  value={supportReplyAudience}
                >
                  <option value="both">Customer and driver</option>
                  <option value="customer">Customer only</option>
                  <option value="driver">Driver only</option>
                </select>
              </label>
              <label className="support-full-span">
                Message
                <textarea
                  onChange={(event) => setSupportReplyBody(event.target.value)}
                  placeholder={
                    selectedSupportThread?.ride_id
                      ? "Write a clear support response for this conversation..."
                      : "Select a support conversation first"
                  }
                  required
                  value={supportReplyBody}
                />
              </label>
            </div>
            <p className="support-card-note">
              Responses are delivered to the selected ride participants and written into the support history.
            </p>
            <div className="confirm-actions">
              <button className="ghost-button" onClick={() => setSupportComposer(null)} type="button">
                Cancel
              </button>
              <button
                className="primary-button"
                disabled={
                  !selectedSupportThread?.ride_id ||
                  isActionPending(`support-reply:${String(selectedSupportThread?.ride_id || "")}`)
                }
                type="submit"
              >
                {isActionPending(`support-reply:${String(selectedSupportThread?.ride_id || "")}`)
                  ? "Sending..."
                  : "Send response"}
              </button>
            </div>
          </form>
        </div>
      ) : null}

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
