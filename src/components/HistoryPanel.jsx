"use client";

import { useState } from "react";
import useSWR from "swr";
import { supabase } from "@/lib/supabase";
import { format } from "date-fns";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Eye, Download, Search, Loader2, Printer } from "lucide-react";

/**
 * HistoryPanel - Reusable history panel for any document type
 *
 * @param {string} title - Panel title
 * @param {string} tableName - Supabase table name
 * @param {string} selectQuery - Supabase select query
 * @param {function} renderRow - Function to render a table row (item) => JSX
 * @param {function} renderPreview - Function to render preview modal content (item) => JSX
 * @param {string[]} columns - Column headers
 * @param {function} getDocNumber - Extract doc number from item
 * @param {function} getSummary - Extract summary from item
 * @param {function} exportRow - Format a row for CSV export
 */
export function HistoryPanel({
  title = "History",
  tableName,
  selectQuery = "*",
  columns = ["Date", "Document #", "Summary", "Status", "Actions"],
  renderRow,
  renderPreview,
  getDocNumber = (item) => item.id?.substring(0, 8),
  getSummary = () => "",
  exportRow,
  orderBy = "created_at",
}) {
  const [search, setSearch] = useState("");
  const [previewDoc, setPreviewDoc] = useState(null);

  const { data: records = [], isLoading } = useSWR(
    `history-${tableName}`,
    async () => {
      const { data, error } = await supabase
        .from(tableName)
        .select(selectQuery)
        .order(orderBy, { ascending: false })
        .limit(200);
      if (error) throw error;
      return data || [];
    }
  );

  const filtered = records.filter((item) => {
    if (!search) return true;
    const searchLower = search.toLowerCase();
    const docNum = getDocNumber(item) || "";
    const summary = getSummary(item) || "";
    return (
      docNum.toLowerCase().includes(searchLower) ||
      summary.toLowerCase().includes(searchLower) ||
      JSON.stringify(item).toLowerCase().includes(searchLower)
    );
  });

  const handleExportCSV = () => {
    if (filtered.length === 0) return;
    const headers = columns.filter((c) => c !== "Actions").join(",") + "\n";
    const rows = filtered
      .map((item) => {
        if (exportRow) return exportRow(item);
        const docNum = (getDocNumber(item) || "").replace(/"/g, '""');
        const summary = (getSummary(item) || "").replace(/"/g, '""');
        const status = (item.status || "").replace(/"/g, '""');
        return `"${format(new Date(item.created_at), "yyyy-MM-dd HH:mm")}","${docNum}","${summary}","${status}"`;
      })
      .join("\n");

    // Use Blob + createObjectURL for reliable downloads (encodeURI breaks on #, $, & etc.)
    const blob = new Blob([headers + rows], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `${tableName}_history_${format(new Date(), "yyyy-MM-dd")}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handlePrint = () => {
    window.print();
  };

  return (
    <>
      <Card className="animate-fadeIn">
        <CardHeader className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <CardTitle className="text-lg">{title}</CardTitle>
            <CardDescription>
              {filtered.length} record{filtered.length !== 1 ? "s" : ""} found
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <div className="relative flex-1 sm:w-64">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search records..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9 h-9"
              />
            </div>
            <Button variant="outline" size="sm" onClick={handleExportCSV} disabled={filtered.length === 0}>
              <Download className="h-3.5 w-3.5 mr-1.5" /> CSV
            </Button>
            <Button variant="outline" size="sm" onClick={handlePrint}>
              <Printer className="h-3.5 w-3.5 mr-1.5" /> Print
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground text-sm">
              No records found.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    {columns.map((col) => (
                      <TableHead key={col} className={col === "Actions" ? "text-right" : ""}>
                        {col}
                      </TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((item) =>
                    renderRow ? (
                      renderRow(item, () => setPreviewDoc(item))
                    ) : (
                      <TableRow key={item.id}>
                        <TableCell className="whitespace-nowrap text-sm">
                          {format(new Date(item.created_at), "MMM dd, yyyy HH:mm")}
                        </TableCell>
                        <TableCell className="font-medium font-mono text-sm">
                          {getDocNumber(item)}
                        </TableCell>
                        <TableCell className="text-muted-foreground text-sm">
                          {getSummary(item)}
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant="outline"
                            className={`capitalize text-[11px] ${
                              item.status === "approved" || item.status === "completed"
                                ? "status-approved"
                                : item.status === "rejected"
                                ? "status-rejected"
                                : item.status === "pending"
                                ? "status-pending"
                                : "status-draft"
                            }`}
                          >
                            {item.status || "—"}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setPreviewDoc(item)}
                          >
                            <Eye className="h-3.5 w-3.5 mr-1.5" /> View
                          </Button>
                        </TableCell>
                      </TableRow>
                    )
                  )}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Preview Modal */}
      <Dialog open={!!previewDoc} onOpenChange={(o) => !o && setPreviewDoc(null)}>
        <DialogContent className="max-w-[100vw] w-full md:max-w-[1200px] h-[100vh] p-0 gap-0 overflow-hidden border-none bg-black/80 backdrop-blur-sm shadow-2xl">
          <DialogHeader className="sr-only">
            <DialogTitle>{title} Preview</DialogTitle>
            <DialogDescription>{previewDoc && getDocNumber(previewDoc)}</DialogDescription>
          </DialogHeader>
          <div className="h-full w-full overflow-y-auto p-4 md:p-8 flex items-start justify-center custom-scrollbar scroll-smooth">
            <div className="w-full max-w-[210mm] relative animate-in fade-in zoom-in-95 duration-300 ease-out py-8">
              {previewDoc && renderPreview
                ? renderPreview(previewDoc)
                : previewDoc && (
                    <div className="bg-white rounded-xl shadow-xl p-8 border border-gray-200 min-h-[400px]">
                      <div className="flex items-center justify-between mb-8 border-b pb-4">
                        <h3 className="text-xl font-bold text-gray-900 capitalize italic">{tableName.replace(/_/g, " ")} Details</h3>
                        <Badge variant="outline" className="font-mono text-[10px]">{previewDoc.id}</Badge>
                      </div>
                      <div className="p-6 bg-gray-50 rounded-lg border border-dashed border-gray-300">
                        <p className="text-sm text-muted-foreground mb-4 font-medium">No specialized template found for this record type. Showing raw data:</p>
                        <pre className="text-[11px] font-mono leading-relaxed bg-white p-4 rounded border text-gray-700 overflow-auto max-h-[500px]">
                          {JSON.stringify(previewDoc, null, 2)}
                        </pre>
                      </div>
                    </div>
                  )}
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
