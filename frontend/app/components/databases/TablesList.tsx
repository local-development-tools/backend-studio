import { Card, CardContent, CardHeader, CardTitle } from "../ui/card";
import { ScrollArea } from "../ui/scroll-area";
import { Button } from "../ui/button";
import { RefreshCw } from "lucide-react";

export interface Table {
  name: string;
  rowCount: number;
}

interface TablesListProps {
  tables: Table[];
  selectedTable?: string;
  onSelectTable?: (tableName: string) => void;
  isLoading?: boolean;
  onRefresh?: () => void;
  canRefresh?: boolean;
}

export const TablesList = ({
  tables,
  selectedTable,
  onSelectTable,
  isLoading = false,
  onRefresh,
  canRefresh = true,
}: TablesListProps) => {
  return (
    <div className="flex-1 flex flex-col min-h-0">
      <div className="px-3 py-2 border-b border-border flex items-center justify-between gap-2">
        <h3 className="text-xs font-medium text-muted-foreground">Tables</h3>
        <Button
          variant="ghost"
          size="sm"
          className="h-7 px-2 text-xs gap-1"
          onClick={onRefresh}
          disabled={isLoading || !canRefresh}
          title="Refresh tables"
        >
          <RefreshCw className="h-3.5 w-3.5" />
          Refresh
        </Button>
      </div>
      <ScrollArea className="flex-1 min-h-0">
        <div className="space-y-0">
            {isLoading ? (
              <div className="px-3 py-2 text-xs text-muted-foreground">Loading tables...</div>
            ) : tables.length === 0 ? (
              <div className="px-3 py-2 text-xs text-muted-foreground">No tables found</div>
            ) : (
              tables.map((table) => (
                <div
                  key={table.name}
                  onClick={() => onSelectTable?.(table.name)}
                  className={`px-3 py-2 text-xs border-b border-border cursor-pointer transition-colors ${
                    selectedTable === table.name
                      ? "bg-accent text-accent-foreground"
                      : "hover:bg-muted/50"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-medium">{table.name}</span>
                    <span className="text-muted-foreground text-[10px]">
                      {table.rowCount.toLocaleString()}
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>
        </ScrollArea>
    </div>
  );
};
