# SMS Configuration How-To Guide

This guide explains how to customize all SMS features in the CRAYvings Monitoring System.

## Quick Reference

| What you want to change | Where to edit |
|------------------------|---------------|
| Warning SMS message | `server.cjs` → `SMS_CONFIG.messages.warning` (line ~45) |
| Critical SMS message | `server.cjs` → `SMS_CONFIG.messages.critical` (line ~52) |
| Hourly update message | `server.cjs` → `SMS_CONFIG.messages.hourlyUpdate` (line ~60) |
| Sensor display names | `server.cjs` → `SMS_CONFIG.sensorNames` (line ~72) |
| Recipient phone numbers | Database: `authorized_recipients` table OR Settings page in dashboard |
| Alert thresholds | Settings page in dashboard OR database `sensor_settings` table |
| Hourly update interval | `.env` file → `HOURLY_SMS_INTERVAL_MS` |
| Enable/disable hourly updates | `.env` file → `HOURLY_SMS_ENABLED` |
| SMS cooldown periods | `.env` file → `SMS_COOLDOWN_MS`, `WARNING_SMS_COOLDOWN_MS` |

---

## 1. How to Change SMS Message Content

### Warning Alert Message

Edit `SMS_CONFIG.messages.warning` in `server.cjs` (around line 45):

```javascript
warning: "⚠️ {{SENSOR}} WARNING\n" +
         "Recipient: {{NAME}}\n" +
         "Reading: {{VALUE}}{{UNIT}}\n" +
         "Threshold: {{THRESHOLD}}{{UNIT}}\n" +
         "Time: {{TIME}}\n" +
         "Status: Warning - Please check soon",
```

**Available placeholders:**
- `{{SENSOR}}` - Sensor name (e.g., "TEMPERATURE", "PH LEVEL")
- `{{NAME}}` - Recipient's name
- `{{VALUE}}` - Current sensor reading
- `{{UNIT}}` - Unit (°C, %, or empty for pH)
- `{{THRESHOLD}}` - Threshold value that was crossed
- `{{TIME}}` - Timestamp in Philippines timezone

### Critical Alert Message

Edit `SMS_CONFIG.messages.critical` in `server.cjs` (around line 52):

```javascript
critical: "🚨 {{SENSOR}} CRITICAL ALERT\n" +
          "Recipient: {{NAME}}\n" +
          "Reading: {{VALUE}}{{UNIT}}\n" +
          "Threshold: {{THRESHOLD}}{{UNIT}}\n" +
          "Time: {{TIME}}\n" +
          "Status: CRITICAL - Immediate action required!",
```

### Hourly Update Message

Edit `SMS_CONFIG.messages.hourlyUpdate` in `server.cjs` (around line 60):

```javascript
hourlyUpdate: "📊 CRAYVINGS HOURLY UPDATE\n" +
              "Time: {{TIME}}\n" +
              "Temperature: {{TEMP}}°C ({{TEMP_STATUS}})\n" +
              "pH Level: {{PH}} ({{PH_STATUS}})\n" +
              "Water Level: {{WATER}}% ({{WATER_STATUS}})\n" +
              "{{SUMMARY}}"
```

**Additional placeholders for hourly update:**
- `{{TEMP}}` - Temperature reading
- `{{TEMP_STATUS}}` - Temperature status with emoji (✅ Good, ⚠️ Warning, 🚨 Critical)
- `{{PH}}` - pH reading
- `{{PH_STATUS}}` - pH status
- `{{WATER}}` - Water level reading
- `{{WATER_STATUS}}` - Water level status
- `{{SUMMARY}}` - Summary text (e.g., "All systems normal ✅")

---

## 2. How to Change Recipient Phone Numbers

### Option A: Using the Dashboard (Recommended)

1. Login as admin
2. Go to **Settings** → **SMS Recipients**
3. Click **Add Recipient** to add new numbers
4. Use the **Edit** button to change existing numbers
5. Use **Delete** to remove numbers

### Option B: Using Database (Advanced)

Connect to PostgreSQL and run:

