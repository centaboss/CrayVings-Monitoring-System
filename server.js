import express from 'express';
import cors from 'cors';
import axios from 'axios';

const app = express();
app.use(cors());
app.use(express.json());

const PORT = 3000;
// ESP32's IP address - CHANGE THIS to match your ESP32's IP
const ESP32_URL = process.env.ESP32_URL || 'http://192.168.1.100';

let settings = {
  temp_min: 20,
  temp_max: 30,
  ph_min: 6.5,
  ph_max: 8,
  do_min: 5,
  do_max: 8,
  water_level_min: 50,
  water_level_max: 90,
  ammonia_min: 0,
  ammonia_max: 1,
};

let sensorData = {
  temperature: 0,
  water_level: 0,
  ph: 0,
  dissolved_oxygen: 0,
  ammonia: 0,
  timestamp: new Date().toISOString(),
};

let systemLogs = [];
let activityLogs = [];

// Middleware
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} ${req.method} ${req.path}`);
  next();
});

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', serverTime: new Date().toISOString() });
});

// ESP32 pushes sensor data here
app.post('/sensor', (req, res) => {
  const data = req.body;
  sensorData = { ...data, timestamp: new Date().toISOString() };
  console.log('Sensor data:', sensorData);
  res.json({ success: true });
});

// Get latest sensor data
app.get('/sensor/latest', (req, res) => {
  res.json(sensorData);
});

// Get sensor history
app.get('/sensor', (req, res) => {
  res.json([sensorData]);
});

// Get settings
app.get('/settings', (req, res) => {
  res.json(settings);
});

// Save settings
app.post('/settings', (req, res) => {
  settings = { ...settings, ...req.body };
  console.log('Settings updated:', settings);
  
  // Forward to ESP32
  axios.post(`${ESP32_URL}/settings`, settings, { timeout: 5000 })
    .then(() => console.log('Settings sent to ESP32'))
    .catch(err => console.warn('Could not send to ESP32:', err.message));
  
  res.json({ success: true });
});

// System logs
app.get('/system-logs', (req, res) => {
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 20;
  const start = (page - 1) * limit;
  res.json({ data: systemLogs.slice(start, start + limit), total: systemLogs.length });
});

app.post('/logs', (req, res) => {
  const log = { ...req.body, timestamp: new Date().toISOString(), id: systemLogs.length + 1 };
  systemLogs.unshift(log);
  res.json({ success: true, data: log });
});

// Activity logs
app.get('/activity-logs', (req, res) => {
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 20;
  const start = (page - 1) * limit;
  res.json({ 
    data: activityLogs.slice(start, start + limit), 
    total: activityLogs.length,
    page,
    limit,
    totalPages: Math.ceil(activityLogs.length / limit)
  });
});

app.post('/activity-logs', (req, res) => {
  const log = { ...req.body, timestamp: new Date().toISOString(), id: activityLogs.length + 1 };
  activityLogs.unshift(log);
  res.json({ success: true, data: log });
});

// Start server
app.listen(PORT, () => {
  console.log(`
╔════════════════════════════════════════╗
║     Aquaculture Dashboard API     ║
║     Server running on port ${PORT}      ║
║     ESP32 URL: ${ESP32_URL}   
╚════════════════════════════════════════╝
  `);
});