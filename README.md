# CRAYvings Monitoring System

An IoT-based smart monitoring system designed for aquaculture, specifically for **crayfish/crab pond or tank monitoring**. This project helps monitor important water conditions in real time using sensors connected to an **ESP32**, with data sent to a **web-based dashboard** for viewing and tracking.

---

## Project Overview

The **CRAYvings Monitoring System** is built to help monitor the water environment of aquaculture tanks or ponds. Since aquatic animals are highly sensitive to changes in water quality, this system provides a more efficient way to check conditions without relying only on manual observation.

The system uses sensors connected to an **ESP32 microcontroller** to collect environmental data. The readings are then sent through Wi-Fi to a backend/database and displayed on a monitoring dashboard.

This can help reduce risks caused by poor water conditions and improve overall monitoring efficiency.

---

## Objectives

- Monitor water-related parameters in real time
- Provide a centralized dashboard for viewing sensor data
- Help improve water quality management in aquaculture
- Reduce manual checking and improve consistency
- Support better decision-making for tank or pond maintenance
- Provide instant alerts when parameters go out of safe range

---

## Features

### Core Features
- **Real-time sensor monitoring** - Temperature, pH, water level (3 sensors via ESP32)
- **ESP32-based data collection** - Wireless sensor data transmission with WiFiMulti + validation
- **Web dashboard** - Responsive React UI with icon-based navigation
- **Database storage** - PostgreSQL for historical data
- **Smart alerts** - Threshold-based notifications with cooldown (3 sensors only)
- **SMS notifications** - Critical alerts via SkySMS API
- **Recipient management** - Manage SMS alert recipients
- **Custom alert sounds** - Audio alerts via Web Audio API
- **PDF export** - Export system logs to PDF (LogsPage)
- **Activity logging** - Track user interactions
- **Smart save logic** - Only writes to database when data actually changes (prevents unnecessary updates)
- **Token expiration** - Auth tokens expire after 24 hours for improved security

### Monitoring Parameters
| Parameter | Sensor | Safe Range |
|-----------|--------|------------|
| Temperature | DS18B20 | 20 - 31°C |
| Water Level | Ultrasonic HC-SR04 | 10 - 100% |
| pH Level | pH Probe | 6.5 - 8.5 |

### Dashboard Pages
- **Home** - Overview and quick stats
- **Dashboard** - Live readings and charts
- **Sensors** - Individual sensor details
- **Alerts** - Alert history with filtering (Alert/Change)
- **Historical Data** - Trend charts with time filtering (1h, 6h, 24h, all time)
- **Activity Logs** - User activity tracking
- **Logs** - System event logs with parameter filtering and PDF export
- **Settings** - Configure thresholds and manage SMS recipients

---

## Technologies Used

### Hardware
- **ESP32 DevKit V1** with WiFiMulti support (auto-connects to best available network)
- **DS18B20** - Temperature sensor (GPIO4, OneWire protocol)
- **HC-SR04** - Ultrasonic distance sensor (GPIO5, GPIO18, 5-sample averaging)
- **pH Probe** - pH measurement (GPIO34, 10-sample median filter, calibration offset)

### Software
| Component | Technology | Version |
|-----------|------------|---------|
| Frontend | React + TypeScript | React 19, TS 5.9 |
| Build Tool | Vite | 8.0 |
| Styling | Tailwind CSS | 4.2 |
| Charts | Recharts | 3.8 |
| Icons | lucide-react | 1.8 |
| PDF Export | jsPDF + autoTable | 4.2 + 5.0 |
| Routing | react-router-dom | 7.14 |
| HTTP Client | Axios | 1.15 |
| Backend | Express.js (raw SQL + smart change detection) | 5.2 |
| Database | PostgreSQL | 15+ |
| Connection Pool | pg | 8.20 |
| Validation | Zod | 4.3 |
| SMS Service | SkySMS API | - |

---

## System Architecture

```
Sensors → ESP32 → Wi-Fi → Express API → PostgreSQL → React Dashboard
                    │                              │
                    │                              │
                    └─────────── Alerts ←─────────┘
```

### Data Flow
1. **Sensors** read environmental data
2. **ESP32** collects and sends data via HTTP POST
3. **Express API** validates and stores in PostgreSQL
4. **React Dashboard** polls for data every 3 seconds
5. **Alerts** triggered when values exceed thresholds

---

## Prerequisites

### Hardware
- ESP32 DevKit V1
- Water temperature sensor (DS18B20)
- Water level sensor (HC-SR04)
- pH probe/sensor
- Optional: DO sensor, ammonia sensor

### Software
- Node.js 18+
- PostgreSQL 15+
- Arduino IDE (for ESP32)

---

## Quick Start

### 1. Clone and Install

```bash
npm install
```

### 2. Configure Environment

Create a `.env` file in the project root:

```bash
# Server Configuration
PORT=3000

# PostgreSQL Configuration
PG_HOST=localhost
PG_PORT=5432
PG_DATABASE=crayvings_monitoring_system_db
PG_USER=postgres
PG_PASSWORD=your_password

# CORS
ALLOWED_ORIGINS=http://localhost:5173
```

