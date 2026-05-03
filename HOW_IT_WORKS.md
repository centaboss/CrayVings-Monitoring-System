# CRAYvings Monitoring System - How It Works

## System Overview

The CRAYvings Monitoring System is an IoT-based aquaculture monitoring solution for crayfish production. It collects real-time water quality data from sensors and displays it through a responsive web dashboard. The system consists of three main layers: hardware (ESP32 + sensors), backend (Express + PostgreSQL), and frontend (React dashboard).

### Technology Stack

| Component | Technology | Version |
|-----------|------------|---------|
| Frontend | React + TypeScript | React 19, TS 5.9 |
| Build Tool | Vite | 8.0 |
| Styling | Tailwind CSS | 4.2 |
| Charts | Recharts | 3.8 |
| Icons | lucide-react | 1.8 |
| PDF Export | jsPDF + autoTable | 4.2 + 5.0 |
| Routing | react-router-dom | 7.14 |
| Backend | Express.js | 5.2 |
| Database | PostgreSQL | 15+ |
| ORM | pg (connection pool) | 8.20 |
| Validation | Zod | 4.3 |
| HTTP Client | Axios | 1.15 |
| SMS Service | SkySMS API | - |

### Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────────┐
│                        CRAYvings Monitoring System                     │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  ┌──────────┐     ┌──────────────┐     ┌─────────────┐     ┌────────┐  │
│  │  ESP32   │────▶│  Express API  │────▶│ PostgreSQL  │────▶│ React  │  │
│  │ Hardware │     │  Backend      │     │ Database    │     │ Dashboard│  │
│  └──────────┘     └──────────────┘     └─────────────┘     └────────┘  │
│       │                   │                   │                  │         │
│       │     ┌──────────────┘                   └──────────────┐   │         │
│       │     │  Alert Generation │     Data Polling (3s)    │   │         │
│       │     └────────────────────┘───────────────────────────┘   │         │
│       │                                                           │         │
│  Sensors:                                                         Pages:   │
│  - DS18B20 (Temperature)                                     - Home       │
│  - Ultrasonic (Water Level)                                  - Dashboard  │
│  - pH Probe                                                  - Sensors    │
│                                                               - Alerts    │
│                                                               - Historical│
│                                                               - Settings  │
│                                                               - Logs      │
│                                                               - Activity  │
└───────────────────────────────────────────────────────────────────────────────┘
```

---

## Complete Feature List

### 1. Real-Time Water Quality Monitoring

The system continuously monitors three critical water parameters collected by the ESP32:

| Parameter | Sensor | Range | Unit | Default Threshold |
|-----------|--------|-------|------|------------------|
| Temperature | DS18B20 | 0 to 50 | °C | 20 - 31°C |
| Water Level | Ultrasonic HC-SR04 | 0 to 100 | % | 10 - 100% |
| pH Level | pH Probe | 0 to 14 | - | 6.5 - 8.5 |

**Features:**
- Continuous data collection from ESP32 every 1000ms
- Sensor validation before sending data (invalid readings skipped)
- Real-time display updates every 3 seconds via polling
- Visual indicators for sensor status (online/offline)
- Connection status detection (online/offline/unknown)
- Only 3 sensors actively monitored (matches ESP32 hardware)

### 2. Intelligent Alert System

The system now includes **smart alert cooldown** to prevent alert spam:

- **Threshold detection** with severity classification
- **Critical status** when values exceed 15% outside threshold range
- **Warning status** when values are slightly outside range
- **Smart alerting**: Only alerts on status transitions (not continuous)
- **10-second cooldown** between repeated alerts for same parameter
- **Automatic reset** when values return to safe range

**Alert Severity Logic:**
```
value within 15% of threshold range: GOOD
value 15%+ outside threshold:      CRITICAL (red)
value slightly outside threshold:  WARNING (orange)
```

### 3. Data-Driven Insights & Analytics

- **Historical data analysis** with time range filtering (1h, 6h, 24h, all)
- **Trend charts** for Temperature, pH, and Water Level using Recharts
- **Statistical summaries** on dashboard
- **Export capability** via PDF (LogsPage exports system logs)
- **Flexible history fetching** - Backend supports up to 1000 records (default: 300)

### 4. Historical Data Analysis

- Store all sensor readings in PostgreSQL
- Query historical data with configurable limit (up to 1000 records)
- Time-based filtering (1 hour, 6 hours, 24 hours, all time)
- Data visualization with line charts
- Fixed filtering logic ensures proper hourly data display

### 5. Mobile-Responsive Dashboard

- Fully responsive React UI using Tailwind CSS
- Mobile-friendly navigation sidebar
- Adaptive grid layouts for all screen sizes
- Touch-friendly buttons and controls

### 6. Settings Management

- Configurable thresholds via Settings page
- Persistent storage in database
- Real-time validation with range checking
- Activity logging for all changes
- **Smart save logic** - Only writes to DB when values actually change (prevents unnecessary updates)
- **SMS recipient management** - Add, edit, delete recipients
- **Test SMS** - Verify SMS configuration

### 7. Activity Logging

- Track all user interactions
- Log navigation, button clicks, form submissions
- Filterable and searchable activity history
- Pagination support

### 8. Custom Alert Sounds

- Synthetic audio tones (Web Audio API)
- Custom sound upload capability
- Sound enable/disable toggle

### 9. SMS Alert System

- **SkySMS API integration** for sending SMS notifications
- **Recipient management** - Add, edit, delete authorized recipients
- **Individual SMS sending** - Send alerts to each recipient (bulk endpoint removed)
- **SMS cooldown** - Configurable cooldown period (default: 5000ms)
- **SMS logging** - Track all sent messages with status
- **Test SMS** - Send test messages to verify configuration
- **Active/inactive toggle** - Enable/disable recipients without deletion

### 10. PDF Export

- Export system logs to PDF using jsPDF + jspdf-autotable
- Parameter filtering (Temperature, pH Level, Water Level)
- Summary section with parameter counts
- Auto-table formatting with pagination support
- Available in LogsPage

---

## Data Flow

```
ESP32 ──POST──▶ /sensor ──Validate──▶ PostgreSQL ──Query──▶ Frontend
    │              │                  │  sensors           │    │
    │              │                  ▼                  │    │
    │              │           Check Thresholds        │    │
    │              │                  │                  │    │
    │              │                  ▼                  │    │
    │              └──────▶ system_logs ◀─────────────┘    │
    │                       (Alerts)                         │
    │                                                     ▼
    │                                              Real-time Display
    │                                              (every 3 seconds)
