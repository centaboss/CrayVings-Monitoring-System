import axios, { isAxiosError, type AxiosError } from "axios";
import type { SensorEntry, ChartPoint, LogEntry, SensorSettings, ActivityLog, ActivityLogEntry, AuthResponse } from "../types";
import { API_BASE } from "../types";

export interface UserEntry {
  id: number;
  name: string;
  username: string;
  email: string;
  role: string;
  created_at: string;
}

const client = axios.create({
  baseURL: API_BASE,
  timeout: 10000,
  headers: {
    "Content-Type": "application/json",
  },
});

client.interceptors.request.use((config) => {
  const token = localStorage.getItem("crayvings_token");
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

client.interceptors.response.use(
  (response) => response,
  (error: AxiosError) => {
    if (error.code !== "ECONNABORTED" && error.code !== "ERR_CANCELED") {
      // Silent fail for network errors
    }
    return Promise.reject(error);
  }
);

export class ApiError extends Error {
  statusCode: number | undefined;
  isNetworkError: boolean;
  constructor(message: string, statusCode?: number, isNetworkError = false) {
    super(message);
    this.name = "ApiError";
    this.statusCode = statusCode;
    this.isNetworkError = isNetworkError;
  }
}

export async function fetchLatestSensor(signal?: AbortSignal): Promise<SensorEntry | null> {
  try {
    const response = await client.get<SensorEntry>("/sensor/latest", { signal });
    return response.data;
  } catch (error) {
    if (isAxiosError(error) && error.code === "ERR_CANCELED") {
      return null;
    }
    if (isAxiosError(error) && error.response?.status === 404) {
      return null;
    }
    throw error;
  }
}

export async function fetchSensorHistory(limit = 50, signal?: AbortSignal): Promise<ChartPoint[]> {
  const response = await client.get<SensorEntry[]>("/sensor", {
    params: { limit },
    signal,
  });
  return (response.data || [])
    .slice()
    .reverse()
    .map((item) => ({
      name: item.timestamp
        ? new Date(item.timestamp).toLocaleTimeString([], {
            hour: "2-digit",
            minute: "2-digit",
          })
        : "--:--",
      temperature: item.temperature ?? 0,
      water_level: item.water_level ?? 0,
      ph: item.ph ?? 0,
    }));
}

export interface LogsResponse {
  data: LogEntry[];
  total: number;
  page: number;
  limit: number;
}

export async function fetchLogs(
  page = 1,
  limit = 20,
  signal?: AbortSignal
): Promise<LogsResponse> {
  const response = await client.get<{ data: LogEntry[]; total: number }>("/system-logs", {
    params: { page, limit },
    signal,
  });
  return {
    data: response.data.data || [],
    total: response.data.total || 0,
    page,
    limit,
  };
}

export async function fetchSettings(signal?: AbortSignal): Promise<SensorSettings> {
  const response = await client.get<SensorSettings>("/settings", { signal });
  return response.data;
}

export async function saveSettings(settings: Partial<SensorSettings>, signal?: AbortSignal): Promise<void> {
  await client.post("/settings", settings, { signal });
}

export async function createLog(
  action: string,
  parameter: string,
  oldValue: string | number,
  newValue: string | number,
  signal?: AbortSignal
): Promise<LogEntry> {
  const response = await client.post<{ data: LogEntry }>(
    "/logs",
    {
      action,
      parameter,
      old_value: oldValue,
      new_value: newValue,
    },
    { signal }
  );
  return response.data.data;
}

export async function checkHealth(signal?: AbortSignal): Promise<{ status: string; serverTime: string }> {
  const response = await client.get("/health", { signal });
  return response.data;
}

export interface ActivityLogsResponse {
  data: ActivityLog[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export async function logActivity(
  entry: ActivityLogEntry,
  signal?: AbortSignal
): Promise<ActivityLog | null> {
  try {
    const response = await client.post<{ data: ActivityLog }>(
      "/activity-logs",
      entry,
      { signal }
    );
    return response.data.data;
  } catch {
    console.error("Failed to log activity:", entry);
    return null;
  }
}

export async function fetchActivityLogs(
  page = 1,
  limit = 20,
  search = "",
  sortBy: "newest" | "oldest" = "newest",
  actionType?: string,
  signal?: AbortSignal
): Promise<ActivityLogsResponse> {
  const response = await client.get<ActivityLogsResponse>("/activity-logs", {
    params: { page, limit, search, sortBy, actionType },
    signal,
  });
  return response.data;
}

export async function loginUser(
  username: string,
  password: string,
  signal?: AbortSignal
): Promise<AuthResponse> {
  const response = await client.post<AuthResponse>(
    "/auth/login",
    { username, password },
    { signal }
  );
  return response.data;
}

export async function fetchUsers(signal?: AbortSignal): Promise<UserEntry[]> {
  const response = await client.get<UserEntry[]>("/auth/users", { signal });
  return response.data;
}

export async function createUser(
  name: string,
  username: string,
  email: string,
  password: string,
  role: string,
  signal?: AbortSignal
): Promise<UserEntry> {
  const response = await client.post<{ data: UserEntry }>(
    "/auth/users",
    { name, username, email, password, role },
    { signal }
  );
  return response.data.data;
}

export async function deleteUser(
  userId: number,
  signal?: AbortSignal
): Promise<void> {
  await client.delete(`/auth/users/${userId}`, { signal });
}

export async function resetUserPassword(
  userId: number,
  newPassword: string,
  signal?: AbortSignal
): Promise<void> {
  await client.put(`/auth/users/${userId}/password`, { newPassword }, { signal });
}

export default client;
