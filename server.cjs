const express = require("express");
const cors = require("cors");
const axios = require("axios");
const { Pool } = require("pg");
const { z } = require("zod");
const crypto = require("crypto");
require("dotenv").config();

const app = express();
const PORT = process.env.PORT || 3000;

const pool = new Pool({
  host: process.env.PG_HOST,
  port: parseInt(process.env.PG_PORT),
  database: process.env.PG_DATABASE,
  user: process.env.PG_USER,
  password: process.env.PG_PASSWORD,
});

app.use(cors());
app.use(express.json());

// =============================================================================
// Password hashing
// =============================================================================
function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.pbkdf2Sync(password, salt, 10000, 64, "sha512").toString("hex");
  return `${salt}:${hash}`;
}

function verifyPassword(password, stored) {
  const [salt, hash] = stored.split(":");
  const verifyHash = crypto.pbkdf2Sync(password, salt, 10000, 64, "sha512").toString("hex");
  return hash === verifyHash;
}

function generateToken() {
  return crypto.randomBytes(32).toString("hex");
}

// =============================================================================
// Auth middleware
// =============================================================================
function requireAdmin(req, res, next) {
  const token = req.headers.authorization?.replace("Bearer ", "");
  if (!token) return res.status(401).json({ message: "Authentication required" });

  pool.query("SELECT * FROM users WHERE token = $1", [token])
    .then(result => {
      if (result.rows.length === 0) return res.status(403).json({ message: "Invalid token" });
      const user = result.rows[0];
      if (user.role !== "admin") return res.status(403).json({ message: "Admin access required" });
      req.adminUser = user;
      next();
    })
    .catch(err => res.status(500).json({ message: "Auth error", error: err.message }));
}

function requireAuth(req, res, next) {
  const token = req.headers.authorization?.replace("Bearer ", "");
  if (!token) return res.status(401).json({ message: "Authentication required" });

  pool.query("SELECT * FROM users WHERE token = $1", [token])
    .then(result => {
      if (result.rows.length === 0) return res.status(403).json({ message: "Invalid token" });
      req.user = result.rows[0];
      next();
    })
    .catch(err => res.status(500).json({ message: "Auth error", error: err.message }));
}

// =============================================================================
// Helper: detect changed fields
// =============================================================================
function getChangedFields(current, updates) {
  const changes = {};
  for (const key of Object.keys(updates)) {
    if (String(current[key] ?? "") !== String(updates[key] ?? "")) {
      changes[key] = updates[key];
    }
  }
  return changes;
}

// =============================================================================
// Helper: update only if fields actually changed
// =============================================================================
async function updateOnlyIfChanged(client, { table, keyColumn, keyValue, currentRow, updates, touchUpdatedAt }) {
  const changes = getChangedFields(currentRow, updates);
  if (Object.keys(changes).length === 0) {
    return { changed: false, row: currentRow };
  }
  if (touchUpdatedAt) changes.updated_at = new Date();
  const keys = Object.keys(changes);
  const values = Object.values(changes);
  const setClauses = keys.map((k, i) => `${k} = $${i + 1}`).join(", ");
  const result = await client.query(
    `UPDATE ${table} SET ${setClauses} WHERE ${keyColumn} = $${keys.length + 1} RETURNING *`,
    [...values, keyValue]
  );
  return { changed: true, row: result.rows[0] };
}

// =============================================================================
// Threshold status
// =============================================================================
function getThresholdStatus(value, min, max) {
  const rangeSize = max - min;
  const criticalMargin = rangeSize * 0.15;
  if (value < min) {
    const deviation = min - value;
    return deviation >= criticalMargin ? "critical" : "warning";
  }
  if (value > max) {
    const deviation = value - max;
    return deviation >= criticalMargin ? "critical" : "warning";
  }
  return "good";
}

// =============================================================================
// SMS helpers
// =============================================================================
const SKYSMS_API_KEY = process.env.SKYSMS_API_KEY;
const SKYSMS_API_URL = process.env.SKYSMS_API_URL || "https://skysms.skyio.site/api/v1";