```

### 1. Data Collection (ESP32)

The ESP32 microcontroller reads sensor values at regular intervals:

- **Temperature**: DS18B20 waterproof sensor (OneWire protocol)
- **Water Level**: Ultrasonic HC-SR04 distance sensor with averaging (5 samples)
- **pH Level**: Analog pH probe with calibration and median filtering (10 samples)

### 2. Data Transmission

The ESP32 sends a POST request to the backend server via Wi-Fi (only when all sensor readings are valid):

```http
POST http://192.168.1.20:3000/sensor
Content-Type: application/json

{
  "device_id": "ESP32_01",
  "temperature": 25.5,
  "water_level": 80.0,
  "ph": 7.2
}
```

### 3. Backend Processing

The Express server (`server.cjs`) performs these operations:

1. **Validation**: Uses Zod schema to validate incoming data
2. **Storage**: Inserts readings into PostgreSQL `sensors` table
3. **Threshold Checking**: Compares values against configurable settings
4. **Alert Generation**: Creates alerts for out-of-range values
5. **Logging**: Records all alerts to `system_logs` table
6. **History API**: Accepts `limit` parameter (1-1000, default: 300) for flexible data retrieval
6. **History API**: Accepts `limit` parameter (1-1000, default: 300) for flexible data retrieval

### 4. Frontend Display

The React dashboard:

1. **Polling**: Fetches data every 3 seconds
2. **Display**: Shows real-time readings in cards and charts
3. **Status**: Indicates connection status (online/offline)
4. **Alerts**: Warns users when parameters exceed thresholds
5. **Audio**: Plays alert sounds for threshold violations
6. **SMS**: Sends SMS notifications for critical alerts via SkySMS

---

## Connection & Offline Handling

### Live Connection

- Frontend polls `/sensor/latest` every 3 seconds
- Connection status shown as **ONLINE** (green) or **OFFLINE** (red)
- Last update timestamp displayed

### Disconnect Detection

- If 5 consecutive polls fail, status changes to **OFFLINE**
- Error message displayed: "Unable to connect to device"
- Auto-retries continue even in offline state
- Tracks consecutive failures count

### Reconnection

- When data resumes, status automatically returns to **ONLINE**
- All components re-render with fresh data
- Historical data preserved in database

---

## Alert System

### How Alerts Work

1. Backend compares sensor values against configured thresholds
2. Frontend performs additional client-side threshold checking
3. Status is classified as GOOD, WARNING, or CRITICAL
4. Alerts are triggered only on status transitions
5. Cooldown prevents repeated alerts for same condition

### Threshold Configuration

Users can configure thresholds in **Settings**:

| Parameter | Default Min | Default Max | Unit |
|------------|--------------|-------------|------|
| Temperature | 20 | 31 | °C |
| pH Level | 6.5 | 8.5 | - |
| Dissolved Oxygen | 5 | 10 | mg/L |
| Water Level | 10 | 100 | % |
| Ammonia | 0 | 0.5 | ppm |

### Alert Severity

| Severity | Condition | Color | Behavior |
|----------|-----------|-------|----------|
| **Critical** | Value 15%+ outside range | Red | Immediate alert, repeated sound |
| **Warning** | Value outside range but < 15% | Orange | Alert on status change |
| **Info** | System changes, settings | Blue | Informational |
| **Good** | Value within safe range | Green | No alert |

---

## API Endpoints

### Complete API Reference

| Endpoint | Method | Description | Query Params | Request Body | Response |
|----------|--------|-------------|--------------|--------------|----------|
| `/` | GET | Server info | - | - | `{message, routes: []}` |
| `/health` | GET | Health check | - | - | `{status, database, documents, serverTime}` |
| `/sensor` | POST | Submit sensor data | - | Sensor payload | `{message, data}` |
| `/sensor` | GET | Get history | `limit` (1-1000, default: 300) | - | `SensorEntry[]` |
| `/sensor/latest` | GET | Get latest | - | - | `SensorEntry` |
| `/settings` | GET | Get thresholds | - | - | `SensorSettings` |
| `/settings` | POST | Update thresholds | - | Partial Settings | `{message, data}` |
| `/settings/recipients` | GET | Get all recipients | - | - | `{data: Recipient[]}` |
| `/settings/recipients` | POST | Add new recipient | - | `{phone_number, name}` | `{success, data}` |
| `/settings/recipients/:id` | PUT | Update recipient | - | `{name, is_active}` | `{success, data}` |
| `/settings/recipients/:id` | DELETE | Delete recipient | - | - | `{success, message}` |
| `/settings/recipients/test/:id` | POST | Send test SMS | - | - | `{success, message}` |
| `/system-logs` | GET | Get logs | `page`, `limit` | - | `{data, total}` |
| `/logs` | POST | Create log | - | `{action, parameter, old_value, new_value}` | `{message, data}` |
| `/activity-logs` | GET | Get activity | `page`, `limit`, `search`, `sortBy`, `actionType` | - | `{data, total, page, limit, totalPages}` |
| `/activity-logs` | POST | Create activity | - | `{action_type, description, module}` | `{message, data}` |

---

## Backend Functionality

### Data Validation & Sanitization

The backend uses **Zod** for schema validation:

```javascript
const sensorSchema = z.object({
  device_id: z.string().min(1).max(50),
  temperature: z.coerce.number().min(-10).max(50),
  water_level: z.coerce.number().min(0).max(100),
  ph: z.coerce.number().min(0).max(14),
  timestamp: z.string().datetime().optional(),
});
```

**Validation features:**
- Type coercion (strings to numbers)
- Range constraints
- Datetime parsing

### Smart Save Logic (Change Detection)

The backend uses explicit comparison to prevent unnecessary database writes:

```javascript
// Normalize values for safe comparison (handles null, dates, numbers, objects)
function normalizeComparableValue(value) {
  if (value === undefined || value === null) return null;
  if (value instanceof Date) return value.toISOString();
  if (isNumericLike(value)) return Number(value);
  if (typeof value === "string") return value.trim();
  if (isPlainObject(value) || Array.isArray(value)) return stableStringify(value);
  return value;
}

