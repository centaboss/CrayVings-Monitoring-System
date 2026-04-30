const express = require("express");
const cors = require("cors");
const axios = require("axios");
const { Pool } = require("pg");
const { z } = require("zod");
require("dotenv").config();

const app = express();
const PORT = process.env.PORT || 3000;

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

// SkySMS API helpers
const SKYSMS_API_KEY = process.env.SKYSMS_API_KEY;
const SKYSMS_API_URL = process.env.SKYSMS_API_URL || "https://skysms.skyio.site/api/v1";

async function sendSingleSMS(phoneNumber, message) {
  const maxRetries = 1;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      if (!SKYSMS_API_KEY || !SKYSMS_API_URL) {
        console.error("SkySMS configuration missing in .env");
        await logSMS(phoneNumber, message, "failed", "Missing SkySMS config", null);
        return;
      }
      const response = await axios.post(
        `${SKYSMS_API_URL}/sms/send`,
        { phone_number: phoneNumber, message, from: "CRAYVINGS WATER MONITORING SYSTEM" },
        {
          headers: {
            "X-API-Key": SKYSMS_API_KEY,
            "Content-Type": "application/json",
          },
        }
      );
      console.log(`✅ SMS sent to ${phoneNumber}`);
      await logSMS(phoneNumber, message, "sent", null, response.data?.id);
      return response.data;
    } catch (error) {
      console.error(`❌ Failed to send SMS to ${phoneNumber} (attempt ${attempt + 1}/${maxRetries + 1}):`, error.message);
      if (attempt === maxRetries) {
        await logSMS(phoneNumber, message, "failed", error.message, null);
        return;
      }
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
  }
}

async function sendBulkSMS(phoneNumbers, message) {
  const maxRetries = 1;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      if (!SKYSMS_API_KEY || !SKYSMS_API_URL) {
        console.error("SkySMS configuration missing in .env");
        for (const phone of phoneNumbers) {
          await logSMS(phone, message, "failed", "Missing SkySMS config", null);
        }
        return;
      }
      if (phoneNumbers.length === 0) return;
      const response = await axios.post(
        `${SKYSMS_API_URL}/sms/send-bulk`,
        {
          recipients: phoneNumbers.map((phone) => ({ phone_number: phone })),
          message,
          from: "CRAYVINGS WATER MONITORING SYSTEM"
        },
        {
          headers: {
            "X-API-Key": SKYSMS_API_KEY,
            "Content-Type": "application/json",
          },
        }
      );
      console.log(`✅ Bulk SMS sent to ${phoneNumbers.length} recipients`);
      for (const phone of phoneNumbers) {
        await logSMS(phone, message, "sent", null, response.data?.id);
      }
      return response.data;
    } catch (error) {
      console.error(`❌ Failed to send bulk SMS (attempt ${attempt + 1}/${maxRetries + 1}):`, error.message);
      if (attempt === maxRetries) {
        for (const phone of phoneNumbers) {
          await logSMS(phone, message, "failed", error.message, null);
        }
        return;
      }
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
  }
}

async function logSMS(phone, message, status, error, smsId = null) {
  try {
    await pool.query(
      `INSERT INTO sms_logs (recipient_phone, message, status, error_message, sms_id, sent_at)
       VALUES ($1, $2, $3, $4, $5, NOW())`,
      [phone, message, status, error || null, smsId || null]
    );
  } catch (logErr) {
    console.error("Failed to log SMS:", logErr.message);
  }
}

const lastAlertedState = {
  Temperature: { status: null, value: null, timestamp: null },
  "pH Level": { status: null, value: null, timestamp: null },
  "Dissolved Oxygen": { status: null, value: null, timestamp: null },
  "Water Level": { status: null, value: null, timestamp: null },
  Ammonia: { status: null, value: null, timestamp: null },
};

app.use(express.json());

const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || "http://localhost:5173,http://localhost:5174,http://localhost:3001,http://192.168.1.20:3000").split(",");
app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin || ALLOWED_ORIGINS.includes(origin) || origin.startsWith("http://localhost:") || origin.match(/^http:\/\/\d+\.\d+\.\d+\.\d+:/)) {
        callback(null, true);
      } else {
        console.log("CORS blocked origin:", origin);
        callback(new Error("Not allowed by CORS"));
      }
    },
    methods: ["GET", "POST"],
    allowedHeaders: ["Content-Type"],
  })
);

if (!process.env.PG_PASSWORD) {
  console.error("Error: PG_PASSWORD environment variable is required");
  process.exit(1);
}

