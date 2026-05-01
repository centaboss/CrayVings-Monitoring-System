import { useState, useCallback, useMemo } from "react";
import { useSensorSettings, useActivityLogger } from "../hooks/useSensors";
import { Settings, Save, AlertTriangle, Volume2, Upload, Check, X } from "lucide-react";
import type { SensorSettings } from "../types";
import { DEFAULT_SETTINGS, getSettingsThresholds } from "../types";
import { 
  setCustomSoundFromBlob, 
  clearCustomSound, 
  hasCustomSound,
  getIsSoundEnabled 
} from "../utils/playAlertSound";

type UploadStatus = "idle" | "uploading" | "success" | "error";

const SETTING_BOUNDS: Record<string, { min: number; max: number }> = {
  temp_min: { min: -10, max: 50 },
  temp_max: { min: -10, max: 50 },
  ph_min: { min: 0, max: 14 },
  ph_max: { min: 0, max: 14 },
  water_level_min: { min: 0, max: 100 },
  water_level_max: { min: 0, max: 100 },
};

const KEY_MAPPING: Record<string, { min: keyof SensorSettings; max: keyof SensorSettings }> = {
  temperature: { min: "temp_min", max: "temp_max" },
  ph: { min: "ph_min", max: "ph_max" },
  water_level: { min: "water_level_min", max: "water_level_max" },
};

const THRESHOLD_COLORS: Record<string, { bg: string; border: string }> = {
  temperature: { bg: "bg-blue-50", border: "border-blue-100" },
  ph: { bg: "bg-emerald-50", border: "border-emerald-100" },
  water_level: { bg: "bg-indigo-50", border: "border-indigo-100" },
};

function validateSetting(key: keyof SensorSettings, value: number): { valid: boolean; message?: string } {
  const bounds = SETTING_BOUNDS[key];
  if (!bounds) return { valid: true };
  
  if (value < bounds.min || value > bounds.max) {
    return { 
      valid: false, 
      message: `Value must be between ${bounds.min} and ${bounds.max}` 
    };
  }
  
  return { valid: true };
}

function validateRange(key: string, settingsToValidate: SensorSettings): { valid: boolean; message?: string } {
  const keys = KEY_MAPPING[key];
  if (!keys) return { valid: true };
  
  const min = settingsToValidate[keys.min];
  const max = settingsToValidate[keys.max];
  
  if (typeof min === 'number' && typeof max === 'number' && min >= max) {
    return { valid: false, message: `${key.charAt(0).toUpperCase() + key.slice(1)} min must be less than max` };
  }
  
  return { valid: true };
}

