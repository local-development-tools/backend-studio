import React, { useState, useEffect } from "react";
import { Link } from "react-router";
import { DatabaseSelector } from "./DatabaseSelector";
import { TablesList, type Table } from "./TablesList";
import { SqlQueryEditor } from "./SqlQueryEditor";
import { ResultsTable } from "./ResultsTable";
import { PromptsSidebar } from "./PromptsSidebar";
import {
  getDatabases,
  getSchemas,
  getTableEnumValues,
  getTableRowCounts,
  getTableSchema,
  getTables,
  query as queryDatabase,
} from "~/lib/api/databases";
import { saveSqlPrompt } from "~/lib/api/ai";
import { getDatabaseSettings, patchDatabaseSettings } from "~/lib/api/settings";
import { toast } from "sonner";
import { Database, Minus, Plus, RotateCcw, TriangleAlert } from "lucide-react";
import { Button } from "../ui/button";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "../ui/resizable";

const STORAGE_KEY = "defaultDatabase";
const SCHEMA_STORAGE_KEY = "defaultSchema";
const TABLE_DISPLAY_STORAGE_KEY = "databaseViewer.tableDisplayPrefs.v1";
const DEFAULT_FONT_SCALE = 100;
const MIN_FONT_SCALE = 85;
const MAX_FONT_SCALE = 140;
const FONT_SCALE_STEP = 5;

interface TableDisplayPreference {
  fontScale: number;
  columnWidths: Record<string, number>;
}

type TableDisplayPreferenceMap = Record<string, TableDisplayPreference>;

const getTablePreferenceKey = (database: string, schema: string, table?: string) =>
  `${database || "__no_db__"}::${schema || "public"}::${table || "__ad_hoc__"}`;

const sanitizeFontScale = (value: number) =>
  Math.min(MAX_FONT_SCALE, Math.max(MIN_FONT_SCALE, value));

const loadTableDisplayPreferences = (): TableDisplayPreferenceMap => {
  try {
    const raw = localStorage.getItem(TABLE_DISPLAY_STORAGE_KEY);
    if (!raw) return {};

    const parsed = JSON.parse(raw) as TableDisplayPreferenceMap;
    if (!parsed || typeof parsed !== "object") return {};

    return parsed;
  } catch {
    return {};
  }
};