const pool = new Pool({
  host: process.env.PG_HOST || "localhost",
  port: process.env.PG_PORT || 5432,
  database: process.env.PG_DATABASE || "crayvings_monitoring_system_db",
  user: process.env.PG_USER || "postgres",
  password: process.env.PG_PASSWORD,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});

app.get("/", (req, res) => {
  res.json({
    message: "Server running",
    routes: ["/", "/health", "/sensor", "/sensor/latest", "/logs", "/logs (POST)"],
  });
});

const sensorSchema = z.object({
  device_id: z.string().min(1).max(50),
  temperature: z.coerce.number().min(-10).max(50),
  water_level: z.coerce.number().min(0).max(100),
  ph: z.coerce.number().min(0).max(14),
  dissolved_oxygen: z.coerce.number().min(0).max(20).optional(),
  ammonia: z.coerce.number().min(0).max(10).optional(),
  timestamp: z.string().datetime().optional(),
});

app.get("/health", async (req, res) => {
  try {
    const result = await pool.query("SELECT COUNT(*) FROM sensors");
    res.json({
      status: "ok",
      database: "connected",
      documents: parseInt(result.rows[0].count),
      serverTime: new Date().toISOString(),
    });
  } catch (err) {
    res.status(500).json({
      status: "error",
      message: "Health check failed",
      error: err.message,
    });
  }
});

