import { useState } from 'react';
import { ChevronDown, Settings2 } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '~/components/ui/dropdown-menu';
import { Button } from '~/components/ui/button';
import type { EnvironmentDto } from '~/lib/api/environments';

interface EnvironmentSelectorProps {
  environments: EnvironmentDto[];
  activeEnvironment: string | null;
  onSelect: (name: string | null) => void;
  onManage: () => void;
}

export function EnvironmentSelector({
  environments,
  activeEnvironment,
  onSelect,
  onManage,
}: EnvironmentSelectorProps) {
  const [open, setOpen] = useState(false);

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className="h-7 text-xs gap-1.5 font-normal border-dashed"
        >
          <span className="text-muted-foreground">env:</span>
          <span className={activeEnvironment ? 'text-foreground font-medium' : 'text-muted-foreground'}>
            {activeEnvironment ?? 'No Environment'}
          </span>
          <ChevronDown className="h-3 w-3 text-muted-foreground" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-52">
        <DropdownMenuItem
          className="text-xs"
          onClick={() => { onSelect(null); setOpen(false); }}
        >
          <span className="text-muted-foreground italic">No Environment</span>
          {activeEnvironment === null && <span className="ml-auto text-green-500">✓</span>}
        </DropdownMenuItem>
        {environments.length > 0 && <DropdownMenuSeparator />}
        {environments.map((env) => (
          <DropdownMenuItem
            key={env.name}
            className="text-xs"
            onClick={() => { onSelect(env.name); setOpen(false); }}
          >
            {env.name}
            {activeEnvironment === env.name && <span className="ml-auto text-green-500">✓</span>}
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuItem
          className="text-xs gap-1.5"
          onClick={() => { setOpen(false); onManage(); }}
        >
          <Settings2 className="h-3 w-3" />
          Manage Environments
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
