import { useState } from 'react';
import { NavLink, useLocation } from 'react-router';
import { ScrollText, Send, Database, Settings, ChevronLeft, ChevronRight, Radio } from 'lucide-react';
import { Button } from './ui/button';
import { cn } from '~/lib/utils';

const navItems = [
  { path: '/logs', icon: ScrollText, label: 'Logs' },
  { path: '/requests', icon: Send, label: 'Requests' },
  { path: '/db-viewer', icon: Database, label: 'Database' },
  { path: '/pubsub-monitor', icon: Radio, label: 'PubSub' },
  { path: '/settings', icon: Settings, label: 'Settings' },
];

export const Sidebar = () => {
  const [collapsed, setCollapsed] = useState(false);
  const location = useLocation();

  return (
    <aside
      className={cn(
        'flex flex-col border-r border-border bg-card transition-all duration-300',
        collapsed ? 'w-fit' : 'w-fit'
      )}
    >
      <div className="flex h-14 items-center justify-between border-sidebar-border px-3">
        {!collapsed && (
          <span className="font-semibold text-sidebar-foreground">MS Tool</span>
        )}
        <Button
          variant="ghost"
          onClick={() => setCollapsed(!collapsed)}
          className="h-10 w-10 text-sidebar-foreground hover:bg-sidebar-accent"
        >
          {collapsed ? <ChevronRight className="min-w-6 min-h-6"/> : <ChevronLeft  className="min-w-6 min-h-6"/>}
        </Button>
      </div>

      <nav className="flex-1 space-y-1 p-2 border-t">
        {navItems.map((item) => {
          const isActive = location.pathname === item.path;
          return (
            <NavLink
              key={item.path}
              to={item.path}
              className={cn(
                'flex items-center gap-3 rounded-md text-sm font-medium transition-colors',
                isActive
                  ? 'bg-sidebar-accent text-sidebar-accent-foreground'
                  : 'text-sidebar-foreground hover:bg-sidebar-accent/50 hover:text-sidebar-accent-foreground',
                !collapsed ? "pr-4" : ""
              )}
            >
              <item.icon className="h-6 w-6 shrink-0 mx-3 my-3" />
              {!collapsed && <span>{item.label}</span>}
            </NavLink>
          );
        })}
      </nav>
    </aside>
  );
};
