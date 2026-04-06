export type JsonValue =
  | null
  | boolean
  | number
  | string
  | JsonValue[]
  | { [key: string]: JsonValue };

export type AnyRecord = Record<string, any>;

export type RouteContext<T extends Record<string, string> = Record<string, string>> = {
  params: Promise<T>;
};

export type DashboardRole = "super_admin" | "admin" | "staff" | "partner";

export type DashboardSession = {
  accountId?: string | null;
  authenticated: boolean;
  displayName?: string | null;
  expiresAt: number;
  partnerId?: string | null;
  role: DashboardRole;
  roleTitle?: string | null;
  username: string;
};

export type DashboardActionName =
  | "cancel_ride"
  | "update_ride_follow_up"
  | "update_driver"
  | "update_customer"
  | "cancel_scheduled_ride"
  | "create_partner"
  | "update_partner"
  | "update_partner_branding"
  | "update_partner_commission"
  | "update_report"
  | "send_push_notification"
  | "update_app_config"
  | "update_dispatch_settings"
  | "update_service_type"
  | "create_service_type"
  | "update_cancel_reason"
  | "create_cancel_reason"
  | "create_admin"
  | "create_staff"
  | "create_partner_access"
  | "reset_password"
  | "toggle_account_status"
  | "send_support_reply"
  | "mark_support_thread_seen";

export type DashboardSectionName =
  | "overview"
  | "live-ops"
  | "rides"
  | "drivers"
  | "customers"
  | "scheduled-rides"
  | "finance"
  | "partners"
  | "support"
  | "settings"
  | "access"
  | "workspace";
