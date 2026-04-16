const express = require("express");
const cors = require("cors");
const { Pool } = require("pg");
require("dotenv").config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

app.use(
  cors({
    origin: "*",
    methods: ["GET", "POST"],
    allowedHeaders: ["Content-Type"],
  })
);

const pool = new Pool({
  host: process.env.PG_HOST || "localhost",
  port: process.env.PG_PORT || 5432,
  database: process.env.PG_DATABASE || "crayvings_monitoring_system_db",
  user: process.env.PG_USER || "postgres",
  password: process.env.PG_PASSWORD || "JAPAN1234",
});

async function initDatabase() {
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
    
    const result = await client.query("SELECT COUNT(*) FROM sensors");
    console.log(`[${new Date().toISOString()}] Sensor records count: ${result.rows[0].count}`);
    console.log(`[${new Date().toISOString()}] PostgreSQL connected and table ready`);
  } catch (err) {
    console.error(`[${new Date().toISOString()}] DB init error:`, err.message);
  } finally {
    client.release();
  }
}

initDatabase();

app.get("/", (req, res) => {
  res.send("Server running");
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
    const {
      device_id,
      temperature,
      water_level,
      ph,
      dissolved_oxygen,
      ammonia,
      timestamp,
    } = req.body;

    if (!device_id) {
      return res.status(400).json({
        message: "device_id is required",
      });
    }

    const result = await pool.query(
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

    console.log(`[${new Date().toISOString()}] Sensor data saved:`, result.rows[0]);

    res.status(201).json({
      message: "Saved to database",
      data: result.rows[0],
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

app.listen(PORT, "0.0.0.0", () =>
  console.log(`[${new Date().toISOString()}] Server started on port ${PORT}`)
);
