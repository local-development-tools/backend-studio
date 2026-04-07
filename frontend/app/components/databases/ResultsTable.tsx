import { useEffect, useMemo, useRef, useState, type MouseEvent as ReactMouseEvent } from "react";
import { ScrollArea } from "../ui/scroll-area";
import { Input } from "../ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../ui/select";
import { Check, X } from "lucide-react";
import { editRecord } from "~/lib/api/databases";
import { toast } from "sonner";

interface ResultsTableProps {
  data: Record<string, any>[];
  rowCount?: number;
  isLoading?: boolean;
  table?: string;
  primaryKey?: string;
  columnEnumValues?: Record<string, string[]>;
  onDataUpdate?: (updatedData: Record<string, any>[]) => void;
  fontScale?: number;
  columnWidths?: Record<string, number>;
  onColumnWidthsChange?: (columnWidths: Record<string, number>) => void;
}

const DEFAULT_COLUMN_WIDTH = 220;
const MIN_COLUMN_WIDTH = 40;
const MAX_COLUMN_WIDTH = 640;

const clampColumnWidth = (value: number) =>
  Math.min(MAX_COLUMN_WIDTH, Math.max(MIN_COLUMN_WIDTH, value));

export const ResultsTable = ({
  data,
  rowCount,
  isLoading = false,
  table,
  primaryKey = "id",
  columnEnumValues = {},
  onDataUpdate,
  fontScale = 100,
  columnWidths = {},
  onColumnWidthsChange,
}: ResultsTableProps) => {
  const [editingCell, setEditingCell] = useState<{
    rowIdx: number;
    col: string;
  } | null>(null);
  const [editValue, setEditValue] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [localData, setLocalData] = useState(data);
  const [liveColumnWidths, setLiveColumnWidths] = useState<Record<string, number>>(columnWidths);
  const [resizingColumn, setResizingColumn] = useState<{
    column: string;
    startX: number;
    startWidth: number;
  } | null>(null);

  const liveColumnWidthsRef = useRef(liveColumnWidths);

  useEffect(() => {
    setLocalData(data);
  }, [data]);

  useEffect(() => {
    setLiveColumnWidths(columnWidths);
  }, [columnWidths]);

  useEffect(() => {
    liveColumnWidthsRef.current = liveColumnWidths;
  }, [liveColumnWidths]);

  const columns = useMemo(() => (localData.length > 0 ? Object.keys(localData[0]) : []), [localData]);
  const fontSizeRem = (0.55 * (fontScale / 100)).toFixed(3);
  const tableFontSize = `${fontSizeRem}rem`;
  const editorHeight = Math.max(22, Math.round(24 * (fontScale / 100)));
  const editorFontSize = `${Math.max(10, Math.round(11 * (fontScale / 100)))}px`;

  useEffect(() => {
    if (!resizingColumn) return;

    const handleMouseMove = (event: MouseEvent) => {
      const delta = event.clientX - resizingColumn.startX;
      const nextWidth = clampColumnWidth(resizingColumn.startWidth + delta);
      setLiveColumnWidths((prev) => ({
        ...prev,
        [resizingColumn.column]: nextWidth,
      }));
    };

    const handleMouseUp = () => {
      const committed = {
        ...liveColumnWidthsRef.current,
      };
      onColumnWidthsChange?.(committed);
      setResizingColumn(null);
    };

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [onColumnWidthsChange, resizingColumn]);

  if (isLoading) {
    return (
      <div className="text-sm text-muted-foreground p-4">Loading results...</div>
    );
  }

  if (!localData || localData.length === 0) {
    return (
      <div className="text-sm text-muted-foreground p-4">No results found</div>
    );
  }

  const handleCellClick = (rowIdx: number, col: string) => {
    setEditingCell({ rowIdx, col });
    setEditValue(String(localData[rowIdx][col] ?? ""));
  };

  const handleSave = async (rowIdx: number, col: string) => {
    if (!table) {
      toast.error("Table information required");
      return;
    }

    const primaryKeyValue = localData[rowIdx][primaryKey];
    if (primaryKeyValue === undefined) {
      toast.error(`Primary key '${primaryKey}' is missing in result row`);
      return;
    }

    setIsSaving(true);
    try {
      await editRecord({
        table,
        values: { [col]: editValue || null },
        where: { [primaryKey]: primaryKeyValue },
      });

      const updatedData = [...localData];
      updatedData[rowIdx][col] = editValue;
      setLocalData(updatedData);
      onDataUpdate?.(updatedData);
      
      setEditingCell(null);
      toast.success("Record updated successfully");
    } catch (error) {
      toast.error("Failed to update record");
      console.error(error);
    } finally {
      setIsSaving(false);
    }
  };

  const handleCancel = () => {
    setEditingCell(null);
    setEditValue("");
  };

  const handleColumnResizeStart = (
    event: ReactMouseEvent<HTMLDivElement>,
    column: string,
  ) => {
    event.preventDefault();
    event.stopPropagation();

    const width = liveColumnWidthsRef.current[column] ?? DEFAULT_COLUMN_WIDTH;
    setResizingColumn({
      column,
      startX: event.clientX,
      startWidth: width,
    });
  };

  return (
    <div className="flex flex-col flex-1 gap-2">
      <div className="text-xs text-muted-foreground">
        {rowCount !== undefined ? `${rowCount} rows` : `${localData.length} rows`}
      </div>
      <ScrollArea className="h-full">
        <div className="overflow-x-auto">
          <table className="w-full" style={{ fontSize: tableFontSize }}>
            <colgroup>
              {columns.map((col) => {
                const width = liveColumnWidths[col] ?? DEFAULT_COLUMN_WIDTH;
                return <col key={`col-${col}`} style={{ width }} />;
              })}
            </colgroup>
            <thead className="sticky top-0 bg-muted/30 border-b border-border">
              <tr>
                {columns.map((col) => (
                  <th
                    key={col}
                    className="relative select-none text-left px-3 py-2 font-semibold uppercase tracking-wide text-muted-foreground"
                  >
                    {col}
                    <div
                      className="absolute right-0 top-0 h-full w-2 cursor-col-resize hover:bg-primary/20"
                      onMouseDown={(event) => handleColumnResizeStart(event, col)}
                      title="Drag to resize column"
                    />
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {localData.map((row, idx) => (
                <tr key={idx} className="border-b border-border hover:bg-muted/30 transition-colors">
                  {columns.map((col) => {
                    const isEditing = editingCell?.rowIdx === idx && editingCell.col === col;
                    return (
                      <td
                        key={`${idx}-${col}`}
                        className="px-3 py-2 font-mono max-w-0 overflow-hidden"
                        onClick={() => {
                          if (!isEditing) {
                            handleCellClick(idx, col);
                          }
                        }}
                      >
                        {isEditing ? (
                          <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                            {columnEnumValues[col] ? (
                              <Select
                                value={editValue}
                                onValueChange={setEditValue}
                                disabled={isSaving}
                              >
                                <SelectTrigger
                                  size="sm"
                                  className="min-w-[7rem]"
                                  style={{
                                    height: `${editorHeight}px`,
                                    fontSize: editorFontSize,
                                  }}
                                  autoFocus
                                >
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  {columnEnumValues[col].map((option) => (
                                    <SelectItem
                                      key={option}
                                      value={option}
                                      style={{ fontSize: editorFontSize }}
                                    >
                                      {option}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            ) : (
                              <Input
                                value={editValue}
                                onChange={(e) => setEditValue(e.target.value)}
                                className="border-border"
                                style={{
                                  height: `${editorHeight}px`,
                                  fontSize: editorFontSize,
                                }}
                                disabled={isSaving}
                                autoFocus
                                onKeyDown={(e) => {
                                  if (e.key === "Enter") {
                                    handleSave(idx, col);
                                  } else if (e.key === "Escape") {
                                    handleCancel();
                                  }
                                }}
                              />
                            )}
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                void handleSave(idx, col);
                              }}
                              disabled={isSaving}
                              className="p-0.5 hover:bg-green-500/10 rounded transition-colors"
                            >
                              <Check className="h-3 w-3 text-green-600" />
                            </button>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleCancel();
                              }}
                              disabled={isSaving}
                              className="p-0.5 hover:bg-red-500/10 rounded transition-colors"
                            >
                              <X className="h-3 w-3 text-red-600" />
                            </button>
                          </div>
                        ) : (
                          <div className="cursor-pointer truncate" title={row[col] !== null && row[col] !== undefined ? String(row[col]) : "NULL"}>
                            {row[col] !== null && row[col] !== undefined
                              ? String(row[col])
                              : "NULL"}
                          </div>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </ScrollArea>
    </div>
  );
};
