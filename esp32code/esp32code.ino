#include <Arduino.h>
#include <WiFi.h>
#include <HTTPClient.h>
#include <OneWire.h>
#include <DallasTemperature.h>
#include <esp_task_wdt.h>
#include <WiFiManager.h>  // ← Correct library include

#define ONE_WIRE_BUS 4
#define TRIG_PIN 5
#define ECHO_PIN 18
#define PH_PIN 34

const char* serverName = "http://192.168.100.17:3000/sensor";

const float TANK_HEIGHT_CM = 30.0f;
const int ULTRASONIC_SAMPLES = 5;
const int SAMPLE_DELAY_MS = 50;
const int LOOP_DELAY_MS = 1000;
const int HTTP_TIMEOUT_MS = 5000;

// Watchdog timeout (must be longer than worst-case reconnect)
const int WDT_TIMEOUT_SEC = 60;

const float PH_CALIBRATION_OFFSET = 20.39f;
const float VOLTAGE_REFERENCE = 3.3f;
const int ADC_RESOLUTION = 4095;
const float ADC_TO_VOLT = (VOLTAGE_REFERENCE / ADC_RESOLUTION);
const float PH_PHASE_SHIFT = -5.70f;

const float TEMP_VALID_MIN = 0.0f;
const float TEMP_VALID_MAX = 50.0f;
const float WATER_LEVEL_VALID_MIN = 0.0f;
const float WATER_LEVEL_VALID_MAX = 100.0f;
const float PH_VALID_MIN = 0.0f;
const float PH_VALID_MAX = 14.0f;
const float TEMP_SENSOR_ERROR = -127.0f;
const float DISTANCE_SENSOR_ERROR = -1.0f;

const char* DEVICE_ID = "ESP32_01";

OneWire oneWire(ONE_WIRE_BUS);
DallasTemperature sensors(&oneWire);

int buffer_arr[10];
float ph_act;

// WiFiManager instance
WiFiManager wm;

// ====================== VALIDATION ======================
bool isTemperatureValid(float temp) {
  if (temp <= TEMP_SENSOR_ERROR) {
    Serial.println("Warning: Temperature sensor disconnected or not found!");
    return false;
  }
  if (temp < TEMP_VALID_MIN || temp > TEMP_VALID_MAX) {
    Serial.print("Warning: Temperature out of range: ");
    Serial.println(temp);
    return false;
  }
  return true;
}

bool isWaterLevelValid(float level) {
  if (level < 0) {
    Serial.println("Warning: Ultrasonic sensor failed, no valid echo received!");
    return false;
  }
  if (level < WATER_LEVEL_VALID_MIN || level > WATER_LEVEL_VALID_MAX) {
    Serial.print("Warning: Water level out of range: ");
    Serial.println(level);
    return false;
  }
  return true;
}

bool isPHValid(float ph) {
  if (ph < PH_VALID_MIN || ph > PH_VALID_MAX) {
    Serial.print("Warning: pH out of range: ");
    Serial.println(ph);
    return false;
  }
  return true;
}

// ====================== ULTRASONIC ======================
float readDistanceCM() {
  digitalWrite(TRIG_PIN, LOW);
  delayMicroseconds(2);
  digitalWrite(TRIG_PIN, HIGH);
  delayMicroseconds(10);
  digitalWrite(TRIG_PIN, LOW);

  long duration = pulseIn(ECHO_PIN, HIGH, 30000);
  if (duration == 0) return DISTANCE_SENSOR_ERROR;

  return (duration * 0.0343f) / 2.0f;
}

float getAverageDistance(int samples) {
  float total = 0.0f;
  int validReadings = 0;

  for (int i = 0; i < samples; i++) {
    float distance = readDistanceCM();
    if (distance > 0) {
      total += distance;
      validReadings++;
    }
    delay(SAMPLE_DELAY_MS);
  }

  return (validReadings == 0) ? DISTANCE_SENSOR_ERROR : total / validReadings;
}

