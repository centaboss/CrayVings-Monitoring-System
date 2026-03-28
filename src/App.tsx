import './App.css';
import { useEffect, useState } from "react";
import axios from "axios";

type SensorEntry = {
  device_id: string;
  temperature: number;
  water_level: number;
};

function App() {
  const [data, setData] = useState<SensorEntry[]>([]);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const res = await axios.get("http://192.168.100.17:3000/sensor");
        setData(res.data);
      } catch (err) {
        console.error("Error fetching sensor data:", err);
      }
    };

    fetchData();
    const interval = setInterval(fetchData, 5000); // fetch every 5s
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="p-10">
      <h1 className="text-3xl font-bold mb-6">
        Aquaculture Monitoring
      </h1>

      <div className="grid grid-cols-2 gap-6">
        {data.map((d, i) => (
          <div key={i} className="bg-white p-6 rounded shadow">
            <h2>Device: {d.device_id}</h2>
            <p className="text-2xl">Temperature: {d.temperature} °C</p>
            <p className="text-2xl">Water Level: {d.water_level} %</p>
          </div>
        ))}
      </div>
    </div>
  );
}

export default App;