export default function SettingsPage() {
  const { 
    settings, 
    settingsLoading, 
    settingsError, 
    saveError,
    saveSettings, 
    settingsSaved, 
    settingsSaving 
  } = useSensorSettings();
  const logActivity = useActivityLogger();
  
  const [localSettings, setLocalSettings] = useState<SensorSettings | null>(null);
  const [validationErrors, setValidationErrors] = useState<Record<string, string>>({});
  const [localSaveError, setLocalSaveError] = useState<string | null>(null);
  const [uploadStatus, setUploadStatus] = useState<Record<string, UploadStatus>>({});
  const [fileInputRefs] = useState<Record<string, HTMLInputElement>>({});
  const soundEnabledState = useState<boolean>(() => {
    if (typeof window !== "undefined") {
      return getIsSoundEnabled();
    }
    return true;
  });
  const [, setSoundEnabledTrigger] = useState(0);

  const displaySettings = useMemo(() => {
    return localSettings ?? settings ?? DEFAULT_SETTINGS;
  }, [localSettings, settings]);

  const soundEnabled = soundEnabledState[0];

  const updateSetting = useCallback((key: keyof SensorSettings, value: string) => {
    const numValue = parseFloat(value);
    if (isNaN(numValue)) return;
    
    const validation = validateSetting(key, numValue);
    setValidationErrors((prev) => {
      const next = { ...prev };
      if (validation.valid) {
        delete next[key];
      } else {
        next[key] = validation.message!;
      }
      return next;
    });
    
    setLocalSettings((prev) => {
      const base = prev ?? settings ?? DEFAULT_SETTINGS;
      return { ...base, [key]: numValue };
    });
  }, [settings]);

  const handleSave = useCallback(async () => {
    if (!localSettings) return;
    
    setLocalSaveError(null);
    
    const settingsToValidate = localSettings ?? settings ?? DEFAULT_SETTINGS;
    const rangeValidations = Object.keys(KEY_MAPPING).map((key) =>
      validateRange(key, settingsToValidate)
    );
    
    const invalidRange = rangeValidations.find((v) => !v.valid);
    if (invalidRange) {
      setLocalSaveError(invalidRange.message!);
      return;
    }
    
    if (Object.keys(validationErrors).length > 0) {
      setLocalSaveError("Please fix validation errors before saving");
      return;
    }
    
    try {
      await saveSettings(localSettings);
      logActivity("settings_change", "Updated sensor thresholds", "Settings");
    } catch {
      setLocalSaveError("Failed to save settings");
    }
  }, [localSettings, settings, saveSettings, validationErrors, logActivity]);

  const toggleSound = useCallback(() => {
    const newValue = !soundEnabled;
    setSoundEnabledTrigger(prev => prev + 1);
    logActivity("settings_change", newValue ? "Enabled alert sounds" : "Disabled alert sounds", "Settings");
  }, [logActivity, soundEnabled]);

  const handleSoundUpload = useCallback(async (key: string, file: File) => {
    setUploadStatus((prev: Record<string, UploadStatus>) => ({ ...prev, [key]: "uploading" }));
    try {
      await setCustomSoundFromBlob(key, file);
      setUploadStatus((prev: Record<string, UploadStatus>) => ({ ...prev, [key]: "success" }));
      logActivity("settings_change", `Uploaded custom alert sound: ${key}`, "Settings");
      setTimeout(() => {
        setUploadStatus((prev: Record<string, UploadStatus>) => ({ ...prev, [key]: "idle" }));
      }, 2000);
    } catch {
      setUploadStatus((prev: Record<string, UploadStatus>) => ({ ...prev, [key]: "error" }));
      setTimeout(() => {
        setUploadStatus((prev: Record<string, UploadStatus>) => ({ ...prev, [key]: "idle" }));
      }, 3000);
    }
  }, [logActivity]);

  const handleClearSound = useCallback((key: string) => {
    clearCustomSound(key);
    logActivity("settings_change", `Cleared custom alert sound: ${key}`, "Settings");
  }, [logActivity]);

  const soundSettings = [
    { key: "warning", label: "Warning Alert", desc: "Plays when sensor hits min threshold" },
    { key: "critical", label: "Critical Alert", desc: "Plays when sensor exceeds max threshold" },
    { key: "low", label: "Low Alert", desc: "Plays when value drops below minimum" },
    { key: "high", label: "High Alert", desc: "Plays when value exceeds maximum" },
  ];

  const thresholdConfig = useMemo(
    () => getSettingsThresholds(displaySettings),
    [displaySettings]
  );

  const showError = localSaveError || saveError || settingsError;

  if (settingsLoading) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="text-gray-500">Loading settings...</div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {showError && (
        <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg p-3 text-sm">
          {localSaveError || saveError || settingsError}
        </div>
      )}

      <div className="bg-white rounded-xl border border-gray-100 p-5">
        <div className="flex items-center gap-2 mb-4">
          <Settings className="text-gray-600" size={20} />
          <h2 className="mt-0 text-gray-800">Settings</h2>
        </div>
        <p className="text-gray-600 mb-0">
          Configure sensor thresholds. Alerts are logged when values go outside the safe range.
        </p>
      </div>

      <div className="bg-white rounded-xl border border-gray-100 p-4 shadow-sm">
        <div className="flex items-center gap-2 mb-4">
          <AlertTriangle className="text-orange-600" size={18} />
          <div className="text-xs font-bold text-gray-500 uppercase tracking-wide">
            Alert Thresholds
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4">
          {(Object.keys(KEY_MAPPING) as Array<keyof typeof KEY_MAPPING>).map((key) => {
            const threshold = thresholdConfig[key];
            const keys = KEY_MAPPING[key];
            const colors = THRESHOLD_COLORS[key];
            
            return (
              <div
                key={key}
                className={`rounded-lg p-3 border ${colors.bg} ${colors.border}`}
              >
                <div className="text-xs font-semibold uppercase mb-2">
                  {threshold.name}
                  <span className="font-normal text-gray-500 ml-1">({threshold.unit})</span>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-[10px] text-gray-500 mb-0.5">Min</label>
                    <input
                      type="number"
                      step="0.1"
                      value={displaySettings[keys.min] != null ? Number(displaySettings[keys.min]) : threshold.range.min}
                      onChange={(e) => updateSetting(keys.min, e.target.value)}
                      className={`w-full px-2 py-1.5 border rounded text-sm focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent ${
                        validationErrors[keys.min]
                          ? "border-red-500"
                          : "border-gray-200"
                      }`}
                    />
                    {validationErrors[keys.min] && (
                      <div className="text-[10px] text-red-500 mt-1">
                        {validationErrors[keys.min]}
                      </div>
                    )}
                  </div>
                  <div>
                    <label className="block text-[10px] text-gray-500 mb-0.5">Max</label>
                    <input
                      type="number"
                      step="0.1"
                      value={displaySettings[keys.max] != null ? Number(displaySettings[keys.max]) : threshold.range.max}
                      onChange={(e) => updateSetting(keys.max, e.target.value)}
                      className={`w-full px-2 py-1.5 border rounded text-sm focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent ${
                        validationErrors[keys.max]
                          ? "border-red-500"
                          : "border-gray-200"
                      }`}
                    />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-100 p-4 shadow-sm">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Volume2 className="text-purple-600" size={18} />
            <div className="text-xs font-bold text-gray-500 uppercase tracking-wide">
              Alert Sounds
            </div>
          </div>
          <button
            onClick={toggleSound}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              soundEnabled 
                ? "bg-green-100 text-green-700 hover:bg-green-200" 
                : "bg-gray-100 text-gray-600 hover:bg-gray-200"
            }`}
          >
            {soundEnabled ? "Enabled" : "Disabled"}
          </button>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {soundSettings.map(({ key, label, desc }) => {
            const status = uploadStatus[key];
            const hasCustom = hasCustomSound(key);
            
            return (
              <div
                key={key}
                className="rounded-lg p-3 border border-purple-100 bg-purple-50"
              >
                <div className="text-xs font-semibold uppercase mb-1">{label}</div>
                <div className="text-[10px] text-gray-500 mb-2">{desc}</div>
                {hasCustom && (
                  <div className="text-[10px] text-green-600 mb-2 flex items-center gap-1">
                    <Check size={12} /> Custom sound loaded
                  </div>
                )}
                <div className="flex items-center gap-2">
                  <label className="flex-1 flex items-center justify-center gap-1 px-2 py-1.5 bg-purple-600 hover:bg-purple-700 text-white rounded cursor-pointer text-xs font-medium transition-colors">
                    <Upload size={12} />
                    {status === "uploading" ? "Loading..." : "Upload"}
                    <input
                      ref={(el) => {
                        if (el) fileInputRefs[key] = el;
                      }}
                      type="file"
                      accept="audio/*"
                      className="hidden"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) handleSoundUpload(key, file);
                      }}
                    />
                  </label>
                  {hasCustom && (
                    <button
                      onClick={() => handleClearSound(key)}
                      className="flex items-center justify-center p-1.5 bg-red-100 hover:bg-red-200 text-red-600 rounded transition-colors"
                      title="Clear custom sound"
                    >
                      <X size={12} />
                    </button>
                  )}
                </div>
                {status === "success" && (
                  <div className="text-[10px] text-green-600 mt-1">Sound uploaded!</div>
                )}
                {status === "error" && (
                  <div className="text-[10px] text-red-600 mt-1">Upload failed</div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      <div className="flex items-center gap-3">
        <button
          onClick={handleSave}
          disabled={settingsSaving || Object.keys(validationErrors).length > 0}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white rounded-lg text-sm font-medium transition-colors"
        >
          <Save size={16} />
          {settingsSaving ? "Saving..." : "Save Settings"}
        </button>
        {settingsSaved && (
          <span className="text-sm text-green-600 font-medium">Settings saved!</span>
        )}
      </div>
    </div>
  );
}