// ====================== pH SENSOR ======================
float readPH() {
  for (int i = 0; i < 10; i++) {
    buffer_arr[i] = analogRead(PH_PIN);
    delay(30);
  }

  // Insertion sort
  for (int i = 1; i < 10; i++) {
    int key = buffer_arr[i];
    int j = i - 1;
    while (j >= 0 && buffer_arr[j] > key) {
      buffer_arr[j + 1] = buffer_arr[j];
      j--;
    }
    buffer_arr[j + 1] = key;
  }

  unsigned long avgval = 0;
  for (int i = 2; i < 8; i++) {
    avgval += buffer_arr[i];
  }

  float volt = ((float)avgval / 6.0f) * ADC_TO_VOLT;
  ph_act = PH_PHASE_SHIFT * volt + PH_CALIBRATION_OFFSET;

  if (ph_act < PH_VALID_MIN) ph_act = PH_VALID_MIN;
  if (ph_act > PH_VALID_MAX) ph_act = PH_VALID_MAX;

  return ph_act;
}

// ====================== SETUP ======================
void setup() {
  Serial.begin(19200);

  // ←←← ADD THIS LINE (cleans up previous watchdog)
  esp_task_wdt_deinit();

  pinMode(TRIG_PIN, OUTPUT);
  pinMode(ECHO_PIN, INPUT);
  pinMode(PH_PIN, INPUT);
  sensors.begin();

  // Longer watchdog timeout (gives WiFiManager more time)
  esp_task_wdt_config_t wdt_config = {
    .timeout_ms = 120000,  // 2 minutes
    .idle_core_mask = 0,
    .trigger_panic = true
  };
  esp_task_wdt_init(&wdt_config);
  esp_task_wdt_add(NULL);

  Serial.println("Starting WiFiManager...");

  wm.setConfigPortalTimeout(180);
  wm.setConnectTimeout(30);  // Increased

  if (!wm.autoConnect("CRAYVINGS-ESP32-Setup")) {
    Serial.println("Failed to connect → restarting");
    ESP.restart();
  }

  Serial.println("✅ WiFi Connected!");
  Serial.print("IP Address: ");
  Serial.println(WiFi.localIP());
}

// ====================== MAIN LOOP ======================
void loop() {
  esp_task_wdt_reset();

  // Read sensors
  float distanceCm = getAverageDistance(ULTRASONIC_SAMPLES);
  float waterLevel = DISTANCE_SENSOR_ERROR;

  if (distanceCm > 0) {
    float levelCm = TANK_HEIGHT_CM - distanceCm;
    if (levelCm < 0) levelCm = 0;
    if (levelCm > TANK_HEIGHT_CM) levelCm = TANK_HEIGHT_CM;
    waterLevel = (levelCm / TANK_HEIGHT_CM) * 100.0f;
  }

  sensors.requestTemperatures();
  float tempC = sensors.getTempCByIndex(0);

  float phValue = readPH();

  // Reconnect if WiFi drops (FIXED HERE)
  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("WiFi lost → reconnecting...");
    WiFi.reconnect();  // ← This is the corrected line
  }

  // Validate sensors
  bool tempOK = isTemperatureValid(tempC);
  bool levelOK = isWaterLevelValid(waterLevel);
  bool phOK = isPHValid(phValue);

  // Send data only if WiFi is connected AND all sensors are valid
  if (WiFi.status() == WL_CONNECTED && tempOK && levelOK && phOK) {
    HTTPClient http;
    http.setTimeout(HTTP_TIMEOUT_MS);
    http.begin(serverName);
    http.addHeader("Content-Type", "application/json");

    char json[128];
    snprintf(json, sizeof(json),
             "{\"device_id\":\"%s\",\"temperature\":%.2f,\"water_level\":%.2f,\"ph\":%.2f}",
             DEVICE_ID, tempC, waterLevel, phValue);

    int code = http.POST(json);

    if (code > 0) {
      if (code == 200 || code == 201) {
        Serial.println("✅ Data successfully saved to database!");
      } else {
        Serial.print("Server responded with code: ");
        Serial.println(code);
      }
    } else {
      Serial.print("POST failed, error: ");
      Serial.println(http.errorToString(code));
    }

    http.end();
  } else if (WiFi.status() != WL_CONNECTED) {
    Serial.println("Wi-Fi not connected, cannot send data.");
  } else {
    Serial.println("Data not sent: one or more sensor readings invalid.");
  }

  // Print readings
  Serial.print("Distance: ");
  Serial.print(distanceCm, 2);
  Serial.print(" cm | Water Level: ");
  Serial.print(waterLevel, 2);
  Serial.print(" % | Water Temp: ");
  Serial.print(tempC, 2);
  Serial.print(" °C | pH: ");
  Serial.print(phValue, 2);
  Serial.println();wh
  Serial.println("------------------------");

  delay(LOOP_DELAY_MS);
}