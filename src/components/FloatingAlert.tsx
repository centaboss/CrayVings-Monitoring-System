import { useState, useEffect, useCallback, type ReactNode } from "react";
import { X, AlertTriangle, AlertCircle, BellOff } from "lucide-react";
import { playLowAlertSound, playHighAlertSound } from "../utils/playAlertSound";
import { muteAlerts } from "../api/client";
import { 
  FloatingAlertContext, 
  useFloatingAlerts,
  type AlertNotification
} from "../hooks/useFloatingAlerts";

const MUTE_OPTIONS = [1, 2, 4, 6, 8, 12, 24];

interface FloatingAlertProviderProps {
  children: ReactNode;
}

export function FloatingAlertProvider({ children }: FloatingAlertProviderProps) {
  const [notifications, setNotifications] = useState<AlertNotification[]>([]);

  const playAlertSound = useCallback(async (threshold: "min" | "max") => {
    try {
      if (threshold === "min") {
        await playLowAlertSound();
      } else {
        await playHighAlertSound();
      }
    } catch {
      // Silent fail - audio may not work
    }
  }, []);

  const addNotification = useCallback(async (notification: Omit<AlertNotification, "id">) => {
    const id = `${notification.parameter}-${notification.threshold}-${Date.now()}`;
    
    // Play sound FIRST before updating state (skip for device notifications - sound handled elsewhere)
    if (notification.parameter !== "device") {
      await playAlertSound(notification.threshold);
    }
    
    // Always add new notification (allow multiple same alerts)
    setNotifications((prev) => {
      // Remove old notification for same sensor if exists
      const filtered = prev.filter(
        (n) => !(n.parameter === notification.parameter && n.threshold === notification.threshold)
      );
      return [...filtered, { ...notification, id }];
    });
  }, [playAlertSound]);

  const removeNotification = useCallback((id: string) => {
    setNotifications((prev) => prev.filter((n) => n.id !== id));
  }, []);

  const clearNotifications = useCallback(() => {
    setNotifications([]);
  }, []);

  return (
    <FloatingAlertContext.Provider value={{ notifications, addNotification, removeNotification, clearNotifications }}>
      {children}
    </FloatingAlertContext.Provider>
  );
}

export function FloatingAlertContainer() {
  const { notifications, removeNotification } = useFloatingAlerts();

  return (
    <div className="fixed top-20 right-4 z-50 flex flex-col gap-2 max-w-sm pointer-events-none">
      {notifications.map((notification) => (
        <FloatingAlertItem
          key={notification.id}
          notification={notification}
          onClose={() => removeNotification(notification.id)}
        />
      ))}
    </div>
  );
}

interface FloatingAlertItemProps {
  notification: AlertNotification;
  onClose: () => void;
}

function FloatingAlertItem({ notification, onClose }: FloatingAlertItemProps) {
  const [isExiting, setIsExiting] = useState(false);
  const [showMuteOptions, setShowMuteOptions] = useState(false);
  const [muting, setMuting] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => {
      setIsExiting(true);
      setTimeout(onClose, 300);
    }, 5000);

    return () => clearTimeout(timer);
  }, [onClose]);

  const handleClose = () => {
    setIsExiting(true);
    setTimeout(onClose, 300);
  };

  const handleMute = useCallback(async (hours: number) => {
    setMuting(true);
    await muteAlerts(hours);
    setMuting(false);
    setShowMuteOptions(false);
    setIsExiting(true);
    setTimeout(onClose, 300);
  }, [onClose]);

  const isWarning = notification.type === "warning";
  const bgColor = isWarning ? "bg-amber-50" : "bg-red-50";
  const borderColor = isWarning ? "border-amber-300" : "border-red-400";
  const iconColor = isWarning ? "text-amber-500" : "text-red-500";
  const textColor = isWarning ? "text-amber-800" : "text-red-800";

  return (
    <div
      className={`
        pointer-events-auto flex flex-col gap-2 p-3 rounded-lg border shadow-lg
        ${bgColor} ${borderColor}
        transition-all duration-300 ease-out
        ${isExiting ? "opacity-0 translate-x-full" : "opacity-100 translate-x-0"}
      `}
    >
      <div className="flex items-start gap-3">
        <div className={`flex-shrink-0 ${iconColor}`}>
          {isWarning ? <AlertTriangle size={18} /> : <AlertCircle size={18} />}
        </div>
        <div className="flex-1 min-w-0">
          <p className={`text-sm font-medium ${textColor} break-words`}>
            {notification.message}
          </p>
          {notification.parameter !== "device" && (
            <p className="text-xs text-gray-500 mt-0.5">
              Current: {notification.value} - Threshold: {notification.threshold === "min" ? "below min" : "above max"}
            </p>
          )}
        </div>
        <div className="flex-shrink-0 flex items-center gap-1">
          {notification.parameter === "device" && (
            <button
              onClick={() => setShowMuteOptions(!showMuteOptions)}
              className="text-gray-400 hover:text-gray-600 transition-colors"
              title="Mute SMS alerts"
            >
              <BellOff size={16} />
            </button>
          )}
          <button
            onClick={handleClose}
            className="text-gray-400 hover:text-gray-600 transition-colors"
          >
            <X size={16} />
          </button>
        </div>
      </div>

      {showMuteOptions && (
        <div className="flex flex-wrap gap-1 pt-1 border-t border-gray-200/50">
          <span className="text-xs text-gray-500 w-full mb-1">Mute SMS alerts for:</span>
          {MUTE_OPTIONS.map((hours) => (
            <button
              key={hours}
              onClick={() => handleMute(hours)}
              disabled={muting}
              className="px-2 py-1 text-xs font-medium rounded bg-gray-100 text-gray-700 hover:bg-gray-200 transition-colors disabled:opacity-50"
            >
              {hours}h
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export default FloatingAlertContainer;