```sql
-- Add new recipient
INSERT INTO authorized_recipients (phone_number, name, is_active)
VALUES ('+639123456789', 'John Doe', true);

-- Update existing recipient's phone number
UPDATE authorized_recipients
SET phone_number = '+639987654321'
WHERE id = 1;

-- Deactivate recipient (stops SMS but keeps history)
UPDATE authorized_recipients
SET is_active = false
WHERE id = 1;
```

**Phone number format:** Must be `+639XXXXXXXX` (Philippines format)

---

## 3. How to Change Alert Names/Titles

Edit `SMS_CONFIG.sensorNames` in `server.cjs` (around line 72):

```javascript
sensorNames: {
  "Temperature": "TEMPERATURE",
  "pH Level": "PH LEVEL",
  "Water Level": "WATER LEVEL"
}
```

Change the values (right side) to customize what appears in SMS messages.

---

## 4. How to Adjust the Hourly Interval

### Option A: Using `.env` file (Recommended)

Add or edit in your `.env` file:

```bash
# Send hourly update every 2 hours (in milliseconds)
HOURLY_SMS_INTERVAL_MS=7200000

# Or every 30 minutes
HOURLY_SMS_INTERVAL_MS=1800000

# Or every 1 hour (default)
HOURLY_SMS_INTERVAL_MS=3600000
```

### Option B: Change the default in `server.cjs`

Edit `SMS_CONFIG.hourly.intervalMs` (around line 82):

```javascript
hourly: {
  enabled: process.env.HOURLY_SMS_ENABLED !== 'false',
  // Change this default value (in milliseconds)
  intervalMs: process.env.HOURLY_SMS_INTERVAL_MS
    ? parseInt(process.env.HOURLY_SMS_INTERVAL_MS)
    : 60 * 60 * 1000  // Default: 1 hour
}
```

**Common intervals:**
- 30 minutes = 1800000
- 1 hour = 3600000
- 2 hours = 7200000
- 6 hours = 21600000

---

## 5. How to Turn Hourly Updates On/Off

### Using `.env` file (Recommended)

Add or edit in your `.env` file:

```bash
# Disable hourly updates
HOURLY_SMS_ENABLED=false

# Enable hourly updates (default)
HOURLY_SMS_ENABLED=true
```

### Using Dashboard (if feature added)

Currently, you must use the `.env` file. Restart the server after changing.

---

## 6. How to Customize SMS Sender Name

Edit `SMS_CONFIG.from` in `server.cjs` (around line 92):

```javascript
from: "CRAYVINGS"  // Change this to your preferred sender name (max 11 characters)
```

---

## 7. How to Change SMS Cooldown Periods

Add or edit in your `.env` file:

```bash
# Critical alert cooldown (default: 5 minutes = 300000)
SMS_COOLDOWN_MS=300000

# Warning alert cooldown (default: 1 hour = 3600000)
WARNING_SMS_COOLDOWN_MS=3600000
```

This prevents spam if a sensor stays in warning/critical state.

---

## Troubleshooting

### SMS not sending?

1. Check SkySMS API key is set in `.env`:
   ```bash
   SKYSMS_API_KEY=your_actual_key_here
   ```

2. Check for active recipients:
   ```sql
   SELECT * FROM authorized_recipients WHERE is_active = true;
   ```

3. Check SMS logs:
   ```sql
   SELECT * FROM sms_logs ORDER BY sent_at DESC LIMIT 10;
   ```

### Want different messages for each sensor?

Currently, one template is used for all sensors of the same severity. To customize per sensor, modify the SMS sending code in the `for (const sensor of sensorChecks)` loop (around line 420 in `server.cjs`).

---

## Example Custom Configuration

Here's an example of a fully customized `.env`:

```bash
# Server
PORT=3000

# Database
PG_HOST=localhost
PG_PORT=5432
PG_DATABASE=crayvings_monitoring_system_db
PG_USER=postgres
PG_PASSWORD=your_password

# SkySMS
SKYSMS_API_KEY=your_skysms_api_key_here
SKYSMS_API_URL=https://skysms.skyio.site/api/v1

# SMS Cooldowns
SMS_COOLDOWN_MS=300000        # 5 min cooldown for critical
WARNING_SMS_COOLDOWN_MS=3600000 # 1 hour cooldown for warning

# Hourly Updates
HOURLY_SMS_ENABLED=true
HOURLY_SMS_INTERVAL_MS=3600000  # Every 1 hour
```