const SMS_CONFIG = {
  messages: {
    warning: "⚠️ {{SENSOR}} WARNING\nRecipient: {{NAME}}\nReading: {{VALUE}}{{UNIT}}\nThreshold: {{THRESHOLD}}{{UNIT}}\nTime: {{TIME}}\nStatus: Warning",
    critical: "🚨 {{SENSOR}} CRITICAL ALERT\nRecipient: {{NAME}}\nReading: {{VALUE}}{{UNIT}}\nThreshold: {{THRESHOLD}}{{UNIT}}\nTime: {{TIME}}\nStatus: CRITICAL",
    hourlyUpdate: "📊 CRAYVINGS HOURLY UPDATE\nTime: {{TIME}}\nTemperature: {{TEMP}}°C ({{TEMP_STATUS}})\npH Level: {{PH}} ({{PH_STATUS}})\nWater Level: {{WATER}}% ({{WATER_STATUS}})\n{{SUMMARY}}"
  },
  sensorNames: { "Temperature": "TEMPERATURE", "pH Level": "PH LEVEL", "Water Level": "WATER LEVEL" },
  units: { "Temperature": "°C", "pH Level": "pH", "Water Level": "%" },
  hourly: {
    enabled: process.env.HOURLY_SMS_ENABLED !== "false",
    intervalMs: parseInt(process.env.HOURLY_SMS_INTERVAL_MS) || 3600000
  },
  cooldown: {
    warning: parseInt(process.env.WARNING_SMS_COOLDOWN_MS) || 3600000,
    critical: parseInt(process.env.SMS_COOLDOWN_MS) || 300000
  },
  retry: { maxRetries: 2, baseDelayMs: 2000 },
  from: "CRAYVINGS"
};

function buildMessage(template, data) {
  let message = template;
  for (const [key, value] of Object.entries(data)) {
    message = message.replace(new RegExp(`{{${key}}}`, "g"), String(value));
  }
  return message;
}

function getStatusText(status) {
  switch (status) {
    case "good": return "✅ Good";
    case "warning": return "⚠️ Warning";
    case "critical": return "🚨 Critical";
    default: return "Unknown";
  }
}

async function sendSingleSMS(phoneNumber, message) {
  const { maxRetries, baseDelayMs } = SMS_CONFIG.retry;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      if (!SKYSMS_API_KEY || !SKYSMS_API_URL) {
        console.error("SkySMS configuration missing in .env");
        await logSMS(phoneNumber, message, "failed", "Missing SkySMS config", null);
        return false;
      }
      const response = await axios.post(
        `${SKYSMS_API_URL}/sms/send`,
        { phone_number: phoneNumber, message, from: SMS_CONFIG.from },
        { headers: { "X-API-Key": SKYSMS_API_KEY, "Content-Type": "application/json" }, timeout: 10000 }
      );
      console.log(`✅ SMS sent to ${phoneNumber} (attempt ${attempt + 1})`);
      await logSMS(phoneNumber, message, "sent", null, response.data?.id);
      return true;
    } catch (error) {
      const errorMessage = error.response?.data?.message || error.message;
      console.error(`❌ Failed to send SMS to ${phoneNumber} (attempt ${attempt + 1}/${maxRetries + 1}): ${errorMessage}`);
      if (attempt === maxRetries) {
        await logSMS(phoneNumber, message, "failed", errorMessage, null);
        return false;
      }
      await new Promise(resolve => setTimeout(resolve, baseDelayMs * Math.pow(2, attempt)));
    }
  }
  return false;
}

async function logSMS(phone, message, status, error, smsId = null) {
  try {
    await pool.query(
      `INSERT INTO sms_logs (recipient_phone, message, status, error_message, sms_id, sent_at) VALUES ($1, $2, $3, $4, $5, NOW())`,
      [phone, message, status, error || null, smsId || null]
    );
  } catch (logErr) {
    console.error("Failed to log SMS:", logErr.message);
  }
}

let lastAlertedState = {};
let smsMuteUntil = null;

// =============================================================================
// ROUTES
// =============================================================================

// Health check
app.get("/health", (req, res) => {
  res.json({ status: "ok", serverTime: new Date().toISOString() });
});

// Root
app.get("/", (req, res) => {
  res.json({ message: "CRAYvings Monitoring System API", status: "running" });
});

