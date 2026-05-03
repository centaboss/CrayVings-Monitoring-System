import { useState, useCallback, useMemo } from "react";
import { useSensorSettings, useActivityLogger } from "../hooks/useSensors";
import { useAuth } from "../contexts/AuthContext";
import { Settings, Save, AlertTriangle, Lock } from "lucide-react";
import type { SensorSettings } from "../types";
import { DEFAULT_SETTINGS, getSettingsThresholds } from "../types";


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

const SETTINGS_FIELDS: Array<keyof SensorSettings> = [
  "temp_min",
  "temp_max",
  "ph_min",
  "ph_max",
  "water_level_min",
  "water_level_max",
];

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

function hasSettingsChanges(currentSettings: SensorSettings, nextSettings: SensorSettings): boolean {
  return SETTINGS_FIELDS.some((field) => {
    const currentValue = Number(currentSettings[field]);
    const nextValue = Number(nextSettings[field]);
    return !Number.isNaN(currentValue) && !Number.isNaN(nextValue)
      ? currentValue !== nextValue
      : currentSettings[field] !== nextSettings[field];
  });
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
  const { user } = useAuth();
  const logActivity = useActivityLogger();
  const isAdmin = user?.role === "admin";
  
  const [localSettings, setLocalSettings] = useState<SensorSettings | null>(null);
  const [validationErrors, setValidationErrors] = useState<Record<string, string>>({});
  const [localSaveError, setLocalSaveError] = useState<string | null>(null);

  const displaySettings = useMemo(() => {
    return localSettings ?? settings ?? DEFAULT_SETTINGS;
  }, [localSettings, settings]);
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

    if (!hasSettingsChanges(settings ?? DEFAULT_SETTINGS, localSettings)) {
      setLocalSettings(null);
      return;
    }
    
    try {
      await saveSettings(localSettings);
      logActivity("settings_change", "Updated sensor thresholds", "Settings");
    } catch {
      setLocalSaveError("Failed to save settings");
    }
  }, [localSettings, settings, saveSettings, validationErrors, logActivity]);





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
          {!isAdmin && <Lock size={16} className="text-gray-400" />}
        </div>
        <p className="text-gray-600 mb-0">
          {isAdmin
            ? "Configure sensor thresholds. Alerts are logged when values go outside the safe range."
            : "View sensor thresholds. Only administrators can modify these settings."}
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
                      disabled={!isAdmin}
                      value={displaySettings[keys.min] != null ? Number(displaySettings[keys.min]) : threshold.range.min}
                      onChange={(e) => updateSetting(keys.min, e.target.value)}
                      className={`w-full px-2 py-1.5 border rounded text-sm focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent ${
                        !isAdmin
                          ? "bg-gray-100 text-gray-500 cursor-not-allowed border-gray-200"
                          : validationErrors[keys.min]
                          ? "border-red-500"
                          : "border-gray-200"
                      }`}
                    />
                    {validationErrors[keys.min] && isAdmin && (
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
                      disabled={!isAdmin}
                      value={displaySettings[keys.max] != null ? Number(displaySettings[keys.max]) : threshold.range.max}
                      onChange={(e) => updateSetting(keys.max, e.target.value)}
                      className={`w-full px-2 py-1.5 border rounded text-sm focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent ${
                        !isAdmin
                          ? "bg-gray-100 text-gray-500 cursor-not-allowed border-gray-200"
                          : validationErrors[keys.max]
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



      <div className="flex items-center gap-3">
        {isAdmin ? (
          <button
            onClick={handleSave}
            disabled={settingsSaving || Object.keys(validationErrors).length > 0}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white rounded-lg text-sm font-medium transition-colors"
          >
            <Save size={16} />
            {settingsSaving ? "Saving..." : "Save Settings"}
          </button>
        ) : (
          <div className="flex items-center gap-2 px-4 py-2 bg-gray-100 text-gray-400 rounded-lg text-sm font-medium cursor-not-allowed">
            <Lock size={16} />
            Admin Access Required
          </div>
        )}
        {settingsSaved && isAdmin && (
          <span className="text-sm text-green-600 font-medium">Settings saved!</span>
        )}
      </div>
    </div>
  );
}