export const DatabasesScreen = () => {
  const [selectedDatabase, setSelectedDatabase] = useState("");
  const [selectedSchema, setSelectedSchema] = useState("public");
  const [selectedTable, setSelectedTable] = useState<string>("");
  const [sqlQuery, setSqlQuery] = useState("SELECT * FROM users LIMIT 10;");
  const [isExecuting, setIsExecuting] = useState(false);
  const [queryResults, setQueryResults] = useState<any>(null);

  const [databases, setDatabases] = useState<string[]>([]);
  const [tables, setTables] = useState<Table[]>([]);
  const [schemas, setSchemas] = useState(["public"]);
  const [isLoadingDatabases, setIsLoadingDatabases] = useState(true);
  const [isLoadingTables, setIsLoadingTables] = useState(false);
  const [primaryKey, setPrimaryKey] = useState("id");
  const [columnEnumValues, setColumnEnumValues] = useState<Record<string, string[]>>({});
  const [isDbConnected, setIsDbConnected] = useState<boolean | null>(null);
  const [tableDisplayPrefs, setTableDisplayPrefs] = useState<TableDisplayPreferenceMap>({});
  const [promptsSidebarOpen, setPromptsSidebarOpen] = useState(false);
  const [promptsRefreshToken, setPromptsRefreshToken] = useState(0);

  const tablePreferenceKey = getTablePreferenceKey(
    selectedDatabase,
    selectedSchema,
    selectedTable || undefined,
  );
  const activeTablePreference = tableDisplayPrefs[tablePreferenceKey];
  const fontScale = activeTablePreference?.fontScale ?? DEFAULT_FONT_SCALE;
  const columnWidths = activeTablePreference?.columnWidths ?? {};

  const updateActiveTablePreference = (
    update: (current: TableDisplayPreference) => TableDisplayPreference,
  ) => {
    setTableDisplayPrefs((prev) => {
      const current = prev[tablePreferenceKey] ?? {
        fontScale: DEFAULT_FONT_SCALE,
        columnWidths: {},
      };
      const nextPreference = update(current);
      const next = {
        ...prev,
        [tablePreferenceKey]: nextPreference,
      };
      localStorage.setItem(TABLE_DISPLAY_STORAGE_KEY, JSON.stringify(next));
      return next;
    });
  };

  const loadTablesForDatabase = async (
    database: string,
    options?: { resetSelection?: boolean; schema?: string },
  ) => {
    const resetSelection = options?.resetSelection ?? false;
    const schema = options?.schema ?? selectedSchema;

    setIsLoadingTables(true);
    try {
      const tableList = await getTables(database, schema);

      let nextSelectedTable = selectedTable;
      if (resetSelection) {
        nextSelectedTable = "";
        setSelectedTable("");
        setQueryResults(null);
        setPrimaryKey("id");
      }

      if (nextSelectedTable && !tableList.some((table) => table.name === nextSelectedTable)) {
        nextSelectedTable = "";
        setSelectedTable("");
      }

      let nextTables = tableList;
      if (tableList.length > 0) {
        try {
          const tableNames = tableList.map((table) => table.name);
          const counts = await getTableRowCounts(database, tableNames, schema);
          nextTables = tableList.map((table) => ({
            ...table,
            rowCount: counts[table.name] ?? 0,
          }));
        } catch (error) {
          console.warn("Failed to load row counts", error);
        }
      }

      setTables([...nextTables].sort((a, b) => a.name.localeCompare(b.name)));
    } catch (error) {
      toast.error("Failed to load tables");
      console.error(error);
    } finally {
      setIsLoadingTables(false);
    }
  };

  const loadDatabases = async (preferredDatabase?: string) => {
    try {
      const dbs = await getDatabases();
      setDatabases(dbs);

      const savedDefault = localStorage.getItem(STORAGE_KEY);
      const candidate = preferredDatabase ?? savedDefault ?? dbs[0];
      const defaultDb = candidate && dbs.includes(candidate) ? candidate : dbs[0];

      setSelectedDatabase(defaultDb || "");

      if (defaultDb) {
        localStorage.setItem(STORAGE_KEY, defaultDb);
      }
    } catch (error) {
      toast.error("Failed to load databases");
      console.error(error);
    } finally {
      setIsLoadingDatabases(false);
    }
  };

  // Load databases on mount.
  useEffect(() => {
    setTableDisplayPrefs(loadTableDisplayPreferences());

    const initialize = async () => {
      try {
        const settings = await getDatabaseSettings();
        setIsDbConnected(settings.connected);

        if (!settings.connected) {
          setIsLoadingDatabases(false);
          return;
        }

        await loadDatabases(settings.database ?? undefined);
      } catch (error) {
        console.warn("Failed to verify DB connection status, falling back to databases load", error);
        setIsDbConnected(true);
        await loadDatabases();
      }
    };

    void initialize();
  }, []);

  // Load schemas and tables when database changes.
  useEffect(() => {
    if (!selectedDatabase) return;

    const loadSchemasAndTables = async () => {
      try {
        const schemaList = await getSchemas(selectedDatabase);
        const savedSchema = localStorage.getItem(SCHEMA_STORAGE_KEY);
        const fallback = schemaList.includes("public") ? "public" : (schemaList[0] ?? "public");
        const nextSchema = savedSchema && schemaList.includes(savedSchema) ? savedSchema : fallback;
        setSchemas(schemaList.length > 0 ? schemaList : ["public"]);
        setSelectedSchema(nextSchema);
        await loadTablesForDatabase(selectedDatabase, { resetSelection: true, schema: nextSchema });
      } catch (error) {
        console.error("Failed to load schemas", error);
        await loadTablesForDatabase(selectedDatabase, { resetSelection: true });
      }
    };

    void loadSchemasAndTables();
  }, [selectedDatabase]);

  // Reload tables when schema changes (but not on the initial database-driven load).
  const prevDatabaseRef = React.useRef<string>("");
  useEffect(() => {
    if (!selectedDatabase || prevDatabaseRef.current !== selectedDatabase) {
      prevDatabaseRef.current = selectedDatabase;
      return;
    }
    void loadTablesForDatabase(selectedDatabase, { resetSelection: true, schema: selectedSchema });
  }, [selectedSchema]);

  // Load column metadata when table changes.
  useEffect(() => {
    if (!selectedDatabase || !selectedTable) {
      setColumnEnumValues({});
      return;
    }

    const loadColumnMeta = async () => {
      try {
        const [tableSchema, enumValues] = await Promise.all([
          getTableSchema(selectedDatabase, selectedTable),
          getTableEnumValues(selectedDatabase, selectedTable, selectedSchema),
        ]);
        if (tableSchema.primaryKey) {
          setPrimaryKey(tableSchema.primaryKey);
        }
        setColumnEnumValues(enumValues);
      } catch (error) {
        console.error("Failed to load column metadata", error);
      }
    };

    void loadColumnMeta();
  }, [selectedDatabase, selectedTable]);

  const handleSelectTable = async (table: string) => {
    setSelectedTable(table);
    if (!table) return;

    const escapedTable = table.replace(/"/g, '""');
    let orderClause = "";
    try {
      const schema = await getTableSchema(selectedDatabase, table);
      const orderByColumn = ["created_at", "created"].find((col) =>
        schema.columns.some((c) => c.column_name === col),
      );
      if (orderByColumn) {
        orderClause = ` ORDER BY ${orderByColumn} DESC`;
      }
    } catch {
      // If schema fetch fails, skip ordering
    }
    const sql = `SELECT * FROM "${escapedTable}"${orderClause} LIMIT 100;`;
    setSqlQuery(sql);
    void handleExecuteQuery(sql);
  };

  const handleExecuteQuery = async (sql: string) => {
    setIsExecuting(true);
    try {
      const result = await queryDatabase(sql, undefined, selectedSchema);
      setQueryResults({
        data: result.data,
        rowCount: result.rowCount,
      });
      toast.success("Query executed successfully");
    } catch (error) {
      toast.error("Query execution failed");
      console.error(error);
    } finally {
      setIsExecuting(false);
    }
  };

  const handleDatabaseChange = (newDb: string) => {
    setSelectedDatabase(newDb);
    // Save to localStorage as default
    localStorage.setItem(STORAGE_KEY, newDb);

    void patchDatabaseSettings({ database: newDb }).catch((error) => {
      console.error("Failed to sync selected database with settings", error);
      toast.error("Failed to sync selected database with settings");
    });
  };

  const handleDataUpdate = (updatedData: Record<string, any>[]) => {
    setQueryResults({
      data: updatedData,
      rowCount: updatedData.length,
    });
  };

  const handleRefreshTables = () => {
    if (!selectedDatabase) return;
    void loadTablesForDatabase(selectedDatabase, { resetSelection: false });
  };

  const handleDatabaseCloned = (newDatabase?: string) => {
    setIsDbConnected(true);
    setIsLoadingDatabases(true);
    void loadDatabases(newDatabase);
  };

  const handleDecreaseFontScale = () => {
    updateActiveTablePreference((current) => ({
      ...current,
      fontScale: sanitizeFontScale(current.fontScale - FONT_SCALE_STEP),
    }));
  };

  const handleIncreaseFontScale = () => {
    updateActiveTablePreference((current) => ({
      ...current,
      fontScale: sanitizeFontScale(current.fontScale + FONT_SCALE_STEP),
    }));
  };

  const handleResetTableView = () => {
    updateActiveTablePreference(() => ({
      fontScale: DEFAULT_FONT_SCALE,
      columnWidths: {},
    }));
  };

  const handleColumnWidthsChange = (nextColumnWidths: Record<string, number>) => {
    updateActiveTablePreference((current) => ({
      ...current,
      columnWidths: nextColumnWidths,
    }));
  };

  const handleSaveSql = async (sql: string) => {
    const trimmedSql = sql.trim();
    if (!trimmedSql) {
      toast.error("SQL is empty");
      return;
    }

    const defaultTitle = selectedTable ? `Saved from table ${selectedTable}` : "Saved from SQL editor";
    const titleInput = window.prompt("Prompt title", defaultTitle);
    if (titleInput === null) {
      return;
    }
    const finalTitle = titleInput.trim() || defaultTitle;

    try {
      await saveSqlPrompt({
        sql: trimmedSql,
        title: finalTitle,
        question: finalTitle,
      });
      toast.success("SQL saved to prompts history");
      setPromptsSidebarOpen(true);
      setPromptsRefreshToken((value) => value + 1);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to save SQL";
      toast.error(message);
    }
  };

  const handlePastePromptSql = (sql: string) => {
    setSqlQuery(sql);
  };

  if (!isLoadingDatabases && isDbConnected === false) {
    return (
      <div className="flex h-full w-full items-center justify-center p-6">
        <div className="w-full max-w-md rounded-lg border border-border bg-background p-6 shadow-sm">
          <div className="mb-3 flex items-center gap-2">
            <Database className="h-5 w-5" />
            <h2 className="text-base font-semibold">Database Not Connected</h2>
          </div>
          <div className="mb-4 flex items-start gap-2 rounded-md border border-yellow-500/40 bg-yellow-500/10 px-3 py-2 text-sm text-yellow-700 dark:text-yellow-300">
            <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" />
            <span>Connect PostgreSQL in Settings before using Database Viewer.</span>
          </div>
          <Button asChild className="w-full">
            <Link to="/settings">Open Database Settings</Link>
          </Button>
        </div>
      </div>
    );
  }

  return (
    <ResizablePanelGroup orientation="horizontal" className="h-full w-full">
      {/* Left Sidebar */}
      <ResizablePanel defaultSize="20%" minSize="15%" maxSize="40%">
        <div className="flex flex-col h-full border-r border-border bg-background">
          <DatabaseSelector
            selectedDatabase={selectedDatabase}
            selectedSchema={selectedSchema}
            databases={databases}
            schemas={schemas}
            onDatabaseChange={handleDatabaseChange}
            onSchemaChange={(schema) => {
                setSelectedSchema(schema);
                localStorage.setItem(SCHEMA_STORAGE_KEY, schema);
              }}
            onDatabaseCloned={handleDatabaseCloned}
          />
          <TablesList
            tables={tables}
            selectedTable={selectedTable}
            onSelectTable={handleSelectTable}
            isLoading={isLoadingTables}
            onRefresh={handleRefreshTables}
            canRefresh={!!selectedDatabase}
          />
        </div>
      </ResizablePanel>
      <ResizableHandle withHandle />

      {/* Right Content Area */}
      <ResizablePanel defaultSize="80%" className="min-h-0 overflow-hidden">
        <div className="relative h-full min-h-0 overflow-hidden">
          <ResizablePanelGroup orientation="horizontal" className="h-full w-full">
            <ResizablePanel
              defaultSize={promptsSidebarOpen ? "72%" : "100%"}
              minSize="45%"
              className="min-h-0 overflow-hidden"
            >
              <ResizablePanelGroup orientation="vertical" className="w-full">
                <ResizablePanel defaultSize="20%" minSize="20%">
                  <div className="h-full p-4 overflow-hidden">
                    <SqlQueryEditor
                      value={sqlQuery}
                      onChange={setSqlQuery}
                      onExecute={handleExecuteQuery}
                      onSaveSql={handleSaveSql}
                      onTogglePrompts={() => setPromptsSidebarOpen((current) => !current)}
                      isExecuting={isExecuting}
                      selectedSchema={selectedSchema}
                    />
                  </div>
                </ResizablePanel>

                <ResizableHandle withHandle />

                <ResizablePanel defaultSize="45%" minSize="20%">
                  <div className="h-full p-4 overflow-hidden flex flex-col">
                    {queryResults ? (
                      <>
                        <div className="mb-2 flex items-center justify-between gap-3 flex-shrink-0">
                          <h3 className="text-xs font-medium text-muted-foreground">
                            Results ({queryResults.rowCount} rows)
                          </h3>
                          <div className="flex items-center gap-1.5">
                            <span className="text-[0.7rem] text-muted-foreground">Font</span>
                            <Button
                              variant="outline"
                              size="icon-xs"
                              onClick={handleDecreaseFontScale}
                              disabled={fontScale <= MIN_FONT_SCALE}
                              title="Decrease table font"
                            >
                              <Minus className="h-3 w-3" />
                            </Button>
                            <span className="w-11 text-center text-[0.7rem] text-muted-foreground">
                              {fontScale}%
                            </span>
                            <Button
                              variant="outline"
                              size="icon-xs"
                              onClick={handleIncreaseFontScale}
                              disabled={fontScale >= MAX_FONT_SCALE}
                              title="Increase table font"
                            >
                              <Plus className="h-3 w-3" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="xs"
                              onClick={handleResetTableView}
                              className="gap-1"
                              title="Reset font scale and column widths"
                            >
                              <RotateCcw className="h-3 w-3" />
                              Reset view
                            </Button>
                          </div>
                        </div>
                        <div className="flex-1 min-h-0 overflow-auto">
                          <ResultsTable
                            data={queryResults.data}
                            rowCount={queryResults.rowCount}
                            isLoading={isExecuting}
                            table={selectedTable}
                            primaryKey={primaryKey}
                            columnEnumValues={columnEnumValues}
                            onDataUpdate={handleDataUpdate}
                            fontScale={fontScale}
                            columnWidths={columnWidths}
                            onColumnWidthsChange={handleColumnWidthsChange}
                          />
                        </div>
                      </>
                    ) : (
                      <div className="flex h-full items-center justify-center text-muted-foreground">
                        <p className="text-sm">Execute query to see results</p>
                      </div>
                    )}
                  </div>
                </ResizablePanel>
              </ResizablePanelGroup>
            </ResizablePanel>

            {promptsSidebarOpen && (
              <>
                <ResizableHandle withHandle />
                <ResizablePanel
                  defaultSize="28%"
                  minSize="20%"
                  maxSize="45%"
                  className="min-h-0 overflow-hidden"
                >
                  <PromptsSidebar
                    open={promptsSidebarOpen}
                    onClose={() => setPromptsSidebarOpen(false)}
                    onPasteSql={handlePastePromptSql}
                    refreshToken={promptsRefreshToken}
                  />
                </ResizablePanel>
              </>
            )}
          </ResizablePanelGroup>
        </div>
      </ResizablePanel>
    </ResizablePanelGroup>
  );
};
