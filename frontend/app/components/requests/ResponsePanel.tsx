import { cn } from '~/lib/utils';
import { Badge } from '../ui/badge';
import type { MockResponse } from './types';
import { Clock, HardDrive } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../ui/tabs';
import { ScrollArea } from '../ui/scroll-area';
import { ResponseBodyViewer } from './ResponseBodyViewer';

interface ResponsePanelProps {
  response: MockResponse | null;
  loading?: boolean;
}

export const ResponsePanel = ({ response, loading }: ResponsePanelProps) => {
  if (loading) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground">
        <div className="flex items-center gap-2 text-sm">
          <div className="h-4 w-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
          Sending request...
        </div>
      </div>
    );
  }

  if (!response) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground text-xs">
        Click Send to get a response
      </div>
    );
  }

  const statusColor = response.status < 300
    ? 'bg-green-500/15 text-green-600 border-green-500/30'
    : response.status < 400
    ? 'bg-yellow-500/15 text-yellow-600 border-yellow-500/30'
    : 'bg-red-500/15 text-red-600 border-red-500/30';

  return (
    <div className="flex flex-col h-full">
      {/* Status bar */}
      <div className="flex items-center gap-3 px-3 py-1.5 border-b border-border bg-muted/30 shrink-0">
        <Badge variant="outline" className={cn('text-[11px] font-bold px-2', statusColor)}>
          {response.status} {response.statusText}
        </Badge>
        <div className="flex items-center gap-1 text-[11px] text-muted-foreground">
          <Clock className="h-3 w-3" />
          {response.time}ms
        </div>
        <div className="flex items-center gap-1 text-[11px] text-muted-foreground">
          <HardDrive className="h-3 w-3" />
          {response.size}
        </div>
      </div>

      {/* Response tabs */}
      <Tabs defaultValue="body" className="flex-1 flex flex-col min-h-0">
        <TabsList className="h-8 rounded-none border-b border-border bg-transparent justify-start px-2 shrink-0">
          <TabsTrigger value="body" className="text-[11px] h-6 data-[state=active]:bg-muted rounded-sm">Body</TabsTrigger>
          <TabsTrigger value="headers" className="text-[11px] h-6 data-[state=active]:bg-muted rounded-sm">
            Headers
            <Badge variant="secondary" className="ml-1 h-4 px-1 text-[9px]">{response.headers.length}</Badge>
          </TabsTrigger>
        </TabsList>
        <TabsContent value="body" className="flex-1 m-0 min-h-0">
          <ResponseBodyViewer body={response.body} />
        </TabsContent>
        <TabsContent value="headers" className="flex-1 m-0 min-h-0">
          <ScrollArea className="h-full" viewportRef={null}>
            <div className="p-3 text-xs space-y-1">
              {response.headers.map((h, i) => (
                <div key={i} className="flex gap-2">
                  <span className="font-medium text-muted-foreground min-w-[140px]">{h.key}:</span>
                  <span className="font-mono">{h.value}</span>
                </div>
              ))}
            </div>
          </ScrollArea>
        </TabsContent>
      </Tabs>
    </div>
  );
};