### 3. Start Backend

```bash
npm run server
# or: node server.cjs
```

Expected output:
```
Server started on port 3000
PostgreSQL connected and table ready
```

### 4. Start Frontend

```bash
npm run dev
```

Dashboard opens at http://localhost:5173

### 5. Connect ESP32

Configure in Arduino IDE (19200 baud rate):

```cpp
// ESP32 code - esp32code.ino
const char* serverName = "http://192.168.1.20:3000/sensor";

// Add your WiFi networks (WiFiMulti auto-connects)
wifiMulti.addAP("SSID", "password");
```

---

## Configuration

### Setting Thresholds

Navigate to **Settings** in the dashboard to configure:
- Temperature min/max
- pH min/max
- Water level min/max
- Uses smart save logic - only writes to DB when values actually change

### Alert Customization

- Toggle alert sounds on/off
- Upload custom alert sounds
- Adjust alert cooldown (10 seconds default)

### SMS Notifications

- **SkySMS integration** for critical alerts
- **Recipient management** in Settings page
- **SMS cooldown** to prevent spam (5 seconds default)
- **Test SMS** feature to verify configuration

### Smart Save Logic

The system prevents unnecessary database writes using explicit change detection:
- **Settings**: Only updates fields that differ from current DB values
- **Sensor data**: Skips duplicate readings (compares device_id, temperature, water_level, ph)
- **Password reset**: Checks if new password equals current before updating
- **Recipients**: Only updates name/is_active when changed

Comparison handles: null/undefined, numeric strings vs numbers, dates (ISO string), JSON objects (sorted keys)

---

## API Endpoints

| Endpoint | Method | Description | Query Params |
|----------|--------|-------------|--------------|
| `/health` | GET | Server health check | - |
| `/sensor` | POST | Submit sensor data | - |
| `/sensor/latest` | GET | Get latest reading | - |
| `/sensor` | GET | Get history | `limit` (1-1000, default: 300) |
| `/settings` | GET | Get thresholds | - |
| `/settings` | POST | Update thresholds | - |
| `/settings/recipients` | GET | Get SMS recipients | - |
| `/settings/recipients` | POST | Add new recipient | - |
| `/settings/recipients/:id` | PUT | Update recipient | - |
| `/settings/recipients/:id` | DELETE | Delete recipient | - |
| `/settings/recipients/test/:id` | POST | Send test SMS | - |
| `/system-logs` | GET | Get system logs | `page`, `limit` |
| `/activity-logs` | GET | Get activity logs | `page`, `limit`, `search`, `sortBy`, `actionType` |

---

## Project Structure

```
src/
├── api/client.ts          # API client (Axios)
├── assets/              # Static assets
│   └── craybitch without background.png
├── components/           # UI components
│   ├── Header.tsx
│   ├── Sidebar.tsx
│   ├── StatCard.tsx
│   ├── TrendCard.tsx
│   └── FloatingAlert.tsx
├── contexts/             # React contexts
│   ├── SensorContext.tsx
│   └── SensorProvider.tsx
├── hooks/                # Custom hooks
│   ├── useSensors.ts
│   ├── useThresholdAlert.ts
│   └── useFloatingAlerts.ts
├── pages/               # Page components
│   ├── HomePage.tsx
│   ├── DashboardPage.tsx
│   ├── SensorsPage.tsx
│   ├── AlertsPage.tsx       # Alert/Change filtering
│   ├── HistoricalDataPage.tsx
│   ├── SettingsPage.tsx
│   ├── LogsPage.tsx         # Parameter filtering + PDF export
│   └── ActivityLogsPage.tsx
├── types/index.ts        # TypeScript types
├── utils/              # Utilities
│   └── playAlertSound.ts
├── App.tsx
├── main.tsx
└── index.css
server.cjs              # Express backend (832 lines)
esp32code/
└── esp32code.ino       # ESP32 firmware
```

---

## Troubleshooting

### Common Issues

| Issue | Solution |
|-------|----------|
| Backend won't start | Check PostgreSQL connection |
| No data showing | Verify ESP32 IP address |
| CORS error | Add frontend port to ALLOWED_ORIGINS |
| "Device offline" | Check ESP32 WiFi connection |
| SMS not sending | Verify SKYSMS_API_KEY in .env |

### Debug Commands

```bash
# Health check
curl http://localhost:3000/health

# Get latest sensor
curl http://localhost:3000/sensor/latest

# Test sensor submission
curl -X POST http://localhost:3000/sensor \
  -H "Content-Type: application/json" \
  -d '{"device_id":"TEST","temperature":25,"water_level":75,"ph":7}'
```

---

## Building for Production

```bash
npm run build
```

Output in `dist/` folder - ready for deployment.

---

## License

ISC

---

## Support

For issues or questions, please check the HOW_IT_WORKS.md for detailed documentation.