// POST /sensor (ESP32)
app.post("/sensor", async (req, res) => {
  try {
    const { device_id, temperature, water_level, ph } = req.body;
    if (!device_id) return res.status(400).json({ message: "device_id is required" });

    const ts = new Date();
    const result = await pool.query(
      `INSERT INTO sensors (device_id, temperature, water_level, ph, timestamp) VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [device_id, Number(temperature ?? 0), Number(water_level ?? 0), Number(ph ?? 0), ts]
    );
    console.log(`[${new Date().toISOString()}] Sensor data saved from ${device_id}`);

    // Check thresholds and send alerts
    const settingsResult = await pool.query("SELECT * FROM sensor_settings LIMIT 1");
    const settings = settingsResult.rows[0] || { temp_min: 20, temp_max: 31, ph_min: 6.5, ph_max: 8.5, water_level_min: 10, water_level_max: 100 };

    const sensorChecks = [
      { key: "Temperature", val: Number(temperature), min: Number(settings.temp_min), max: Number(settings.temp_max) },
      { key: "pH Level", val: Number(ph), min: Number(settings.ph_min), max: Number(settings.ph_max) },
      { key: "Water Level", val: Number(water_level), min: Number(settings.water_level_min), max: Number(settings.water_level_max) },
    ];

    const nowTs = ts.getTime();
    const hourlyEnabled = SMS_CONFIG.hourly.enabled;
    if (hourlyEnabled && !global.lastHourlyUpdateTs) global.lastHourlyUpdateTs = nowTs;

    for (const sensor of sensorChecks) {
      if (sensor.val === 0 && sensor.key !== "Water Level") continue;
      const status = getThresholdStatus(sensor.val, sensor.min, sensor.max);
      const last = lastAlertedState[sensor.key] || {};
      const lastTs = last.timestamp ? new Date(last.timestamp).getTime() : 0;

      if (status === "good") {
        if (last.status && last.status !== "good") {
          await pool.query(
            `INSERT INTO last_alerts (sensor_key, status, value, timestamp) VALUES ($1, $2, $3, $4) ON CONFLICT (sensor_key) DO UPDATE SET status = $2, value = $3, timestamp = $4`,
            [sensor.key, "good", sensor.val, ts.toISOString()]
          );
          lastAlertedState[sensor.key] = { status: "good", value: sensor.val, timestamp: ts.toISOString() };
        }
        continue;
      }

      const interval = status === "critical" ? SMS_CONFIG.cooldown.critical : SMS_CONFIG.cooldown.warning;
      if (status === last.status && nowTs - lastTs < interval) continue;

      const direction = sensor.val < sensor.min ? "Low" : "High";
      await pool.query(`INSERT INTO system_logs (action, parameter, old_value, new_value) VALUES ($1, $2, $3, $4)`,
        ["Alert", sensor.key, direction, sensor.val]);

      await pool.query(
        `INSERT INTO last_alerts (sensor_key, status, value, timestamp) VALUES ($1, $2, $3, $4) ON CONFLICT (sensor_key) DO UPDATE SET status = $2, value = $3, timestamp = $4`,
        [sensor.key, status, sensor.val, ts.toISOString()]
      );
      lastAlertedState[sensor.key] = { status, value: sensor.val, timestamp: ts.toISOString() };

      const recipients = await pool.query("SELECT phone_number, name FROM authorized_recipients WHERE is_active = true");
      if (recipients.rows.length > 0) {
        const isCritical = status === "critical";
        const template = isCritical ? SMS_CONFIG.messages.critical : SMS_CONFIG.messages.warning;
        const timestamp = ts.toLocaleString("en-PH", { timeZone: "Asia/Manila", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: true });
        for (const r of recipients.rows) {
          const message = buildMessage(template, {
            SENSOR: SMS_CONFIG.sensorNames[sensor.key] || sensor.key,
            NAME: r.name || "User", VALUE: sensor.val, UNIT: SMS_CONFIG.units[sensor.key] || "",
            THRESHOLD: direction === "Low" ? sensor.min : sensor.max, TIME: timestamp
          });
          await sendSingleSMS(r.phone_number, message);
        }
      }
    }

    res.status(201).json({ message: "Saved", data: result.rows[0] });
  } catch (err) {
    console.error(`[${new Date().toISOString()}] Error saving sensor:`, err.message);
    res.status(500).json({ message: "Error saving data", error: err.message });
  }
});

// GET /sensor (history)
app.get("/sensor", async (req, res) => {
  try {
    const limit = Math.min(1000, Math.max(1, parseInt(req.query.limit) || 300));
    const result = await pool.query("SELECT * FROM sensors ORDER BY timestamp DESC LIMIT $1", [limit]);
    res.json(result.rows);
  } catch (err) {
    console.error(`[${new Date().toISOString()}] Error fetching sensors:`, err.message);
    res.status(500).json({ message: "Error fetching data", error: err.message });
  }
});

// GET /sensor/latest
app.get("/sensor/latest", async (req, res) => {
  try {
    const result = await pool.query("SELECT * FROM sensors ORDER BY timestamp DESC LIMIT 1");
    if (result.rows.length === 0) return res.status(404).json({ message: "No sensor data found" });
    res.json(result.rows[0]);
  } catch (err) {
    console.error(`[${new Date().toISOString()}] Error fetching latest:`, err.message);
    res.status(500).json({ message: "Error", error: err.message });
  }
});

// POST /auth/login
app.post("/auth/login", async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) return res.status(400).json({ message: "Username and password required" });

    const result = await pool.query("SELECT * FROM users WHERE username = $1", [username]);
    if (result.rows.length === 0) return res.status(401).json({ message: "Invalid credentials" });

    const user = result.rows[0];
    if (!verifyPassword(password, user.password_hash)) return res.status(401).json({ message: "Invalid credentials" });

    const token = generateToken();
    await pool.query("UPDATE users SET token = $1 WHERE id = $2", [token, user.id]);

    res.json({
      message: "Login successful",
      user: { id: user.id, username: user.username, email: user.email, role: user.role, name: user.name },
      token
    });
  } catch (err) {
    console.error(`[${new Date().toISOString()}] Login error:`, err.message);
    res.status(500).json({ message: "Login failed", error: err.message });
  }
});

// GET /auth/users
app.get("/auth/users", requireAdmin, async (req, res) => {
  try {
    const result = await pool.query("SELECT id, name, username, email, role, created_at FROM users ORDER BY created_at DESC");
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ message: "Error fetching users", error: err.message });
  }
});

// POST /auth/users
app.post("/auth/users", requireAdmin, async (req, res) => {
  try {
    const { name, username, email, password, role } = req.body;
    if (!name || !username || !email || !password) return res.status(400).json({ message: "All fields required" });

    const passwordHash = hashPassword(password);
    const result = await pool.query(
      `INSERT INTO users (name, username, email, password_hash, role) VALUES ($1, $2, $3, $4, $5) RETURNING id, name, username, email, role, created_at`,
      [name, username, email, passwordHash, role || "user"]
    );
    res.status(201).json({ message: "User created", data: result.rows[0] });
  } catch (err) {
    if (err.code === "23505") return res.status(409).json({ message: "Username or email already exists" });
    res.status(500).json({ message: "Error creating user", error: err.message });
  }
});

// DELETE /auth/users/:id
app.delete("/auth/users/:id", requireAdmin, async (req, res) => {
  try {
    const result = await pool.query("DELETE FROM users WHERE id = $1 RETURNING username", [req.params.id]);
    if (result.rows.length === 0) return res.status(404).json({ message: "User not found" });
    res.json({ message: "User deleted" });
  } catch (err) {
    res.status(500).json({ message: "Error deleting user", error: err.message });
  }
});

// PUT /auth/users/:id/password
app.put("/auth/users/:id/password", requireAdmin, async (req, res) => {
  try {
    const { newPassword } = req.body;
    if (!newPassword) return res.status(400).json({ message: "New password required" });
    const passwordHash = hashPassword(newPassword);
    await pool.query("UPDATE users SET password_hash = $1 WHERE id = $2", [passwordHash, req.params.id]);
    res.json({ message: "Password updated" });
  } catch (err) {
    res.status(500).json({ message: "Error updating password", error: err.message });
  }
});

// GET /settings
app.get("/settings", async (req, res) => {
  try {
    const result = await pool.query("SELECT * FROM sensor_settings LIMIT 1");
    if (result.rows.length === 0) {
      return res.json({ temp_min: 20, temp_max: 31, ph_min: 6.5, ph_max: 8.5, water_level_min: 10, water_level_max: 100 });
    }
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ message: "Error fetching settings", error: err.message });
  }
});

// POST /settings
app.post("/settings", requireAdmin, async (req, res) => {
  try {
    const { temp_min, temp_max, ph_min, ph_max, water_level_min, water_level_max } = req.body;
    const existing = await pool.query("SELECT * FROM sensor_settings LIMIT 1");
    let savedSettings;
    if (existing.rows.length > 0) {
      const changes = getChangedFields(existing.rows[0], { temp_min, temp_max, ph_min, ph_max, water_level_min, water_level_max });
      if (Object.keys(changes).length === 0) return res.json({ message: "No change", changed: false, data: existing.rows[0] });
      const keys = Object.keys(changes);
      const values = Object.values(changes);
      const setClauses = keys.map((k, i) => `${k} = $${i + 1}`).join(", ");
      const result = await pool.query(`UPDATE sensor_settings SET ${setClauses}, updated_at = NOW() WHERE id = $${keys.length + 1} RETURNING *`, [...values, existing.rows[0].id]);
      savedSettings = result.rows[0];
    } else {
      const result = await pool.query(
        `INSERT INTO sensor_settings (temp_min, temp_max, ph_min, ph_max, water_level_min, water_level_max) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
        [temp_min, temp_max, ph_min, ph_max, water_level_min, water_level_max]
      );
      savedSettings = result.rows[0];
    }
    res.json({ message: "Settings saved", changed: true, data: savedSettings });
  } catch (err) {
    res.status(500).json({ message: "Error saving settings", error: err.message });
  }
});

