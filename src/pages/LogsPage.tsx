import { useEffect, useState } from "react";
import axios from "axios";
import { FileText, Download, Clock, Thermometer, Droplets, Waves, FlaskConical, AlertCircle } from "lucide-react";
import type { LogEntry } from "../types";
import { LOGS_ENDPOINT } from "../types";

export default function LogsPage() {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState<"all" | "Temperature" | "pH Level" | "Water Level" | "Dissolved Oxygen" | "Ammonia">("all");

  const fetchLogs = async () => {
    try {
      console.log("Fetching from:", LOGS_ENDPOINT);
      const res = await axios.get<LogEntry[]>(LOGS_ENDPOINT);
      console.log("Logs response:", res.data);
      setLogs(res.data || []);
      setError("");
    } catch (err: unknown) {
      console.error("Fetch logs error:", err);
      const errorObj = err as { message?: string; response?: { status?: number } };
      setError(`Failed to fetch logs: ${errorObj.message || errorObj.response?.status || "Unknown error"}`);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLogs();
    const interval = setInterval(fetchLogs, 5000);
    return () => clearInterval(interval);
  }, []);

  const filteredLogs = logs.filter(log => 
    filter === "all" || log.parameter === filter
  );

  const getParameterIcon = (parameter: string) => {
    switch (parameter) {
      case "Temperature":
        return <Thermometer size={14} className="text-blue-500" />;
      case "pH Level":
        return <FlaskConical size={14} className="text-emerald-500" />;
      case "Water Level":
        return <Waves size={14} className="text-indigo-500" />;
      case "Dissolved Oxygen":
        return <Droplets size={14} className="text-sky-500" />;
      case "Ammonia":
        return <AlertCircle size={14} className="text-orange-500" />;
      default:
        return <FileText size={14} className="text-gray-500" />;
    }
  };

  const exportToPDF = () => {
    const printWindow = window.open("", "_blank");
    if (!printWindow) return;

    const html = `
      <!DOCTYPE html>
      <html>
        <head>
          <title>CRAYvings System Logs - ${new Date().toLocaleDateString()}</title>
          <style>
            body { font-family: Arial, sans-serif; padding: 20px; }
            h1 { color: #1e293b; margin-bottom: 5px; }
            .date { color: #64748b; margin-bottom: 20px; }
            table { width: 100%; border-collapse: collapse; }
            th, td { border: 1px solid #e2e8f0; padding: 10px; text-align: left; }
            th { background: #f1f5f9; }
            .temp { color: #3b82f6; }
            .ph { color: #10b981; }
            .level { color: #6366f1; }
            .oxygen { color: #0ea5e9; }
            .ammonia { color: #f97316; }
            @media print { body { margin: 0; } }
          </style>
        </head>
        <body>
          <h1>CRAYvings System Logs</h1>
          <p class="date">Generated on ${new Date().toLocaleString()}</p>
          <table>
            <thead>
              <tr>
                <th>Timestamp</th>
                <th>Parameter</th>
                <th>Old Value</th>
                <th>New Value</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              ${filteredLogs.map(log => `
                <tr>
                  <td>${log.timestamp ? new Date(log.timestamp).toLocaleString() : "-"}</td>
                  <td>${log.parameter}</td>
                  <td>${log.old_value}</td>
                  <td>${log.new_value}</td>
                  <td>${log.action}</td>
                </tr>
              `).join("")}
            </tbody>
          </table>
        </body>
      </html>
    `;

    printWindow.document.write(html);
    printWindow.document.close();
    printWindow.focus();
    setTimeout(() => {
      printWindow.print();
    }, 250);
  };

  const parameters = ["all", "Temperature", "pH Level", "Water Level", "Dissolved Oxygen", "Ammonia"];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-2 flex-wrap">
          {parameters.map((param) => (
            <button
              key={param}
              onClick={() => setFilter(param as typeof filter)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
                filter === param
                  ? "bg-[#c2410c] text-white"
                  : "bg-white text-gray-600 border border-gray-200 hover:bg-gray-50"
              }`}
            >
              {param === "all" ? "All" : param}
            </button>
          ))}
        </div>

        <button
          onClick={exportToPDF}
          className="flex items-center gap-2 rounded-lg bg-[#c2410c] px-4 py-2 text-sm font-semibold text-white hover:bg-[#a13a0a]"
        >
          <Download size={16} />
          Export PDF
        </button>
      </div>

      {loading ? (
        <div className="bg-blue-50 border border-blue-200 text-blue-700 rounded-lg p-3 text-sm">
          Loading logs...
        </div>
      ) : error ? (
        <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg p-3 text-sm">
          {error}
        </div>
      ) : filteredLogs.length === 0 ? (
        <div className="bg-gray-50 border border-gray-200 text-gray-600 rounded-lg p-8 text-center">
          <FileText size={32} className="mx-auto mb-2 text-gray-400" />
          <p className="font-semibold">No logs found</p>
          <p className="text-sm">Changes in system parameters will appear here</p>
        </div>
      ) : (
        <>
          <div className="hidden print:block">
            <h1>CRAYvings System Logs</h1>
            <p>Generated on {new Date().toLocaleString()}</p>
          </div>

          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-200">
                    <th className="px-4 py-3 text-left text-xs font-bold text-gray-500 uppercase">
                      <Clock size={14} className="inline mr-1" />
                      Timestamp
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-bold text-gray-500 uppercase">
                      Parameter
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-bold text-gray-500 uppercase">
                      Old Value
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-bold text-gray-500 uppercase">
                      New Value
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-bold text-gray-500 uppercase">
                      Action
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {filteredLogs.map((log, index) => (
                    <tr
                      key={log.id ?? index}
                      className="border-b border-gray-100 last:border-0 hover:bg-gray-50"
                    >
                      <td className="px-4 py-3 text-sm text-gray-600">
                        {log.timestamp
                          ? new Date(log.timestamp).toLocaleString()
                          : "-"}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          {getParameterIcon(log.parameter)}
                          <span className="text-sm font-medium text-gray-800">
                            {log.parameter}
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-600">
                        {log.old_value}
                      </td>
                      <td className="px-4 py-3 text-sm font-semibold text-gray-800">
                        {log.new_value}
                      </td>
                      <td className="px-4 py-3">
                        <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-amber-100 text-amber-700">
                          {log.action}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <p className="text-xs text-gray-400 text-right">
            Showing {filteredLogs.length} log(s)
          </p>
        </>
      )}
    </div>
  );
}