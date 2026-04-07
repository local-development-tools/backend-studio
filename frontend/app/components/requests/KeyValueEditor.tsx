
import { Plus, Trash2 } from 'lucide-react';
import { Checkbox } from '../ui/checkbox';
import { Input } from '../ui/input';

interface KeyValueItem {
  key: string;
  value: string;
  enabled?: boolean;
}

interface KeyValueEditorProps {
  items: KeyValueItem[];
  onChange: (items: KeyValueItem[]) => void;
  keyAutocomplete?: string[];
}

export const KeyValueEditor = ({ items, onChange, keyAutocomplete }: KeyValueEditorProps) => {
  const addItem = () => {
    onChange([...items, { key: '', value: '', enabled: true }]);
  };

  const updateItem = (index: number, field: 'key' | 'value', value: string) => {
    const newItems = [...items];
    newItems[index] = { ...newItems[index], [field]: value };
    onChange(newItems);
  };

  const toggleItem = (index: number) => {
    const newItems = [...items];
    newItems[index] = { ...newItems[index], enabled: !(newItems[index].enabled ?? true) };
    onChange(newItems);
  };

  const removeItem = (index: number) => {
    onChange(items.filter((_, i) => i !== index));
  };

  return (
    <div className="text-xs">
      {/* Header row */}
      <div className="grid grid-cols-[28px_1fr_1fr_28px] gap-0 border-b border-border text-muted-foreground font-medium">
        <div className="p-1.5" />
        <div className="p-1.5 border-l border-border">Key</div>
        <div className="p-1.5 border-l border-border">Value</div>
        <div className="p-1.5" />
      </div>
      {/* Data rows */}
      {items.map((item, index) => (
        <div key={index} className="grid grid-cols-[28px_1fr_1fr_28px] gap-0 border-b border-border group">
          <div className="flex items-center justify-center">
            <Checkbox
              checked={item.enabled ?? true}
              onCheckedChange={() => toggleItem(index)}
              className="h-3.5 w-3.5"
            />
          </div>
          <div className="border-l border-border">
            <Input
              value={item.key}
              onChange={(e) => updateItem(index, 'key', e.target.value)}
              placeholder="key"
              className="h-7 text-xs border-none rounded-none shadow-none focus-visible:ring-0 focus-visible:ring-offset-0 bg-transparent"
              list={keyAutocomplete ? `key-autocomplete-${index}` : undefined}
            />
            {keyAutocomplete && (
              <datalist id={`key-autocomplete-${index}`}>
                {keyAutocomplete.map((suggestion) => (
                  <option key={suggestion} value={suggestion} />
                ))}
              </datalist>
            )}
          </div>
          <div className="border-l border-border">
            <Input
              value={item.value}
              onChange={(e) => updateItem(index, 'value', e.target.value)}
              placeholder="value"
              className="h-7 text-xs border-none rounded-none shadow-none focus-visible:ring-0 focus-visible:ring-offset-0 bg-transparent"
            />
          </div>
          <div className="flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
            <button onClick={() => removeItem(index)} className="text-muted-foreground hover:text-destructive">
              <Trash2 className="h-3 w-3" />
            </button>
          </div>
        </div>
      ))}
      {/* Add row */}
      <button
        onClick={addItem}
        className="flex items-center gap-1 text-muted-foreground hover:text-foreground p-1.5 w-full transition-colors"
      >
        <Plus className="h-3 w-3" />
        <span>Add</span>
      </button>
    </div>
  );
};
