# Fix: ESP32 Ghost Connected State

## Root Cause
`SensorProvider.tsx:106` used `new Date()` (API poll time) instead of `latest.timestamp` (actual sensor data time) for `lastUpdate`. This meant the connection always appeared "online" as long as the backend server was running — even if the ESP32 had been offline for hours. The dashboard was tracking when it last *asked* the server, not when the ESP32 last *sent* data.

## Fix
1. Changed `const now = new Date()` to `const sensorTime = new Date(latest.timestamp)` so `lastUpdate` reflects the actual sensor data timestamp.
2. Added stale data detection: when the sensor data is older than `OFFLINE_THRESHOLD` (15s), the `error` state is set, causing all pages to show their error UI (same as when the server is down).
3. Added a null check: `if (latest && latest.timestamp)` to handle missing timestamps safely.

## Files Modified
- `src/contexts/SensorProvider.tsx` - Lines 104-118
