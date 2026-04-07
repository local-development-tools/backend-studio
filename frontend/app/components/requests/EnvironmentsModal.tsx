import { useState, useEffect } from 'react';
import { Plus, Trash2, X } from 'lucide-react';
import { Button } from '~/components/ui/button';
import { Input } from '~/components/ui/input';
import type { EnvironmentDto } from '~/lib/api/environments';
import {
  createEnvironment,
  updateEnvironment,
  deleteEnvironment,
} from '~/lib/api/environments';

interface EnvironmentsModalProps {
  collectionId: string;
  environments: EnvironmentDto[];
  onClose: () => void;
  onRefresh: (envs: EnvironmentDto[]) => void;
}

interface VarRow {
  id: string;
  key: string;
  value: string;
}

let nextRowId = 0;
function makeRowId(): string {
  return `row-${++nextRowId}`;
}

function envToRows(vars: Record<string, string>): VarRow[] {
  const rows = Object.entries(vars).map(([key, value]) => ({ id: makeRowId(), key, value }));
  rows.push({ id: makeRowId(), key: '', value: '' });
  return rows;
}

function rowsToVars(rows: VarRow[]): Record<string, string> {
  const vars: Record<string, string> = {};
  for (const row of rows) {
    if (row.key.trim()) vars[row.key.trim()] = row.value;
  }
  return vars;
}

