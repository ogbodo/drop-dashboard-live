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

export type DashboardActionName =
  | "cancel_ride"
  | "update_ride_follow_up"
  | "update_driver"
  | "update_customer"
  | "cancel_scheduled_ride"
  | "create_partner"
  | "update_partner"
  | "update_partner_commission"
  | "update_report"
  | "send_push_notification"
  | "update_app_config"
  | "update_dispatch_settings"
  | "update_service_type"
  | "create_service_type"
  | "update_cancel_reason"
  | "create_cancel_reason";

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
  | "settings";
