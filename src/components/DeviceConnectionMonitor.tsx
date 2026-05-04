import { useEffect, useRef } from "react";
import { useSensorData } from "../hooks/useSensors";
import { useFloatingAlerts } from "../hooks/useFloatingAlerts";
import { useActivityLogger } from "../hooks/useSensors";
import { playCriticalSound } from "../utils/playAlertSound";
import { sendDeviceDisconnectAlert } from "../api/client";

type ConnectionStatus = "online" | "offline" | "connecting" | "unknown";

export function DeviceConnectionMonitor() {
  const { connectionStatus, consecutiveFailures } = useSensorData();
  const { addNotification, removeNotification } = useFloatingAlerts();
  const logActivity = useActivityLogger();
  const prevStatusRef = useRef<ConnectionStatus>("connecting");
  const disconnectAlertIdRef = useRef<string | null>(null);
  const smsSentRef = useRef(false);

  useEffect(() => {
    const prevStatus = prevStatusRef.current;
    prevStatusRef.current = connectionStatus;

    const wentOffline =
      connectionStatus === "offline" && prevStatus !== "offline";
    const cameOnline =
      connectionStatus === "online" && prevStatus === "offline";

    if (wentOffline) {
      smsSentRef.current = false;
      const id = `device-disconnect-${Date.now()}`;
      disconnectAlertIdRef.current = id;

      addNotification({
        message: "ESP32 device disconnected — no data received",
        type: "critical",
        parameter: "device",
        value: 0,
        threshold: "min",
      });

      logActivity(
        "device_disconnect",
        `ESP32 device went offline after ${consecutiveFailures} failed polls`,
        "Sensors"
      );

      sendDeviceDisconnectAlert(
        `ESP32 device disconnected — no data for 15+ seconds`,
        consecutiveFailures
      );

      playCriticalSound();
    }

    if (cameOnline) {
      if (disconnectAlertIdRef.current) {
        removeNotification(disconnectAlertIdRef.current);
        disconnectAlertIdRef.current = null;
      }

      logActivity(
        "device_connect",
        "ESP32 device reconnected and sending data",
        "Sensors"
      );

      addNotification({
        message: "ESP32 device reconnected — data restored",
        type: "warning",
        parameter: "device",
        value: 1,
        threshold: "min",
      });
    }
  }, [connectionStatus, consecutiveFailures, addNotification, logActivity, removeNotification]);

  return null;
}