// Compare normalized values using Object.is for proper equality
function areValuesEqual(currentValue, newValue) {
  const current = normalizeComparableValue(currentValue);
  const next = normalizeComparableValue(newValue);
  if (current === null || next === null) return current === next;
  return Object.is(current, next);
}

// Returns only fields that actually changed vs current DB row
function getChangedFields(currentRow, updates) {
  const changed = {};
  for (const [field, newValue] of Object.entries(updates)) {
    const currentValue = currentRow ? currentRow[field] : undefined;
    if (!areValuesEqual(currentValue, newValue)) {
      changed[field] = newValue;
    }
  }
  return changed;
}

// Generic update helper - only writes changed fields to database
async function updateOnlyIfChanged(db, options) {
  const { table, keyColumn, keyValue, currentRow, updates, touchUpdatedAt } = options;
  const changed = getChangedFields(currentRow, updates);
  if (Object.keys(changed).length === 0) {
    return { changed: false, row: currentRow };
  }
  // Build UPDATE query with only changed fields
  // ...
}
```

**Used for:**
- **Settings updates** - Only updates threshold fields that changed
- **Sensor data** - Skips duplicate readings (compares device_id, temperature, water_level, ph)
- **Recipients** - Only updates name or is_active when changed
- **Password reset** - Checks if new password equals current hash before updating

### Database Operations

Connection pooling with `pg` library:

```javascript
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
```

---

## Frontend Architecture

### Component Hierarchy

```
App
├── SensorProvider (main data context)
│   ├── useSensorDataPolling (3s interval)
│   ├── useSettingsManager
│   ├── useLogsManager (5s interval)
│   └── useActivityLogsManager
├── FloatingAlertProvider (toast notifications)
├── Header (top bar)
├── Sidebar (navigation)
└── Pages
    ├── HomePage
    ├── DashboardPage
    ├── SensorsPage
    ├── AlertsPage
    ├── HistoricalDataPage
    ├── SettingsPage
    ├── LogsPage
    └── ActivityLogsPage
