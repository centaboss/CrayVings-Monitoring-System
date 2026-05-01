import { useState, useMemo, useCallback } from "react";
import { FileText, Download, Clock, Thermometer, Waves, FlaskConical } from "lucide-react";
import { useSensors } from "../hooks/useSensors";
import { jsPDF } from "jspdf";
import "jspdf-autotable";

const PARAMETER_ICONS: Record<string, React.ReactNode> = {
  Temperature: <Thermometer size={14} className="text-blue-500" />,
  "pH Level": <FlaskConical size={14} className="text-emerald-500" />,
  "Water Level": <Waves size={14} className="text-indigo-500" />,
};

const PARAMETERS = ["all", "Temperature", "pH Level", "Water Level"] as const;
type ParameterFilter = typeof PARAMETERS[number];

export default function LogsPage() {
  const { logs, logsLoading, logsError, refetchLogs, logsPage, logsTotal, setLogsPage } = useSensors();
  const [filter, setFilter] = useState<ParameterFilter>("all");

  const filteredLogs = useMemo(
    () => (filter === "all" ? logs : logs.filter((log) => log.parameter === filter)),
    [logs, filter]
  );

  const totalPages = useMemo(() => Math.ceil(logsTotal / 20), [logsTotal]);
  const startItem = useMemo(() => ((logsPage - 1) * 20) + 1, [logsPage]);
  const endItem = useMemo(() => Math.min(logsPage * 20, logsTotal), [logsPage, logsTotal]);

  const handleExport = useCallback(() => {
    if (filteredLogs.length === 0) {
      alert("No logs to export.");
      return;
    }

    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();

    doc.setFontSize(20);
    doc.setFont("helvetica", "bold");
    doc.text("CRAYvings System Logs", pageWidth / 2, 20, { align: "center" });

    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");
    doc.text(`Generated on ${new Date().toLocaleString()}`, pageWidth / 2, 28, { align: "center" });

  const parameterCounts = filteredLogs.reduce<Record<string, number>>((acc, log) => {
    if (["Temperature", "pH Level", "Water Level"].includes(log.parameter)) {
      acc[log.parameter] = (acc[log.parameter] || 0) + 1;
    }
    return acc;
  }, { Temperature: 0, "pH Level": 0, "Water Level": 0 });

    const summaryY = 34;
    doc.setFontSize(11);
    doc.setFont("helvetica", "bold");
    doc.text("Summary", 14, summaryY);
    
    doc.setFontSize(9);
    doc.setFont("helvetica", "normal");
    let summaryLineY = summaryY + 6;
    doc.text(`Total Entries: ${filteredLogs.length}`, 14, summaryLineY);
    summaryLineY += 5;
    
    Object.entries(parameterCounts).forEach(([param, count]) => {
      doc.text(`${param}: ${count}`, 14, summaryLineY);
      summaryLineY += 5;
    });

    const tableStartY = summaryLineY + 8;

  const tableData = filteredLogs
    .filter((log) => ["Temperature", "pH Level", "Water Level"].includes(log.parameter))
    .map((log) => [
      log.timestamp ? new Date(log.timestamp).toLocaleString() : "-",
      log.parameter,
      String(log.old_value),
      String(log.new_value),
      log.action,
    ]);

    (doc as any).autoTable({
      startY: tableStartY,
      head: [["Timestamp", "Parameter", "Old Value", "New Value", "Action"]],
      body: tableData,
      styles: { 
        fontSize: 8, 
        cellPadding: 2.5,
        valign: "middle",
      },
      headStyles: { 
        fillColor: [241, 245, 249], 
        textColor: [30, 41, 59], 
        fontStyle: "bold",
        halign: "center",
      },
      alternateRowStyles: { 
        fillColor: [248, 250, 252] 
      },
      columnStyles: {
        0: { cellWidth: 45 },
        1: { cellWidth: 35 },
        2: { cellWidth: 30, halign: "center" },
        3: { cellWidth: 30, halign: "center" },
        4: { cellWidth: 35, halign: "center" },
      },
      margin: { left: 14, right: 14 },
      didDrawPage: (data: { doc: jsPDF }) => {
        const currentPage = (data.doc as any).internal.getNumberOfPages();
        const totalPages = (data.doc as any).internal.pages.length;

        data.doc.setFontSize(8);
        data.doc.setFont("helvetica", "normal");
        data.doc.setTextColor(128, 128, 128);
        
        data.doc.text(
          `Page ${currentPage} of ${totalPages}`,
          pageWidth / 2,
          pageHeight - 10,
          { align: "center" }
        );
        
        data.doc.text(
          "CRAYvings Monitoring System",
          14,
          pageHeight - 10
        );
        
        data.doc.text(
          `Exported: ${new Date().toLocaleDateString()}`,
          pageWidth - 14,
          pageHeight - 10,
          { align: "right" }
        );
      },
    });

    doc.save(`CRAYvings_System_Logs_${new Date().toISOString().split("T")[0]}.pdf`);
  }, [filteredLogs]);

  if (logsLoading) {
    return (
      <div className="bg-blue-50 border border-blue-200 text-blue-700 rounded-lg p-3 text-sm">
        Loading logs...
      </div>
    );
  }

  if (logsError) {
    return (
      <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg p-3 text-sm">
        <p>Failed to load logs</p>
        <p className="text-sm mt-1">{logsError}</p>
        <button
          onClick={refetchLogs}
          className="mt-2 px-3 py-1 bg-red-100 hover:bg-red-200 rounded text-sm"
        >
          Retry
        </button>
      </div>
    );
  }

  if (filteredLogs.length === 0) {
    return (
      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex gap-2 flex-wrap">
            {PARAMETERS.map((param) => (
              <button
                key={param}
                onClick={() => setFilter(param)}
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
        </div>
        <div className="bg-gray-50 border border-gray-200 text-gray-600 rounded-lg p-8 text-center">
          <FileText size={32} className="mx-auto mb-2 text-gray-400" />
          <p className="font-semibold">No logs found</p>
          <p className="text-sm">Changes in system parameters will appear here</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-2 flex-wrap">
          {PARAMETERS.map((param) => (
            <button
              key={param}
              onClick={() => setFilter(param)}
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
          onClick={handleExport}
          className="flex items-center gap-2 rounded-lg bg-[#c2410c] px-4 py-2 text-sm font-semibold text-white hover:bg-[#a13a0a]"
        >
          <Download size={16} />
          Export PDF
        </button>
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
                      {PARAMETER_ICONS[log.parameter] ?? (
                        <FileText size={14} className="text-gray-500" />
                      )}
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

      <div className="flex items-center justify-between">
        <p className="text-xs text-gray-400">
          Showing {startItem}-{endItem} of {logsTotal} logs
        </p>
        <div className="flex gap-1">
          <button
            onClick={() => setLogsPage(Math.max(1, logsPage - 1))}
            disabled={logsPage <= 1}
            className="px-3 py-1 text-sm border border-gray-200 rounded disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50"
          >
            Previous
          </button>
          <span className="px-3 py-1 text-sm text-gray-600">
            Page {logsPage} of {totalPages || 1}
          </span>
          <button
            onClick={() => setLogsPage(Math.min(totalPages, logsPage + 1))}
            disabled={logsPage >= totalPages}
            className="px-3 py-1 text-sm border border-gray-200 rounded disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50"
          >
            Next
          </button>
        </div>
      </div>
    </div>
  );
}