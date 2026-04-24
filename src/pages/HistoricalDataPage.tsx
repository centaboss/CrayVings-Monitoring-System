import { useEffect, useState, useCallback } from "react";
import axios from "axios";
import { 
  History, 
  Thermometer, 
  Waves, 
  FlaskConical, 
  Droplets,
  Filter
} from "lucide-react";
import TrendCard from "../components/TrendCard";
import type { ChartPoint, SensorEntry } from "../types";
import { API_BASE } from "../types";

type Props = {
  history: ChartPoint[];
};

type TimeRange = "1h" | "6h" | "24h" | "all";

export default function HistoricalDataPage({ history: propHistory }: Props) {
  const [timeRange, setTimeRange] = useState<TimeRange>("all");
  const [sensorHistory, setSensorHistory] = useState<SensorEntry[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchHistory = useCallback(async () => {
    try {
      setLoading(true);
      const res = await axios.get<SensorEntry[]>(`${API_BASE}/sensor`);
      let data = res.data || [];
      
      if (timeRange !== "all") {
        const now = Date.now();
        const hours = timeRange === "1h" ? 1 : timeRange === "6h" ? 6 : 24;
        const cutoff = now - hours * 60 * 60 * 1000;
        
        data = data.filter((item: SensorEntry) => 
          item.timestamp && new Date(item.timestamp).getTime() > cutoff
        );
      }
      
      setSensorHistory(data.slice().reverse());
    } catch (err) {
      console.error("Fetch history error:", err);
    } finally {
      setLoading(false);
    }
  }, [timeRange]);

  useEffect(() => {
    fetchHistory();
  }, [fetchHistory]);

  const timeRanges: { value: TimeRange; label: string }[] = [
    { value: "1h", label: "1 Hour" },
    { value: "6h", label: "6 Hours" },
    { value: "24h", label: "24 Hours" },
    { value: "all", label: "All Time" },
  ];

  const chartData = sensorHistory.map((item) => ({
    name: item.timestamp 
      ? new Date(item.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
      : "--:--",
    temperature: Number(item.temperature) || 0,
    water_level: Number(item.water_level) || 0,
    ph: Number(item.ph) || 0,
    dissolved_oxygen: Number(item.dissolved_oxygen) || 0,
    ammonia: Number(item.ammonia) || 0,
  }));

  const latestReading = sensorHistory[sensorHistory.length - 1];

  if (!propHistory.length && !sensorHistory.length) {
    return (
      <div className="bg-white rounded-xl border border-gray-100 p-8 text-center">
        <History size={40} className="mx-auto mb-3 text-gray-400" />
        <h2 className="mt-0 text-gray-800">Historical Data</h2>
        <p className="text-gray-600">No historical data available yet.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-xl border border-gray-100 p-5">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="mt-0 text-gray-800 flex items-center gap-2">
              <History size={20} className="text-blue-500" />
              Historical Data
            </h2>
            <p className="text-gray-600 text-sm mt-1">
              View sensor data trends over time
            </p>
          </div>
        </div>
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        <Filter size={16} className="text-gray-500" />
        {timeRanges.map((range) => (
          <button
            key={range.value}
            onClick={() => setTimeRange(range.value)}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition ${
              timeRange === range.value
                ? "bg-blue-500 text-white"
                : "bg-white border border-gray-200 text-gray-600 hover:bg-gray-50"
            }`}
          >
            {range.label}
          </button>
        ))}
      </div>

      {sensorHistory.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className="bg-white rounded-xl border border-gray-100 p-4">
            <div className="flex items-center gap-2 text-gray-500 mb-1">
              <Thermometer size={14} />
              <span className="text-xs font-medium">Temperature</span>
            </div>
            <div className="text-xl font-bold text-gray-800">
              {latestReading?.temperature ?? "--"}°C
            </div>
          </div>

          <div className="bg-white rounded-xl border border-gray-100 p-4">
            <div className="flex items-center gap-2 text-gray-500 mb-1">
              <FlaskConical size={14} />
              <span className="text-xs font-medium">pH Level</span>
            </div>
            <div className="text-xl font-bold text-gray-800">
              {latestReading?.ph ?? "--"}
            </div>
          </div>

          <div className="bg-white rounded-xl border border-gray-100 p-4">
            <div className="flex items-center gap-2 text-gray-500 mb-1">
              <Waves size={14} />
              <span className="text-xs font-medium">Water Level</span>
            </div>
            <div className="text-xl font-bold text-gray-800">
              {latestReading?.water_level ?? "--"}%
            </div>
          </div>

          <div className="bg-white rounded-xl border border-gray-100 p-4">
            <div className="flex items-center gap-2 text-gray-500 mb-1">
              <Droplets size={14} />
              <span className="text-xs font-medium">Dissolved O₂</span>
            </div>
            <div className="text-xl font-bold text-gray-800">
              {latestReading?.dissolved_oxygen ?? "--"} mg/L
            </div>
          </div>
        </div>
      )}

      {loading ? (
        <div className="bg-white rounded-xl border border-gray-100 p-8 text-center">
          <p className="text-gray-600">Loading chart data...</p>
        </div>
      ) : chartData.length > 0 ? (
        <div className="grid grid-cols-2 gap-3">
          <TrendCard
            title="Temperature"
            data={chartData}
            dataKey="temperature"
            stroke="#f97316"
          />
          <TrendCard
            title="Water Level"
            data={chartData}
            dataKey="water_level"
            stroke="#2563eb"
          />
          <TrendCard
            title="pH Level"
            data={chartData}
            dataKey="ph"
            stroke="#6366f1"
          />
          <TrendCard
            title="Dissolved Oxygen"
            data={chartData}
            dataKey="dissolved_oxygen"
            stroke="#0ea5e9"
          />
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-100 p-8 text-center">
          <History size={40} className="mx-auto mb-3 text-gray-400" />
          <p className="text-gray-600">No data for selected time range.</p>
        </div>
      )}

      {sensorHistory.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-100">
            <h3 className="font-semibold text-gray-800">Raw Data</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-gray-50 text-gray-500">
                <tr>
                  <th className="px-4 py-2 text-left">Time</th>
                  <th className="px-4 py-2 text-center">Temp (°C)</th>
                  <th className="px-4 py-2 text-center">pH</th>
                  <th className="px-4 py-2 text-center">Water Level (%)</th>
                  <th className="px-4 py-2 text-center">DO (mg/L)</th>
                </tr>
              </thead>
              <tbody>
                {sensorHistory.slice(0, 20).map((item, i) => (
                  <tr key={i} className="border-t">
                    <td className="px-4 py-2 text-gray-600">
                      {item.timestamp 
                        ? new Date(item.timestamp).toLocaleString() 
                        : "N/A"
                      }
                    </td>
                    <td className="px-4 py-2 text-center font-medium">{item.temperature}</td>
                    <td className="px-4 py-2 text-center font-medium">{item.ph}</td>
                    <td className="px-4 py-2 text-center font-medium">{item.water_level}</td>
                    <td className="px-4 py-2 text-center font-medium">{item.dissolved_oxygen}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}