app.post("/sensor", async (req, res) => {
  try {
    const result = sensorSchema.safeParse(req.body);
    
    if (!result.success) {
      return res.status(400).json({
        message: "Validation error",
        errors: result.error.flatten().fieldErrors,
      });
    }

    const {
      device_id,
      temperature,
      water_level,
      ph,
      dissolved_oxygen,
      ammonia,
      timestamp,
    } = result.data;

    const lastReading = await pool.query(
      "SELECT * FROM sensors ORDER BY timestamp DESC LIMIT 1"
    );
    const lastData = lastReading.rows[0];

    const insertResult = await pool.query(
      `INSERT INTO sensors (device_id, temperature, water_level, ph, dissolved_oxygen, ammonia, timestamp)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [
        device_id,
        Number(temperature ?? 0),
        Number(water_level ?? 0),
        Number(ph ?? 0),
        Number(dissolved_oxygen ?? 0),
        Number(ammonia ?? 0),
        timestamp ? new Date(timestamp) : new Date(),
      ]
    );

    console.log(`[${new Date().toISOString()}] Sensor data saved:`, insertResult.rows[0]);

    const settingsResult = await pool.query("SELECT * FROM sensor_settings LIMIT 1");
    const settings = settingsResult.rows[0] || {
      temp_min: 20.0, temp_max: 31.0,
      ph_min: 6.5, ph_max: 8.5,
      do_min: 5.0, do_max: 10.0,
      water_level_min: 10.0, water_level_max: 100.0,
      ammonia_min: 0.0, ammonia_max: 0.5
    };

    const now = new Date();
    const nowTs = now.getTime();

    const CRITICAL_INTERVAL_MS = process.env.SMS_COOLDOWN_MS ? parseInt(process.env.SMS_COOLDOWN_MS) : 5 * 60 * 1000;
    const WARNING_INTERVAL_MS = 60 * 60 * 1000;

    const sensorChecks = [
      { key: "Temperature", val: Number(temperature), min: settings.temp_min, max: settings.temp_max },
      { key: "pH Level", val: Number(ph), min: settings.ph_min, max: settings.ph_max },
      { key: "Dissolved Oxygen", val: Number(dissolved_oxygen), min: settings.do_min, max: settings.do_max },
      { key: "Water Level", val: Number(water_level), min: settings.water_level_min, max: settings.water_level_max },
      { key: "Ammonia", val: Number(ammonia), min: settings.ammonia_min, max: settings.ammonia_max },
    ];

    for (const sensor of sensorChecks) {
      if (sensor.val === 0 && sensor.key !== "Water Level") continue;

      const status = getThresholdStatus(sensor.val, sensor.min, sensor.max);
      const last = lastAlertedState[sensor.key];
      const lastTs = last.timestamp ? new Date(last.timestamp).getTime() : 0;

      if (status === "good") {
        lastAlertedState[sensor.key] = { status: "good", value: sensor.val, timestamp: now.toISOString() };
        continue;
      }

      const interval = status === "critical" ? CRITICAL_INTERVAL_MS : WARNING_INTERVAL_MS;

      if (status === last.status && nowTs - lastTs < interval) {
        continue;
      }

      const direction = sensor.val < sensor.min ? "Low" : "High";
      await pool.query(
        `INSERT INTO system_logs (action, parameter, old_value, new_value) VALUES ($1, $2, $3, $4)`,
        ["Alert", sensor.key, direction, sensor.val]
      );
      lastAlertedState[sensor.key] = { status, value: sensor.val, timestamp: now.toISOString() };
      console.log(`[${now.toISOString()}] Alert logged: ${sensor.key} ${direction} (value: ${sensor.val}, status: ${status})`);

      // Only send SMS for critical alerts
      if (status === "critical") {
        try {
          const recipientsResult = await pool.query(
            "SELECT phone_number FROM authorized_recipients WHERE is_active = true"
          );
          if (recipientsResult.rows.length === 0) {
            console.warn(`[${now.toISOString()}] No active recipients for SMS alert`);
            continue;
          }
          const unitMap = {
            "Temperature": "°C",
            "pH Level": "",
            "Dissolved Oxygen": "mg/L",
            "Water Level": "%",
            "Ammonia": "ppm",
          };
          const emojiMap = {
            "Temperature": "🌡️",
            "pH Level": "🧪",
            "Dissolved Oxygen": "💨",
            "Water Level": "💧",
            "Ammonia": "☠️",
          };
          const unit = unitMap[sensor.key] || "";
          const emoji = emojiMap[sensor.key] || "⚠️";
          const message = `${emoji} ${sensor.key.toUpperCase()} ALERT: ${sensor.val}${unit} (${direction === "Low" ? "min" : "max"}: ${direction === "Low" ? sensor.min : sensor.max}${unit})`;
          
          const phoneNumbers = recipientsResult.rows.map(row => row.phone_number);
          await sendBulkSMS(phoneNumbers, message);
        } catch (smsErr) {
          console.error(`[${now.toISOString()}] SMS alert failed:`, smsErr.message);
        }
      }
    }

    res.status(201).json({
      message: "Saved to database",
      data: insertResult.rows[0],
    });
  } catch (err) {
    console.error(`[${new Date().toISOString()}] Error saving sensor:`, err);
    res.status(500).json({
      message: "Error saving data",
      error: err.message,
    });
  }
});

app.get("/sensor", async (req, res) => {
  try {
    const result = await pool.query(
      "SELECT * FROM sensors ORDER BY timestamp DESC LIMIT 50"
    );
    res.json(result.rows);
  } catch (err) {
    console.error(`[${new Date().toISOString()}] Error fetching sensors:`, err);
    res.status(500).json({
      message: "Error fetching data",
      error: err.message,
    });
  }
});

app.get("/sensor/latest", async (req, res) => {
  try {
    const result = await pool.query(
      "SELECT * FROM sensors ORDER BY timestamp DESC LIMIT 1"
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        message: "No sensor data found",
      });
    }

    console.log(`[${new Date().toISOString()}] Latest data sent:`, result.rows[0]);
    res.json(result.rows[0]);
  } catch (err) {
    console.error(`[${new Date().toISOString()}] Error fetching latest sensor data:`, err);
    res.status(500).json({
      message: "Error fetching latest data",
      error: err.message,
    });
  }
});

app.post("/logs", async (req, res) => {
  try {
    const { action, parameter, old_value, new_value } = req.body;

    if (!action || !parameter) {
      return res.status(400).json({
        message: "action and parameter are required",
      });
    }

    const result = await pool.query(
      `INSERT INTO system_logs (action, parameter, old_value, new_value)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [action, parameter, String(old_value ?? ""), String(new_value ?? "")]
    );

    console.log(`[${new Date().toISOString()}] Log created:`, result.rows[0]);

    res.status(201).json({
      message: "Log created",
      data: result.rows[0],
    });
  } catch (err) {
    console.error(`[${new Date().toISOString()}] Error creating log:`, err);
    res.status(500).json({
      message: "Error creating log",
      error: err.message,
    });
  }
});

app.get("/system-logs", async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 20));
    const offset = (page - 1) * limit;
    
    console.log(`[${new Date().toISOString()}] ✓ /system-logs endpoint hit (page ${page}, limit ${limit})`);
    
    const countResult = await pool.query("SELECT COUNT(*) FROM system_logs");
    const total = parseInt(countResult.rows[0].count);
    
    const result = await pool.query(
      "SELECT * FROM system_logs ORDER BY timestamp DESC LIMIT $1 OFFSET $2",
      [limit, offset]
    );
    
    console.log(`[${new Date().toISOString()}] Logs found: ${result.rows.length} (total: ${total})`);
    res.json({ data: result.rows, total });
  } catch (err) {
    console.error(`[${new Date().toISOString()}] Error fetching logs:`, err);
    res.status(500).json({
      message: "Error fetching logs",
      error: err.message,
    });
  }
});

