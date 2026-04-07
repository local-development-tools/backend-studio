
import { cn } from '~/lib/utils';
import type { HttpMethod } from './types';
import { METHOD_COLOR_BASE } from '~/lib/api/requests/methodColors';




export const MethodBadge = ({ method, className }: { method: HttpMethod; className?: string }) => (
  <span className={cn('font-bold text-[11px] tracking-wide', `text-${METHOD_COLOR_BASE[method]}`, className)}>
    {method}
  </span>
);
