import { useEffect, useRef, useCallback, useMemo } from "react";
import { useSensorData, useSensorSettings } from "../contexts/SensorContext";
import { useFloatingAlerts } from "../hooks/useFloatingAlerts";
import { getSettingsThresholds, getThresholdStatus, type ThresholdStatus } from "../types";

const ALERT_COOLDOWN_MS = 10000;
const SENSOR_KEYS = ["temperature", "water_level", "ph", "dissolved_oxygen", "ammonia"] as const;

function toNumber(value: string | number | undefined): number {
  if (typeof value === "number") return value;
  if (typeof value === "string") return parseFloat(value);
  return 0;
}

export function useThresholdAlert() {
  const { data, loading } = useSensorData();
  const { settings } = useSensorSettings();
  const { addNotification } = useFloatingAlerts();
  
  const lastAlertTimeRef = useRef<Record<string, number>>({});
  const previousStatusRef = useRef<Record<string, ThresholdStatus>>({});

  const thresholds = useMemo(
    () => settings ? getSettingsThresholds(settings) : null,
    [settings]
  );

  const checkThresholds = useCallback(() => {
    if (loading || !data || !thresholds) {
      return;
    }

    const now = Date.now();

    for (const key of SENSOR_KEYS) {
      const value = toNumber(data[key] as string | number);
      if (isNaN(value)) continue;

      const config = thresholds[key];
      if (!config) continue;

      const newStatus = getThresholdStatus(value, config.range, config.isMinOnly);
      const previousStatus = previousStatusRef.current[key];
      
      if (newStatus !== "good" && (previousStatus === "good" || previousStatus === undefined)) {
        const isBelowMin = value < config.range.min;
        const thresholdType = isBelowMin ? "min" : "max";
        const alertKey = `${key}-${thresholdType}`;
        
        const lastAlertTime = lastAlertTimeRef.current[alertKey] || 0;
        const timeSinceLastAlert = now - lastAlertTime;
        
        if (timeSinceLastAlert > ALERT_COOLDOWN_MS) {
          const prefix = isBelowMin ? "Low" : "High";
          const message = `${prefix} ${config.name}: ${value}${config.unit} is ${isBelowMin ? "below" : "above"} threshold (${config.range.min}${config.unit} - ${config.range.max}${config.unit})`;

          lastAlertTimeRef.current[alertKey] = now;
          
          addNotification({
            message,
            type: newStatus === "critical" ? "critical" : "warning",
            parameter: key,
            value,
            threshold: thresholdType,
          });
        }
      }
      
      if (newStatus === "good") {
        previousStatusRef.current[key] = "good";
      } else if (previousStatus !== "good" && previousStatus !== undefined) {
        previousStatusRef.current[key] = newStatus;
      } else if (previousStatus === undefined) {
        previousStatusRef.current[key] = newStatus;
      }
    }
  }, [data, thresholds, loading, addNotification]);

  useEffect(() => {
    checkThresholds();
  }, [checkThresholds]);
}