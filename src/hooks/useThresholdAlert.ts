import { useEffect, useRef, useCallback } from "react";
import { useSensorData, useSensorSettings } from "../contexts/SensorContext";
import { useFloatingAlerts } from "../hooks/useFloatingAlerts";
import { getSettingsThresholds, getThresholdStatus } from "../types";

const ALERT_COOLDOWN_MS = 10000;

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
  const hasAlertedRef = useRef<Record<string, boolean>>({});

  const checkThresholds = useCallback(() => {
    if (loading || !data || !settings) {
      return;
    }

    const thresholds = getSettingsThresholds(settings);
    const now = Date.now();

    const sensorKeys = [
      "temperature",
      "water_level",
      "ph",
      "dissolved_oxygen",
      "ammonia",
    ] as const;

    for (const key of sensorKeys) {
      const value = toNumber(data[key] as string | number);
      if (isNaN(value)) continue;

      const config = thresholds[key];
      if (!config) continue;

      const status = getThresholdStatus(value, config.range, config.isMinOnly);
      
      if (status !== "good") {
        const isBelowMin = value < config.range.min;
        const thresholdType = isBelowMin ? "min" : "max";
        const alertKey = `${key}-${thresholdType}`;
        
        const timeSinceLastAlert = now - (lastAlertTimeRef.current[alertKey] || 0);
        
        // Alert if: never alerted OR cooldown expired
        const shouldAlert = !hasAlertedRef.current[alertKey] || timeSinceLastAlert > ALERT_COOLDOWN_MS;
        
        if (shouldAlert) {
          const prefix = isBelowMin ? "Low" : "High";
          const message = `${prefix} ${config.name}: ${value}${config.unit} is ${isBelowMin ? "below" : "above"} threshold (${config.range.min}${config.unit} - ${config.range.max}${config.unit})`;

          lastAlertTimeRef.current[alertKey] = now;
          hasAlertedRef.current[alertKey] = true;
          
          addNotification({
            message,
            type: status === "critical" ? "critical" : "warning",
            parameter: key,
            value,
            threshold: thresholdType,
          });
        }
      } else {
        // Reset alert flag when value returns to good range
        hasAlertedRef.current[`${key}-min`] = false;
        hasAlertedRef.current[`${key}-max`] = false;
      }
    }
  }, [data, settings, loading, addNotification]);

  useEffect(() => {
    checkThresholds();
  }, [checkThresholds]);
}