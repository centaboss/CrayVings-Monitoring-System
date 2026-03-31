# Crayvings Monitoring System

An IoT-based smart monitoring system designed for aquaculture, specifically for **crayfish/crab pond or tank monitoring**. This project helps monitor important water conditions in real time using sensors connected to an **ESP32**, with data sent to a **web-based dashboard** for viewing and tracking.

---

## Project Overview

The **Crayvings Monitoring System** is built to help monitor the water environment of aquaculture tanks or ponds. Since aquatic animals are highly sensitive to changes in water quality, this system provides a more efficient way to check conditions without relying only on manual observation.

The system uses sensors connected to an **ESP32 microcontroller** to collect environmental data. The readings are then sent through Wi-Fi to a backend/database and displayed on a monitoring dashboard.

This can help reduce risks caused by poor water conditions and improve overall monitoring efficiency.

---

## Objectives

- Monitor water-related parameters in real time
- Provide a centralized dashboard for viewing sensor data
- Help improve water quality management in aquaculture
- Reduce manual checking and improve consistency
- Support better decision-making for tank or pond maintenance

---

## Features

- Real-time sensor monitoring
- ESP32-based data collection
- Wireless data transmission via Wi-Fi
- Web dashboard for viewing live sensor readings
- Database storage for recorded data
- Expandable system for future alerts and automation

---

## Technologies Used

### Hardware
- **ESP32 DevKit V1**
- **Water Level Sensor**
- **DS18B20 Temperature Sensor** 
- **PH Level Sensor** 
- Breadboard / PCB
- Jumper wires
- Power supply / USB power

### Software
- **Arduino IDE** – for ESP32 programming
- **React + TypeScript** – frontend/dashboard
- **Node.js + Express.js** – backend/API
- **MongoDB** – database
- **Mongoose** – database modeling
- **CORS / JSON Middleware** – API support

---

## System Architecture

```text
Sensors → ESP32 → Wi-Fi → Backend Server → MongoDB Database → React Dashboard
