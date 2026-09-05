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
  | "list_safety_alerts"
  | "update_safety_alert"
  | "update_ride_follow_up"
  | "update_driver"
  | "grant_driver_subscription"
  | "update_customer"
  | "cancel_scheduled_ride"
  | "create_partner"
  | "create_referral_code"
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
  | "mark_referral_paid"
  | "reset_password"
  | "toggle_account_status"
  | "update_user_phone"
  | "send_support_reply"
  | "send_support_inbox_reply"
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
  | "referrals"
  | "support"
  | "support-chat"
  | "settings"
  | "access"
  | "workspace";