app.get("/settings", async (req, res) => {
  try {
    const result = await pool.query("SELECT * FROM sensor_settings LIMIT 1");
    if (result.rows.length === 0) {
      const defaultSettings = {
        temp_min: 20.0,
        temp_max: 31.0,
        ph_min: 6.5,
        ph_max: 8.5,
        do_min: 5.0,
        do_max: 10.0,
        water_level_min: 10.0,
        water_level_max: 100.0,
        ammonia_min: 0.0,
        ammonia_max: 0.5,
      };
      return res.json(defaultSettings);
    }
    const dbSettings = result.rows[0];
    const defaults = {
      do_max: 10.0,
      ammonia_min: 0.0,
    };
    for (const key of Object.keys(defaults)) {
      if (dbSettings[key] == null || dbSettings[key] === undefined) {
        dbSettings[key] = defaults[key];
      }
    }
    res.json(dbSettings);
  } catch (err) {
    console.error(`[${new Date().toISOString()}] Error fetching settings:`, err);
    res.status(500).json({ message: "Error fetching settings" });
  }
});

app.post("/settings", async (req, res) => {
  try {
    const {
      temp_min,
      temp_max,
      ph_min,
      ph_max,
      do_min,
      do_max,
      water_level_min,
      water_level_max,
      ammonia_min,
      ammonia_max,
    } = req.body;

    const existing = await pool.query("SELECT id FROM sensor_settings LIMIT 1");
    
    let result;
    if (existing.rows.length > 0) {
      result = await pool.query(
        `UPDATE sensor_settings SET 
          temp_min = $1, temp_max = $2, ph_min = $3, ph_max = $4,
          do_min = $5, do_max = $6, water_level_min = $7, water_level_max = $8,
          ammonia_min = $9, ammonia_max = $10
        WHERE id = $11 RETURNING *`,
        [temp_min, temp_max, ph_min, ph_max, do_min, do_max, water_level_min, water_level_max, ammonia_min, ammonia_max, existing.rows[0].id]
      );
    } else {
      result = await pool.query(
        `INSERT INTO sensor_settings (temp_min, temp_max, ph_min, ph_max, do_min, do_max, water_level_min, water_level_max, ammonia_min, ammonia_max)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING *`,
        [temp_min, temp_max, ph_min, ph_max, do_min, do_max, water_level_min, water_level_max, ammonia_min, ammonia_max]
      );
    }

    console.log(`[${new Date().toISOString()}] Settings saved:`, result.rows[0]);
    res.json({ message: "Settings saved", data: result.rows[0] });
  } catch (err) {
    console.error(`[${new Date().toISOString()}] Error saving settings:`, err);
    res.status(500).json({ message: "Error saving settings" });
  }
});

app.post("/activity-logs", async (req, res) => {
  try {
    const { user_name, action_type, description, module } = req.body;
    
    if (!action_type) {
      return res.status(400).json({ message: "action_type is required" });
    }
    
    const result = await pool.query(
      `INSERT INTO activity_logs (user_name, action_type, description, module)
       VALUES ($1, $2, $3, $4) RETURNING *`,
      [user_name || "Admin", action_type, description || "", module || ""]
    );
    
    res.status(201).json({ message: "Activity logged", data: result.rows[0] });
  } catch (err) {
    console.error(`[${new Date().toISOString()}] Error logging activity:`, err);
    res.status(500).json({ message: "Error logging activity" });
  }
});

