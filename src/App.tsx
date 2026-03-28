
import { useEffect, useState } from "react";
import axios from "axios";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import {
  Thermometer,
  Waves,
  LayoutDashboard,
  Activity,
  Bell,
  History,
  Settings,
} from "lucide-react";

type SensorEntry = {
  _id?: string;
  device_id: string;
  temperature: number;
  water_level: number;
  timestamp?: string;
};

type ChartPoint = {
  name: string;
  temperature: number;
  water_level: number;
};

function StatCard({ title, value, color, icon }: any) {
  return (
    <div style={{
      background: "#fff",
      borderRadius: 18,
      padding: "18px 20px",
      display: "flex",
      alignItems: "center",
      gap: 14,
      boxShadow: "0 4px 12px rgba(0,0,0,0.08)",
      border: "1px solid #e5e7eb",
    }}>
      <div style={{
        width: 48,
        height: 48,
        borderRadius: "50%",
        background: `${color}20`,
        color,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}>
        {icon}
      </div>

      <div>
        <div style={{ fontSize: 13, color: "#6b7280", fontWeight: 600 }}>
          {title}
        </div>
        <div style={{ fontSize: 30, fontWeight: 700, color }}>{value}</div>
      </div>
    </div>
  );
}

function Sidebar() {
  const menu = [
    { label: "Dashboard", icon: <LayoutDashboard size={18} /> },
    { label: "Sensors", icon: <Activity size={18} /> },
    { label: "Alerts", icon: <Bell size={18} /> },
    { label: "Historical Data", icon: <History size={18} /> },
    { label: "Settings", icon: <Settings size={18} /> },
  ];

  return (
    <div style={{
      width: 230,
      background: "#c2410c",
      color: "#fff",
      minHeight: "100vh",
      padding: 18,
    }}>
      <div style={{ fontWeight: 700, fontSize: 18 }}>CRAYvings</div>

      <div style={{ marginTop: 20, display: "grid", gap: 10 }}>
        {menu.map((item, index) => (
          <button
            key={item.label}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              padding: "12px 14px",
              borderRadius: 12,
              border: "none",
              background: index === 0 ? "#fff" : "transparent",
              color: index === 0 ? "#c2410c" : "#fff",
              fontWeight: 600,
            }}
          >
            {item.icon}
            {item.label}
          </button>
        ))}
      </div>
    </div>
  );
}

export default function App() {
  const [data, setData] = useState<SensorEntry | null>(null);
  const [history, setHistory] = useState<ChartPoint[]>([]);
  const [error, setError] = useState("");

  useEffect(() => {
    const fetchLatest = async () => {
      try {
        const res = await axios.get<SensorEntry>(
          "http://192.168.1.20:3000/sensor/latest"
        );

        const latest = res.data;
        setData(latest);
        setError("");

        // append to chart history (keep last 20 points)
        setHistory(prev => {
          const newPoint = {
            name: new Date().toLocaleTimeString(),
            temperature: latest.temperature,
            water_level: latest.water_level,
          };

          const updated = [...prev, newPoint];
          return updated.slice(-20);
        });

      } catch (err) {
        console.error(err);
        setError("Failed to fetch sensor data");
      }
    };

    fetchLatest();
    const interval = setInterval(fetchLatest, 3000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div style={{ display: "flex", minHeight: "100vh", background: "#f3f4f6" }}>
      <Sidebar />

      <div style={{ flex: 1 }}>
        <div style={{
          background: "#c2410c",
          color: "#fff",
          padding: "20px 24px",
          fontSize: 28,
          fontWeight: 700,
        }}>
          CRAYvings Water Monitoring System
        </div>

        <div style={{ padding: 24 }}>

          {/* ERROR */}
          {error && <div style={{ color: "red" }}>{error}</div>}

          {/* STAT CARDS */}
          <div style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
            gap: 16,
            marginBottom: 24,
          }}>
            <StatCard
              title="Temperature"
              value={`${data?.temperature ?? 0} °C`}
              color="#f97316"
              icon={<Thermometer size={24} />}
            />
            <StatCard
              title="Water Level"
              value={`${data?.water_level ?? 0} %`}
              color="#0ea5e9"
              icon={<Waves size={24} />}
            />
          </div>

          {/* CHARTS */}
          <div style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(380px, 1fr))",
            gap: 20,
          }}>
            <div style={{ background: "#fff", borderRadius: 22, padding: 20 }}>
              <h3>Temperature Trend</h3>
              <ResponsiveContainer width="100%" height={250}>
                <LineChart data={history}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="name" />
                  <YAxis />
                  <Tooltip />
                  <Line dataKey="temperature" stroke="#f97316" />
                </LineChart>
              </ResponsiveContainer>
            </div>

            <div style={{ background: "#fff", borderRadius: 22, padding: 20 }}>
              <h3>Water Level Trend</h3>
              <ResponsiveContainer width="100%" height={250}>
                <LineChart data={history}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="name" />
                  <YAxis />
                  <Tooltip />
                  <Line dataKey="water_level" stroke="#0ea5e9" />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* DEVICE INFO */}
          <div style={{ marginTop: 24, background: "#fff", padding: 16, borderRadius: 12 }}>
            Device: {data?.device_id ?? "N/A"} <br />
            Last Update: {data?.timestamp ? new Date(data.timestamp).toLocaleString() : "N/A"}
          </div>

        </div>
      </div>
    </div>
  );
}