```

### State Management Approach

The application uses React Context with custom hooks:

1. **SensorDataContext**: Real-time sensor data, history, connection status
2. **SensorSettingsContext**: Threshold configuration + recipient management
3. **LogsContext**: System logs with pagination
4. **ActivityLogsContext**: User activity tracking
5. **FloatingAlertContext**: Toast notifications

### Real-Time Polling Mechanism

```typescript
const POLL_INTERVAL = 3000; // 3 seconds
const MAX_CONSECUTIVE_FAILURES = 5;
const OFFLINE_THRESHOLD = 15000; // 15 seconds

// Uses AbortController for request cancellation
// Tracks consecutive failures for offline detection
```

### Alert Cooldown Logic

```typescript
const ALERT_COOLDOWN_MS = 10000; // 10 seconds

// Only alerts on status transitions
// Resets alert flag when value returns to good range
// Cooldown prevents alert spam
```

---

## IoT/Hardware Integration

### ESP32 Communication Protocol

The ESP32 communicates via HTTP POST requests:

```
Protocol: HTTP/1.1
Method: POST
Content-Type: application/json
URL: http://<server>:3000/sensor
Baud Rate: 19200
WiFi: WiFiMulti for multiple network support
```

### Network Requirements

- WiFi network (2.4GHz recommended for ESP32)
- Multiple WiFi networks supported via WiFiMulti
- Server on same local network
- Port 3000 accessible
- Static IP recommended for server
- Auto-reconnect on WiFi drop

### Sensor Types & Measurement Ranges

| Sensor | Type | Range | Accuracy | Pin |
|--------|------|-------|----------|-----|
| DS18B20 | Digital | 0°C to 50°C | ±0.5°C | GPIO4 |
| HC-SR04 | Ultrasonic | 0 - 100% | ±3mm | GPIO5, GPIO18 |
| pH Probe | Analog | 0 - 14 | ±0.1 | GPIO34 |

### ESP32 Sensor Validation

- **Temperature**: Valid range 0-50°C, error detection (-127°C = sensor error)
- **Water Level**: Valid range 0-100%, ultrasonic echo validation, 5-sample averaging
- **pH**: Valid range 0-14, median filter (10 samples, discard highest/lowest 2)

---

## SMS Alert System

### SkySMS Integration

The system integrates with **SkySMS API** to send SMS notifications when critical conditions are detected.

**Configuration (.env):**
```bash
SKYSMS_API_KEY=your_skysms_api_key_here
SKYSMS_API_URL=https://skysms.skyio.site/api/v1
SMS_COOLDOWN_MS=5000
```

### SMS Alert Logic

1. **Threshold breach detected** - Sensor value exceeds critical threshold (15%+ outside range)
2. **Recipient lookup** - System queries `authorized_recipients` table for active recipients
3. **Cooldown check** - Prevents SMS spam (default 5 seconds between alerts per parameter)
4. **Bulk SMS sent** - Uses SkySMS bulk API to send to all active recipients
5. **Logging** - All SMS attempts logged to `sms_logs` table

### Recipient Management

Manage SMS recipients through the **Settings** page:

| Action | Endpoint | Description |
|--------|----------|-------------|
| List | `GET /settings/recipients` | Get all recipients |
| Add | `POST /settings/recipients` | Add new phone number |
| Update | `PUT /settings/recipients/:id` | Toggle active status, edit name |
| Delete | `DELETE /settings/recipients/:id` | Remove recipient |
| Test | `POST /settings/recipients/test/:id` | Send test SMS |

### SMS Log Table

```sql
CREATE TABLE sms_logs (
  id SERIAL PRIMARY KEY,
  recipient_phone VARCHAR(20) NOT NULL,
  message TEXT NOT NULL,
  status VARCHAR(20) NOT NULL,
  error_message TEXT,
  sms_id VARCHAR(100),
  sent_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

### Authorized Recipients Table

```sql
CREATE TABLE authorized_recipients (
  id SERIAL PRIMARY KEY,
  phone_number VARCHAR(20) NOT NULL UNIQUE,
  name VARCHAR(100),
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

---

## Project Structure

```
src/
├── api/
│   └── client.ts           # Axios API client with AbortController
├── assets/
│   └── craybitch without background.png  # Logo
├── components/
│   ├── Header.tsx         # Top navigation bar
│   ├── Sidebar.tsx        # Side menu navigation (icon-based)
│   ├── StatCard.tsx       # Metric display card
│   ├── TrendCard.tsx      # Line chart component
│   └── FloatingAlert.tsx  # Toast notifications
├── contexts/
│   ├── SensorContext.tsx # Context interfaces
│   └── SensorProvider.tsx # Data fetching hooks (polling)
├── hooks/
│   ├── useSensors.ts     # Consolidated data access hook
│   ├── useThresholdAlert.ts # Alert threshold monitoring
│   └── useFloatingAlerts.ts # Alert context
├── pages/
│   ├── HomePage.tsx       # Landing page with status overview
│   ├── DashboardPage.tsx # Main monitoring view
│   ├── SensorsPage.tsx   # Individual sensor details
│   ├── AlertsPage.tsx       # Alert history with Alert/Change filtering
│   ├── HistoricalDataPage.tsx # Trend charts with time range filtering
│   ├── SettingsPage.tsx      # Threshold + recipient management
│   ├── LogsPage.tsx          # System log viewer with parameter filtering + PDF export
│   └── ActivityLogsPage.tsx # User activity tracking
├── types/
│   └── index.ts         # TypeScript types and helpers
├── utils/
│   └── playAlertSound.ts # Web Audio API for alerts
├── App.tsx             # Main app layout
├── main.tsx           # Entry point
└── index.css           # Tailwind styles
server.cjs             # Express backend server (832 lines)
esp32code/
└── esp32code.ino      # ESP32 firmware code
```

---

## Running the Application

### 1. Backend

```bash
node server.cjs
```

Expected output:
```
[2026-04-25T12:00:00.000Z] Server started on port 3000
[2026-04-25T12:00:00.000Z] PostgreSQL connected and table ready
```

### 2. Frontend

```bash
npm run dev
```

Dashboard available at http://localhost:5173

### 3. ESP32

Configure the ESP32 with your server IP in `esp32code.ino`:

```cpp
const char* serverName = "http://192.168.1.20:3000/sensor";
```

Upload using Arduino IDE and monitor at 19200 baud.

---

## Environment Variables

### Backend (.env)

```bash
# Server Configuration
PORT=3000
NODE_ENV=development

# PostgreSQL Configuration
PG_HOST=localhost
PG_PORT=5432
PG_DATABASE=crayvings_monitoring_system_db
PG_USER=postgres
PG_PASSWORD=your_password

# CORS Configuration
ALLOWED_ORIGINS=http://localhost:5173,http://localhost:5174,http://localhost:3001

# Arduino Serial Configuration (optional)
ARDUINO_ENABLED=false
ARDUINO_PORT=COM3
ARDUINO_BAUD=19200
DEVICE_ID=ARDUINO_001
POLL_INTERVAL=1000

# SkySMS Configuration
SKYSMS_API_KEY=your_skysms_api_key_here
SKYSMS_API_URL=https://skysms.skyio.site/api/v1
SMS_COOLDOWN_MS=5000
```

### Frontend

```bash
# Optional - defaults to http://localhost:3000
VITE_API_BASE=http://localhost:3000
```

---

## Database Schema

### Sensors Table

```sql
CREATE TABLE sensors (
  id SERIAL PRIMARY KEY,
  device_id VARCHAR(50) NOT NULL,
  temperature DECIMAL(5,2) DEFAULT 0,
  water_level DECIMAL(5,2) DEFAULT 0,
  ph DECIMAL(5,2) DEFAULT 0,
  dissolved_oxygen DECIMAL(5,2) DEFAULT 0,
  ammonia DECIMAL(5,2) DEFAULT 0,
  timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_sensors_timestamp ON sensors(timestamp DESC);
CREATE INDEX idx_sensors_device_id ON sensors(device_id);
```

### System Logs Table

```sql
CREATE TABLE system_logs (
  id SERIAL PRIMARY KEY,
  action VARCHAR(100) NOT NULL,
  parameter VARCHAR(100) NOT NULL,
  old_value VARCHAR(50),
  new_value VARCHAR(50),
  timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP);

CREATE INDEX idx_system_logs_timestamp ON system_logs(timestamp DESC);
```

### Sensor Settings Table

```sql
CREATE TABLE sensor_settings (
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
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP);
```

### Activity Logs Table

```sql
CREATE TABLE activity_logs (
  id SERIAL PRIMARY KEY,
  user_name VARCHAR(100) DEFAULT 'Admin',
  action_type VARCHAR(50) NOT NULL,
  description TEXT,
  module VARCHAR(100),
  timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP);

CREATE INDEX idx_activity_logs_timestamp ON activity_logs(timestamp DESC);
CREATE INDEX idx_activity_logs_action_type ON activity_logs(action_type);
```

### Authorized Recipients Table

```sql
CREATE TABLE authorized_recipients (
  id SERIAL PRIMARY KEY,
  phone_number VARCHAR(20) NOT NULL UNIQUE,
  name VARCHAR(100),
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

### SMS Logs Table

```sql
CREATE TABLE sms_logs (
  id SERIAL PRIMARY KEY,
  recipient_phone VARCHAR(20) NOT NULL,
  message TEXT NOT NULL,
  status VARCHAR(20) NOT NULL,
  error_message TEXT,
  sms_id VARCHAR(100),
  sent_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

---

## Debugging Guide

### Quick Status Check

```powershell
# Check if backend is running (port 3000)
Get-NetTCPConnection -LocalPort 3000

# Check if PostgreSQL is running
Get-NetTCPConnection -LocalPort 5432

# Check frontend ports (5173 or 5174)
Get-NetTCPConnection -LocalPort 5173,5174
```

### Testing the Backend API

```bash
# Health check
curl http://localhost:3000/health

# Get latest sensor
curl http://localhost:3000/sensor/latest

# Manually send test data
curl -X POST http://localhost:3000/sensor \
  -H "Content-Type: application/json" \
  -d '{"device_id":"TEST","temperature":25.0,"water_level":75.0,"ph":7.0}'
```

### Common Issues & Solutions

| Issue | Cause | Solution |
|-------|-------|---------|
| "Connection refused" | Server not running | Start `node server.cjs` |
| "Invalid URL" | Empty API URL | Set `VITE_API_BASE` or check `types/index.ts` |
| CORS error | Wrong port | Add port to `ALLOWED_ORIGINS` in server |
| Data not showing | Wrong IP | Check server config in frontend |
| "Device offline" | ESP32 not connected | Check WiFi, restart ESP32 |
| Alert spam | Frequent threshold breaches | Adjust threshold settings |

---

## Performance Metrics

### Current Performance

- **Polling interval**: 3 seconds
- **Logs polling interval**: 5 seconds
- **Request timeout**: 10 seconds
- **Connection pool**: 20 max connections
- **Page size**: 20 items default
- **Alert cooldown**: 10 seconds
- **SMS cooldown**: 5 seconds (configurable via `SMS_COOLDOWN_MS`)
- **Offline threshold**: 15 seconds

### Scalability Considerations

- Database indexing on timestamp columns
- Connection pooling for multiple clients
- Pagination for large datasets
- AbortController for request cancellation

---

## Security Considerations

### Current Implementation

- CORS origin validation
- Input validation with Zod
- SQL parameterized queries (pg)
- No sensitive data stored

### Production Recommendations

1. Add authentication
2. Use HTTPS
3. Implement rate limiting
4. Add API keys/session tokens
5. Enable database encryption

---

## Future Enhancement Possibilities

1. **Mobile App** - Native iOS/Android apps
2. **Push Notifications** - Firebase or similar
3. **Multi-Pond Support** - Multiple tank monitoring
4. **Data Analysis** - ML-based predictions
5. **WebSocket** - Real-time updates instead of polling
6. **Multi-user** - Role-based access
7. **Export API** - Public API for integrations
8. **Arduino Serial** - Direct serial connection support