app.get("/activity-logs", async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 20));
    const offset = (page - 1) * limit;
    const search = (req.query.search || "").trim();
    const sortBy = req.query.sortBy === "oldest" ? "ASC" : "DESC";
    const actionFilter = req.query.actionType;
    
    let whereClause = "";
    const params = [];
    let paramIndex = 1;
    
    if (search) {
      whereClause = `WHERE (description ILIKE $${paramIndex} OR user_name ILIKE $${paramIndex} OR action_type ILIKE $${paramIndex} OR module ILIKE $${paramIndex})`;
      params.push(`%${search}%`);
      paramIndex++;
    }
    
    if (actionFilter) {
      whereClause += whereClause ? " AND" : "WHERE";
      whereClause += ` action_type = $${paramIndex}`;
      params.push(actionFilter);
      paramIndex++;
    }
    
    const countQuery = `SELECT COUNT(*) FROM activity_logs ${whereClause}`;
    const countResult = await pool.query(countQuery, params);
    const total = parseInt(countResult.rows[0].count);
    
    const dataQuery = `SELECT * FROM activity_logs ${whereClause} ORDER BY timestamp ${sortBy} LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
    const result = await pool.query(dataQuery, [...params, limit, offset]);
    
    res.json({
      data: result.rows,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit)
    });
  } catch (err) {
    console.error(`[${new Date().toISOString()}] Error fetching activity logs:`, err);
    res.status(500).json({ message: "Error fetching activity logs" });
  }
});

// Recipient management endpoints
app.get("/settings/recipients", async (req, res) => {
  try {
    const result = await pool.query(
      "SELECT id, phone_number, name, is_active, created_at FROM authorized_recipients ORDER BY created_at DESC"
    );
    res.json(result.rows);
  } catch (err) {
    console.error(`[${new Date().toISOString()}] Error fetching recipients:`, err);
    res.status(500).json({ error: "Failed to fetch recipients" });
  }
});

app.post("/settings/recipients", async (req, res) => {
  try {
    const { phone_number, name } = req.body;

    if (!/^\+639\d{8}$/.test(phone_number)) {
      return res.status(400).json({ error: "Invalid Philippine phone number. Format: +639XXXXXXXX" });
    }

    const result = await pool.query(
      "INSERT INTO authorized_recipients (phone_number, name) VALUES ($1, $2) RETURNING *",
      [phone_number, name || "Recipient"]
    );

    res.status(201).json({ success: true, message: "Recipient added", data: result.rows[0] });
  } catch (err) {
    if (err.code === "23505") {
      return res.status(409).json({ error: "Phone number already exists" });
    }
    console.error(`[${new Date().toISOString()}] Error adding recipient:`, err);
    res.status(500).json({ error: "Failed to add recipient" });
  }
});

app.put("/settings/recipients/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const { name, is_active } = req.body;

    const result = await pool.query(
      "UPDATE authorized_recipients SET name = COALESCE($1, name), is_active = COALESCE($2, is_active), updated_at = NOW() WHERE id = $3 RETURNING *",
      [name, is_active, id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Recipient not found" });
    }

    res.json({ success: true, message: "Recipient updated", data: result.rows[0] });
  } catch (err) {
    console.error(`[${new Date().toISOString()}] Error updating recipient:`, err);
    res.status(500).json({ error: "Failed to update recipient" });
  }
});

app.delete("/settings/recipients/:id", async (req, res) => {
  try {
    const { id } = req.params;

    const result = await pool.query(
      "DELETE FROM authorized_recipients WHERE id = $1 RETURNING id",
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Recipient not found" });
    }

    res.json({ success: true, message: "Recipient deleted" });
  } catch (err) {
    console.error(`[${new Date().toISOString()}] Error deleting recipient:`, err);
    res.status(500).json({ error: "Failed to delete recipient" });
  }
});

app.post("/settings/recipients/test/:id", async (req, res) => {
  try {
    const { id } = req.params;

    const result = await pool.query(
      "SELECT phone_number, name FROM authorized_recipients WHERE id = $1",
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Recipient not found" });
    }

    const { phone_number, name } = result.rows[0];
    const testMessage = `Test SMS from CrayVings Monitoring System. If you received this, ${name} is configured correctly!`;

    await sendSingleSMS(phone_number, testMessage);

    res.json({ success: true, message: "Test SMS sent", recipient: name });
  } catch (err) {
    console.error(`[${new Date().toISOString()}] Error sending test SMS:`, err);
    res.status(500).json({ error: "Failed to send test SMS" });
  }
});

async function startServer() {
  try {
    const client = await pool.connect();
    try {
      await client.query(`
        CREATE TABLE IF NOT EXISTS sensors (
          id SERIAL PRIMARY KEY,
          device_id VARCHAR(50) NOT NULL,
          temperature DECIMAL(5,2) DEFAULT 0,
          water_level DECIMAL(5,2) DEFAULT 0,
          ph DECIMAL(5,2) DEFAULT 0,
          dissolved_oxygen DECIMAL(5,2) DEFAULT 0,
          ammonia DECIMAL(5,2) DEFAULT 0,
          timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `);
      
      await client.query(`
        CREATE TABLE IF NOT EXISTS system_logs (
          id SERIAL PRIMARY KEY,
          action VARCHAR(100) NOT NULL,
          parameter VARCHAR(100) NOT NULL,
          old_value VARCHAR(50),
          new_value VARCHAR(50),
          timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `);
      
      await client.query(`
        CREATE TABLE IF NOT EXISTS sensor_settings (
          id SERIAL PRIMARY KEY,
          temp_min DECIMAL(5,2) DEFAULT 20.0,
          temp_max DECIMAL(5,2) DEFAULT 31.0,
          ph_min DECIMAL(5,2) DEFAULT 6.5,
          ph_max DECIMAL(5,2) DEFAULT 8.5,
          do_min DECIMAL(5,2) DEFAULT 5.0,
          do_max DECIMAL(5,2) DEFAULT 10.0,
          water_level_min DECIMAL(5,2) DEFAULT 10.0,
          water_level_max DECIMAL(5,2) DEFAULT 100.0,
          ammonia_min DECIMAL(5,2) DEFAULT 0.0,
          ammonia_max DECIMAL(5,2) DEFAULT 0.5,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `);
      
        await client.query(`
          ALTER TABLE sensor_settings ADD COLUMN IF NOT EXISTS do_max DECIMAL(5,2) DEFAULT 10.0
        `);
        
        await client.query(`
          ALTER TABLE sensor_settings ADD COLUMN IF NOT EXISTS ammonia_min DECIMAL(5,2) DEFAULT 0.0
        `);

      await client.query(`
        CREATE TABLE IF NOT EXISTS activity_logs (
          id SERIAL PRIMARY KEY,
          user_name VARCHAR(100) DEFAULT 'Admin',
          action_type VARCHAR(50) NOT NULL,
          description TEXT,
          module VARCHAR(100),
          timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `);

      await client.query(`
        CREATE TABLE IF NOT EXISTS authorized_recipients (
          id SERIAL PRIMARY KEY,
          phone_number VARCHAR(20) NOT NULL UNIQUE,
          name VARCHAR(100),
          is_active BOOLEAN DEFAULT true,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `);

      await client.query(`
        INSERT INTO authorized_recipients (phone_number, name)
        VALUES ('+639770928085', 'Test Recipient')
        ON CONFLICT (phone_number) DO NOTHING
      `);
      console.log(`[${new Date().toISOString()}] Test recipient +639770928085 added`);

      // New: sms_logs table
      await client.query(`
        CREATE TABLE IF NOT EXISTS sms_logs (
          id SERIAL PRIMARY KEY,
          recipient_phone VARCHAR(20) NOT NULL,
          message TEXT NOT NULL,
          status VARCHAR(20) NOT NULL,
          error_message TEXT,
          sms_id VARCHAR(100),
          sent_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `);
      console.log(`[${new Date().toISOString()}] sms_logs table ready`);

      await client.query(`
        CREATE INDEX IF NOT EXISTS idx_activity_logs_timestamp ON activity_logs(timestamp DESC)
      `);
      
      await client.query(`
        CREATE INDEX IF NOT EXISTS idx_activity_logs_action_type ON activity_logs(action_type)
      `);

      await client.query(`
        CREATE INDEX IF NOT EXISTS idx_sensors_timestamp ON sensors(timestamp DESC)
      `);

      await client.query(`
        CREATE INDEX IF NOT EXISTS idx_sensors_device_id ON sensors(device_id)
      `);

      await client.query(`
        CREATE INDEX IF NOT EXISTS idx_system_logs_timestamp ON system_logs(timestamp DESC)
      `);
      
      const logsCount = await client.query("SELECT COUNT(*) FROM system_logs");
      console.log(`[${new Date().toISOString()}] Logs table ready (${logsCount.rows[0].count} records)`);
      
      const result = await client.query("SELECT COUNT(*) FROM sensors");
      console.log(`[${new Date().toISOString()}] Sensor records count: ${result.rows[0].count}`);
      console.log(`[${new Date().toISOString()}] PostgreSQL connected and table ready`);

      // SkySMS credential check
      if (!process.env.SKYSMS_API_KEY) {
        console.warn(`[${new Date().toISOString()}] WARNING: SKYSMS_API_KEY not set. SMS alerts will fail.`);
      } else {
        console.log(`[${new Date().toISOString()}] SkySMS configured (API key present)`);
      }
    } finally {
      client.release();
    }

    app.listen(PORT, "0.0.0.0", () => {
      console.log(`[${new Date().toISOString()}] Server started on port ${PORT}`);
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