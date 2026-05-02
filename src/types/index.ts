export type SensorEntry = {
  _id?: string;
  device_id: string;
  temperature: number;
  water_level: number;
  ph: number;
  timestamp?: string;
};

export type ChartPoint = {
  name: string;
  timestamp: string;
  temperature: number;
  water_level: number;
  ph: number;
};

export const VALID_MENU_KEYS = [
  "Home",
  "Dashboard",
  "Sensors",
  "Alerts",
  "Historical Data",
  "Activity Logs",
  "Settings",
  "Logs",
  "User Management",
] as const;

export type MenuKey = typeof VALID_MENU_KEYS[number];

export function isValidMenuKey(value: string): value is MenuKey {
  return VALID_MENU_KEYS.includes(value as MenuKey);
}

export type LogEntry = {
  id?: number;
  action: string;
  parameter: string;
  old_value: string | number;
  new_value: string | number;
  timestamp?: string;
};

export type SensorSettings = {
  id?: number;
  temp_min: number;
  temp_max: number;
  ph_min: number;
  ph_max: number;
  water_level_min: number;
  water_level_max: number;
  updated_at?: string;
};

export const DEFAULT_SETTINGS: SensorSettings = {
  temp_min:20.0,
  temp_max:31.0,
  ph_min:6.5,
  ph_max:8.5,
  water_level_min:10.0,
  water_level_max:100.0,
};

export type ThresholdRange = {
  min: number;
  max: number;
};

export type SensorThreshold = {
  name: string;
  unit: string;
  range: ThresholdRange;
  isMinOnly: boolean;
  color: string;
};

export function getSettingsThresholds(settings: SensorSettings | null): Record<string, SensorThreshold> {
  const defaults = settings ?? DEFAULT_SETTINGS;
  return {
    temperature: {
      name: "Temperature",
      unit: "°C",
      range: { min: defaults.temp_min, max: defaults.temp_max },
      isMinOnly: false,
      color: "text-orange-500",
    },
    ph: {
      name: "pH Level",
      unit: "",
      range: { min: defaults.ph_min, max: defaults.ph_max },
      isMinOnly: false,
      color: "text-purple-500",
    },
    water_level: {
      name: "Water Level",
      unit: "%",
      range: { min: defaults.water_level_min, max: defaults.water_level_max },
      isMinOnly: false,
      color: "text-blue-500",
    },
  };
}

export type ThresholdStatus = "good" | "warning" | "critical";

export function getThresholdStatus(
  value: number,
  range: ThresholdRange,
  isMinOnly: boolean
): ThresholdStatus {
  if (isMinOnly) {
    return value >= range.min ? "good" : "warning";
  }
  
  const rangeSize = range.max - range.min;
  const criticalMargin = rangeSize * 0.15;
  
  if (value < range.min) {
    const deviation = range.min - value;
    return deviation >= criticalMargin ? "critical" : "warning";
  }
  if (value > range.max) {
    const deviation = value - range.max;
    return deviation >= criticalMargin ? "critical" : "warning";
  }
  
  return "good";
}

export type AlertSeverity = "info" | "warning" | "critical";

export interface AlertEntry extends LogEntry {
  severity: AlertSeverity;
}

export function parseAlertSeverity(log: LogEntry): AlertSeverity {
  if (log.action !== "Alert") return "info";
  
  const param = log.parameter;
  const val = Number(log.new_value);
  
  if (param === "Temperature") {
    return val > 35 || val < 15 ? "critical" : "warning";
  } else if (param === "pH Level") {
    return val > 9 || val < 5 ? "critical" : "warning";
  }
  return "warning";
}

const DEFAULT_API_BASE = "http://localhost:3000";

export function getApiBase(): string {
  if (typeof import.meta !== "undefined" && import.meta.env) {
    return import.meta.env.VITE_API_BASE || DEFAULT_API_BASE;
  }
  return DEFAULT_API_BASE;
}

export const API_BASE = getApiBase();

export type ActivityLog = {
  id?: number;
  user_name: string;
  action_type: string;
  description: string;
  module: string;
  timestamp?: string;
};

export type ActivityActionType = 
  | "navigation"
  | "button_click"
  | "form_submit"
  | "settings_change"
  | "device_connect"
  | "device_disconnect"
  | "system_event"
  | "login"
  | "logout";

export const ACTIVITY_ACTION_TYPES: ActivityActionType[] = [
  "navigation",
  "button_click",
  "form_submit",
  "settings_change",
  "device_connect",
  "device_disconnect",
  "system_event",
  "login",
  "logout",
];

export interface ActivityLogEntry {
  user_name?: string;
  action_type: ActivityActionType;
  description: string;
  module: string;
}

export type UserRole = "user" | "admin";

export interface AuthUser {
  id: number;
  username: string;
  email: string;
  role: UserRole;
  name: string;
}

export interface AuthResponse {
  message: string;
  user: AuthUser;
  token: string;
}