export function EnvironmentsModal({
  collectionId,
  environments,
  onClose,
  onRefresh,
}: EnvironmentsModalProps) {
  const [envs, setEnvs] = useState<EnvironmentDto[]>(environments);
  const [selectedName, setSelectedName] = useState<string | null>(
    environments[0]?.name ?? null,
  );
  const [rows, setRows] = useState<VarRow[]>([{ id: makeRowId(), key: '', value: '' }]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [newEnvName, setNewEnvName] = useState('');
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    const env = envs.find((e) => e.name === selectedName);
    if (env) {
      setRows(envToRows(env.vars));
    } else {
      setRows([{ id: makeRowId(), key: '', value: '' }]);
    }
  }, [selectedName, envs]);

  const selectedEnv = envs.find((e) => e.name === selectedName);

  const handleRowChange = (idx: number, field: 'key' | 'value', val: string) => {
    setRows((prev) => {
      const next = prev.map((r, i) => (i === idx ? { ...r, [field]: val } : r));
      const last = next[next.length - 1];
      if (last.key !== '' || last.value !== '') {
        next.push({ id: makeRowId(), key: '', value: '' });
      }
      return next;
    });
  };

  const handleDeleteRow = (idx: number) => {
    setRows((prev) => {
      const next = prev.filter((_, i) => i !== idx);
      if (next.length === 0 || (next[next.length - 1].key !== '' || next[next.length - 1].value !== '')) {
        next.push({ id: makeRowId(), key: '', value: '' });
      }
      return next;
    });
  };

  const handleSave = async () => {
    if (!selectedName) return;
    setSaving(true);
    setError(null);
    try {
      const vars = rowsToVars(rows);
      const updated = await updateEnvironment(collectionId, selectedName, vars);
      const next = envs.map((e) => (e.name === selectedName ? updated : e));
      setEnvs(next);
      onRefresh(next);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const handleCreate = async () => {
    const name = newEnvName.trim();
    if (!name) return;
    if (!/^[a-zA-Z0-9_-]+$/.test(name)) {
      setError('Name must only contain letters, numbers, hyphens, or underscores');
      return;
    }
    setCreating(true);
    setError(null);
    try {
      const created = await createEnvironment(collectionId, name, {});
      const next = [...envs, created];
      setEnvs(next);
      onRefresh(next);
      setSelectedName(created.name);
      setNewEnvName('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Create failed');
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = async (name: string) => {
    setError(null);
    try {
      await deleteEnvironment(collectionId, name);
      const next = envs.filter((e) => e.name !== name);
      setEnvs(next);
      onRefresh(next);
      if (selectedName === name) {
        setSelectedName(next[0]?.name ?? null);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Delete failed');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-background border border-border rounded-lg shadow-xl w-[760px] max-h-[80vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border shrink-0">
          <h2 className="text-sm font-semibold">Manage Environments</h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex flex-1 min-h-0 overflow-hidden">
          {/* Left: env list */}
          <div className="w-48 border-r border-border flex flex-col shrink-0">
            <div className="flex-1 overflow-y-auto">
              {envs.map((env) => (
                <div
                  key={env.name}
                  className={`flex items-center justify-between px-3 py-2 cursor-pointer text-xs group hover:bg-muted/50 ${
                    selectedName === env.name ? 'bg-muted' : ''
                  }`}
                  onClick={() => setSelectedName(env.name)}
                >
                  <span className="truncate">{env.name}</span>
                  <button
                    className="shrink-0 opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-red-500"
                    onClick={(e) => { e.stopPropagation(); void handleDelete(env.name); }}
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                </div>
              ))}
            </div>

            {/* New env input */}
            <div className="border-t border-border p-2 shrink-0">
              <div className="flex gap-1">
                <Input
                  value={newEnvName}
                  onChange={(e) => setNewEnvName(e.target.value)}
                  placeholder="env-name"
                  className="h-6 text-xs px-2"
                  onKeyDown={(e) => { if (e.key === 'Enter') void handleCreate(); }}
                />
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-6 w-6 p-0 shrink-0"
                  disabled={creating || !newEnvName.trim()}
                  onClick={() => void handleCreate()}
                >
                  <Plus className="h-3 w-3" />
                </Button>
              </div>
            </div>
          </div>

          {/* Right: var editor */}
          <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
            {selectedEnv ? (
              <>
                <div className="flex-1 overflow-y-auto">
                  <table className="w-full text-xs">
                    <thead className="sticky top-0 bg-background border-b border-border">
                      <tr>
                        <th className="text-left px-3 py-2 font-medium text-muted-foreground w-1/2">Name</th>
                        <th className="text-left px-3 py-2 font-medium text-muted-foreground">Value</th>
                        <th className="w-8" />
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((row, idx) => (
                        <tr key={row.id} className="border-b border-border/50 hover:bg-muted/30">
                          <td className="px-2 py-1">
                            <Input
                              value={row.key}
                              onChange={(e) => handleRowChange(idx, 'key', e.target.value)}
                              placeholder="variable_name"
                              className="h-6 text-xs border-none shadow-none bg-transparent focus-visible:ring-0 px-1 font-mono"
                            />
                          </td>
                          <td className="px-2 py-1">
                            <Input
                              value={row.value}
                              onChange={(e) => handleRowChange(idx, 'value', e.target.value)}
                              placeholder="value"
                              className="h-6 text-xs border-none shadow-none bg-transparent focus-visible:ring-0 px-1 font-mono"
                            />
                          </td>
                          <td className="px-1 py-1">
                            {(row.key || row.value) && (
                              <button
                                onClick={() => handleDeleteRow(idx)}
                                className="text-muted-foreground hover:text-red-500"
                              >
                                <Trash2 className="h-3 w-3" />
                              </button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="border-t border-border px-4 py-3 flex items-center gap-3 shrink-0">
                  {error && <span className="text-xs text-red-500 flex-1">{error}</span>}
                  {!error && <span className="flex-1" />}
                  <Button variant="outline" size="sm" className="h-7 text-xs" onClick={onClose}>
                    Close
                  </Button>
                  <Button size="sm" className="h-7 text-xs" disabled={saving} onClick={() => void handleSave()}>
                    {saving ? 'Saving…' : 'Save'}
                  </Button>
                </div>
              </>
            ) : (
              <div className="flex-1 flex items-center justify-center text-xs text-muted-foreground">
                {envs.length === 0
                  ? 'Create an environment to get started'
                  : 'Select an environment'}
              </div>
            )}
          </div>
        </div>

        {selectedEnv === undefined && error && (
          <div className="px-4 py-2 text-xs text-red-500 border-t border-border">{error}</div>
        )}
      </div>
    </div>
  );
}