// POST /settings/reset
app.post("/settings/reset", requireAdmin, async (req, res) => {
  try {
    const defaults = { temp_min: 20, temp_max: 31, ph_min: 6.5, ph_max: 8.5, water_level_min: 10, water_level_max: 100 };
    const existing = await pool.query("SELECT * FROM sensor_settings LIMIT 1");
    let savedSettings;
    if (existing.rows.length > 0) {
      const result = await pool.query(
        `UPDATE sensor_settings SET temp_min=$1, temp_max=$2, ph_min=$3, ph_max=$4, water_level_min=$5, water_level_max=$6, updated_at=NOW() WHERE id=$7 RETURNING *`,
        [defaults.temp_min, defaults.temp_max, defaults.ph_min, defaults.ph_max, defaults.water_level_min, defaults.water_level_max, existing.rows[0].id]
      );
      savedSettings = result.rows[0];
    } else {
      const result = await pool.query(
        `INSERT INTO sensor_settings (temp_min, temp_max, ph_min, ph_max, water_level_min, water_level_max) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
        [defaults.temp_min, defaults.temp_max, defaults.ph_min, defaults.ph_max, defaults.water_level_min, defaults.water_level_max]
      );
      savedSettings = result.rows[0];
    }
    res.json({ message: "Settings reset to defaults", data: savedSettings });
  } catch (err) {
    res.status(500).json({ message: "Error resetting settings", error: err.message });
  }
});

// GET /settings/recipients
app.get("/settings/recipients", requireAdmin, async (req, res) => {
  try {
    const result = await pool.query("SELECT id, phone_number, name, is_active, created_at FROM authorized_recipients ORDER BY created_at DESC");
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch recipients" });
  }
});

// POST /settings/recipients
app.post("/settings/recipients", requireAdmin, async (req, res) => {
  try {
    const { phone_number, name } = req.body;
    if (!/^\+639\d{9}$/.test(phone_number)) return res.status(400).json({ error: "Invalid format: +639XXXXXXXXX" });
    const existing = await pool.query("SELECT * FROM authorized_recipients WHERE phone_number = $1", [phone_number]);
    if (existing.rows.length > 0) return res.status(409).json({ error: "Phone number already exists" });
    const result = await pool.query("INSERT INTO authorized_recipients (phone_number, name) VALUES ($1, $2) RETURNING *", [phone_number, name || "Recipient"]);
    res.status(201).json({ success: true, data: result.rows[0] });
  } catch (err) {
    res.status(500).json({ error: "Failed to add recipient" });
  }
});

// PUT /settings/recipients/:id
app.put("/settings/recipients/:id", requireAdmin, async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const existing = await pool.query("SELECT * FROM authorized_recipients WHERE id = $1", [id]);
    if (existing.rows.length === 0) return res.status(404).json({ error: "Not found" });
    const updates = { name: req.body.name, is_active: req.body.is_active };
    const result = await updateOnlyIfChanged(pool, { table: "authorized_recipients", keyColumn: "id", keyValue: id, currentRow: existing.rows[0], updates: Object.fromEntries(Object.entries(updates).filter(([, v]) => v !== undefined)), touchUpdatedAt: true });
    res.json(result.changed ? { success: true, data: result.row } : { success: true, message: "No change", data: existing.rows[0] });
  } catch (err) {
    res.status(500).json({ error: "Failed to update recipient" });
  }
});

// DELETE /settings/recipients/:id
app.delete("/settings/recipients/:id", requireAdmin, async (req, res) => {
  try {
    const result = await pool.query("DELETE FROM authorized_recipients WHERE id = $1 RETURNING id", [req.params.id]);
    if (result.rows.length === 0) return res.status(404).json({ error: "Not found" });
    res.json({ success: true, message: "Deleted" });
  } catch (err) {
    res.status(500).json({ error: "Failed to delete recipient" });
  }
});

// POST /settings/recipients/test/:id
app.post("/settings/recipients/test/:id", requireAdmin, async (req, res) => {
  try {
    const result = await pool.query("SELECT phone_number, name FROM authorized_recipients WHERE id = $1", [req.params.id]);
    if (result.rows.length === 0) return res.status(404).json({ error: "Not found" });
    const { phone_number, name } = result.rows[0];

    const settingsResult = await pool.query("SELECT * FROM sensor_settings LIMIT 1");
    const settings = settingsResult.rows[0] || { temp_min: 20, temp_max: 31, ph_min: 6.5, ph_max: 8.5, water_level_min: 10, water_level_max: 100 };
    const sensorResult = await pool.query("SELECT * FROM sensors ORDER BY timestamp DESC LIMIT 1");
    const sensor = sensorResult.rows[0] || null;

    const temp = sensor?.temperature ?? "N/A";
    const ph = sensor?.ph ?? "N/A";
    const water = sensor?.water_level ?? "N/A";
    const tempStatus = sensor ? getStatusText(getThresholdStatus(Number(sensor.temperature), Number(settings.temp_min), Number(settings.temp_max))) : "N/A";
    const phStatus = sensor ? getStatusText(getThresholdStatus(Number(sensor.ph), Number(settings.ph_min), Number(settings.ph_max))) : "N/A";
    const waterStatus = sensor ? getStatusText(getThresholdStatus(Number(sensor.water_level), Number(settings.water_level_min), Number(settings.water_level_max))) : "N/A";
    const timestamp = new Date().toLocaleString("en-PH", { timeZone: "Asia/Manila", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: true });
    const summary = (tempStatus === "✅ Good" && phStatus === "✅ Good" && waterStatus === "✅ Good") ? "All systems normal" : "Some parameters need attention";
    const testMessage = `📊 CRAYVINGS LIVE READINGS (TEST)\nTime: ${timestamp}\nTemperature: ${temp}°C (${tempStatus})\npH Level: ${ph} (${phStatus})\nWater Level: ${water}% (${waterStatus})\n${summary}\n(This is a test message)`;

    await sendSingleSMS(phone_number, testMessage);
    res.json({ success: true, message: "Test SMS sent" });
  } catch (err) {
    res.status(500).json({ error: "Failed to send test SMS" });
  }
});

// POST /logs
app.post("/logs", async (req, res) => {
  try {
    const { action, parameter, old_value, new_value } = req.body;
    if (!action || !parameter) return res.status(400).json({ message: "action and parameter required" });
    const result = await pool.query(
      "INSERT INTO system_logs (action, parameter, old_value, new_value) VALUES ($1, $2, $3, $4) RETURNING *",
      [action, parameter, String(old_value ?? ""), String(new_value ?? "")]
    );
    res.status(201).json({ message: "Logged", data: result.rows[0] });
  } catch (err) {
    res.status(500).json({ message: "Error logging", error: err.message });
  }
});

// GET /system-logs
app.get("/system-logs", async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 20));
    const offset = (page - 1) * limit;
    const result = await pool.query("SELECT * FROM system_logs ORDER BY timestamp DESC LIMIT $1 OFFSET $2", [limit, offset]);
    const countResult = await pool.query("SELECT COUNT(*) FROM system_logs");
    res.json({ data: result.rows, total: parseInt(countResult.rows[0].count), page, limit });
  } catch (err) {
    res.status(500).json({ message: "Error fetching logs", error: err.message });
  }
});

// POST /alert/device-disconnect
app.post('/alert/device-disconnect', async (req, res) => {
  try {
    const { event_type, description, consecutive_failures } = req.body;
    const recipients = await pool.query('SELECT phone_number, name FROM authorized_recipients WHERE is_active = true');
    if (recipients.rows.length === 0) return res.status(200).json({ message: 'No active recipients', sent: 0 });

    if (smsMuteUntil && new Date() < new Date(smsMuteUntil)) {
      console.log('[' + new Date().toISOString() + '] SMS alerts muted until ' + smsMuteUntil + ', skipping disconnect alert');
      await pool.query('INSERT INTO system_logs (action, parameter, old_value, new_value) VALUES ($1, $2, $3, $4)', ['Device Disconnect Muted', 'ESP32', String(consecutive_failures || 0), 'Muted until ' + smsMuteUntil]);
      return res.json({ message: 'SMS alerts muted', sent: 0, total: recipients.rows.length, muted: true, muteExpires: smsMuteUntil });
    }

    const timestamp = new Date().toLocaleString('en-PH', { timeZone: 'Asia/Manila', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: true });
    const message = 'CRAYVINGS DEVICE ALERT\nESP32 device disconnected\n' + (description || 'No data received for 15+ seconds') + '\nFailed polls: ' + (consecutive_failures || 0) + '\nTime: ' + timestamp;

    let sent = 0;
    for (const r of recipients.rows) {
      const success = await sendSingleSMS(r.phone_number, message);
      if (success) sent++;
    }

    await pool.query('INSERT INTO system_logs (action, parameter, old_value, new_value) VALUES ($1, $2, $3, $4)', ['Device Disconnect', 'ESP32', String(consecutive_failures || 0), description || '']);
    res.json({ message: 'Disconnect alerts sent', sent, total: recipients.rows.length });
  } catch (err) {
    console.error('[' + new Date().toISOString() + '] Error sending disconnect alert:', err.message);
    res.status(500).json({ message: 'Error sending disconnect alert', error: err.message });
  }
});

// POST /alert/mute
app.post('/alert/mute', async (req, res) => {
  try {
    const { hours } = req.body;
    if (!hours || typeof hours !== 'number' || hours <= 0) {
      smsMuteUntil = null;
      console.log('[' + new Date().toISOString() + '] SMS alerts unmuted');
      return res.json({ message: 'SMS alerts unmuted', muted: false, muteExpires: null });
    }

    smsMuteUntil = new Date(Date.now() + hours * 60 * 60 * 1000).toISOString();
    console.log('[' + new Date().toISOString() + '] SMS alerts muted for ' + hours + ' hours until ' + smsMuteUntil);

    await pool.query('INSERT INTO system_logs (action, parameter, old_value, new_value) VALUES ($1, $2, $3, $4)', ['SMS Muted', 'Alerts', String(hours) + 'h', 'Until ' + smsMuteUntil]);
    res.json({ message: 'SMS alerts muted for ' + hours + ' hours', muted: true, muteExpires: smsMuteUntil });
  } catch (err) {
    console.error('[' + new Date().toISOString() + '] Error setting mute:', err.message);
    res.status(500).json({ message: 'Error setting mute', error: err.message });
  }
});

// GET /alert/mute-status
app.get('/alert/mute-status', async (req, res) => {
  try {
    if (smsMuteUntil && new Date() < new Date(smsMuteUntil)) {
      return res.json({ muted: true, muteExpires: smsMuteUntil });
    }
    if (smsMuteUntil && new Date() >= new Date(smsMuteUntil)) {
      smsMuteUntil = null;
    }
    res.json({ muted: false, muteExpires: null });
  } catch (err) {
    res.status(500).json({ message: 'Error checking mute status', error: err.message });
  }
});

// POST /activity-logs
app.post("/activity-logs", async (req, res) => {
  try {
    const { user_name, action_type, description, module } = req.body;
    if (!action_type) return res.status(400).json({ message: "action_type required" });
    const result = await pool.query(
      "INSERT INTO activity_logs (user_name, action_type, description, module) VALUES ($1, $2, $3, $4) RETURNING *",
      [user_name || "Admin", action_type, description || "", module || ""]
    );
    res.status(201).json({ message: "Logged", data: result.rows[0] });
  } catch (err) {
    res.status(500).json({ message: "Error logging activity", error: err.message });
  }
});

// GET /activity-logs
app.get("/activity-logs", async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = 20;
    const offset = (page - 1) * limit;
    const search = req.query.search || "";
    const sortBy = req.query.sortBy === "oldest" ? "ASC" : "DESC";
    const actionType = req.query.actionType || "";

    let where = [];
    let params = [];
    let paramCount = 1;
    if (search) { where.push(`(description ILIKE $${paramCount} OR user_name ILIKE $${paramCount})`); params.push(`%${search}%`); paramCount++; }
    if (actionType) { where.push(`action_type = $${paramCount}`); params.push(actionType); paramCount++; }
    const whereClause = where.length > 0 ? `WHERE ${where.join(" AND ")}` : "";

    const result = await pool.query(
      `SELECT * FROM activity_logs ${whereClause} ORDER BY timestamp ${sortBy} LIMIT $${paramCount} OFFSET $${paramCount + 1}`,
      [...params, limit, offset]
    );
    const countResult = await pool.query(`SELECT COUNT(*) FROM activity_logs ${whereClause}`, params);
    const total = parseInt(countResult.rows[0].count);
    res.json({ data: result.rows, total, page, limit, totalPages: Math.ceil(total / limit) });
  } catch (err) {
    res.status(500).json({ message: "Error fetching activity logs", error: err.message });
  }
});

// =============================================================================
// Startup
// =============================================================================
async function startServer() {
  try {
    const client = await pool.connect();
    try {
      console.log(`[${new Date().toISOString()}] PostgreSQL connected`);

      const adminExists = await client.query("SELECT id, password_hash FROM users WHERE username = $1", ["admin"]);
      if (adminExists.rows.length === 0) {
        const adminPassword = hashPassword("Admin@123");
        await client.query(
          `INSERT INTO users (name, username, email, password_hash, role) VALUES ('Administrator', 'admin', 'admin@crayvings.com', $1, 'admin')`,
          [adminPassword]
        );
        console.log(`[${new Date().toISOString()}] Default admin account created (admin / Admin@123)`);
      } else {
        const storedHash = adminExists.rows[0].password_hash;
        if (verifyPassword("Admin@123", storedHash)) {
          console.log(`[${new Date().toISOString()}] Admin account verified`);
        } else {
          console.log(`[${new Date().toISOString()}] Admin account exists with custom password`);
        }
      }

      const lastAlertsResult = await client.query("SELECT * FROM last_alerts");
      lastAlertedState = {};
      for (const row of lastAlertsResult.rows) {
        lastAlertedState[row.sensor_key] = { status: row.status, value: parseFloat(row.value), timestamp: row.timestamp?.toISOString() };
      }
      console.log(`[${new Date().toISOString()}] Loaded ${lastAlertsResult.rows.length} alert states from DB`);

      if (!process.env.SKYSMS_API_KEY) {
        console.warn(`[${new Date().toISOString()}] WARNING: SKYSMS_API_KEY not set. SMS alerts will fail.`);
      } else {
        console.log(`[${new Date().toISOString()}] SkySMS configured`);
      }
    } finally {
      client.release();
    }

    app.listen(PORT, "0.0.0.0", () => {
      console.log(`[${new Date().toISOString()}] Server running on http://0.0.0.0:${PORT}`);
    });
  } catch (err) {
    console.error(`[${new Date().toISOString()}] Server startup error:`, err.message);
    process.exit(1);
  }
}

startServer();

process.on("unhandledRejection", (reason) => {
  console.error(`[${new Date().toISOString()}] Unhandled rejection:`, reason);
});

process.on("uncaughtException", (err) => {
  console.error(`[${new Date().toISOString()}] Uncaught exception:`, err.message);
  process.exit(1);
});
