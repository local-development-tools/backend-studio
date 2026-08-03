import React from 'react';
import {Send } from 'lucide-react';

import { MethodBadge } from './MethodBadge';

import type { BodyMode, HttpMethod, HttpRequest } from './types';
import { cn } from '~/lib/utils';
import { KeyValueEditor } from './KeyValueEditor';
import { COMMON_HTTP_HEADERS } from './constants';
import { HttpBodyEditor } from './HttpBodyEditor';
import { ScriptEditor } from './ScriptEditor';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../ui/tabs';
import { Badge } from '../ui/badge';
import { METHOD_COLOR_BASE } from '~/lib/api/requests/methodColors';
import { buildUrlWithQuery, syncPathParamsWithUrl } from '~/lib/api/requests/utils';


interface HttpRequestEditorProps {
  request: HttpRequest;
  onChange: (r: HttpRequest) => void;
  onSend: () => void;
  envSelector?: React.ReactNode;
}

const METHOD_BORDER = {
  GET: `border-${METHOD_COLOR_BASE["GET"]}/50`,
  POST: `border-${METHOD_COLOR_BASE["POST"]}/50`,
  PUT: `border-${METHOD_COLOR_BASE["PUT"]}/50`,
  DELETE: `border-${METHOD_COLOR_BASE["DELETE"]}/50`,
  PATCH: `border-${METHOD_COLOR_BASE["PATCH"]}/50`,
};
//WONT WORK UNLESS I DEFINE IT HERE I HAVE NO CLUE WHY

export const HttpRequestEditor = ({ request, onChange, onSend, envSelector }: HttpRequestEditorProps) => {
  const pathParamsCount = request.pathParams.filter((item) => item.key.trim()).length;
  const queryParamsCount = request.queryParams.filter((item) => item.key.trim()).length;

  const handleShortcut = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if ((event.ctrlKey || event.metaKey) && !event.altKey && !event.shiftKey && event.key === 'Enter') {
      event.preventDefault();
      onSend();
    }
  };

  return (
    <div className="flex flex-col h-full" onKeyDownCapture={handleShortcut}>
      {/* URL bar - Postman style */}
      <div className={`flex items-center gap-0 border-2 rounded-lg overflow-hidden bg-background mb-3 ${METHOD_BORDER[request.method]}`}>
        <Select value={request.method} onValueChange={(v) => onChange({ ...request, method: v as HttpMethod })}>
          <SelectTrigger className="w-[100px] h-9 border-none rounded-none shadow-none bg-muted/50 font-bold text-xs focus:ring-0">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {(['GET', 'POST', 'PUT', 'DELETE', 'PATCH'] as HttpMethod[]).map((m) => (
              <SelectItem key={m} value={m}>
                <MethodBadge method={m} />
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Input
          value={request.url}
          onChange={(e) => {
            const nextUrl = e.target.value;
            onChange({
              ...request,
              url: nextUrl,
              pathParams: syncPathParamsWithUrl(nextUrl, request.pathParams),
            });
          }}
          placeholder="Enter request URL"
          className="flex-1 h-9 border-none shadow-none focus-visible:ring-0 text-sm font-mono"
        />
        <Button onClick={onSend} className="h-9 rounded-none px-5 gap-2 font-semibold" title="Send request (⌘/Ctrl+Enter)">
          <Send className="h-3.5 w-3.5" />
          Send
        </Button>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="params" className="flex-1 flex flex-col min-h-0">
        <div className="flex items-center border-b border-border shrink-0">
          <TabsList className="h-8 rounded-none border-b-0 bg-transparent justify-start px-0 shrink-0">
            <TabsTrigger value="params" className="text-[11px] h-6 data-[state=active]:bg-muted rounded-sm">
              Params
              {(pathParamsCount + queryParamsCount) > 0 && <Badge variant="secondary" className="ml-1 h-4 px-1 text-[9px]">{pathParamsCount + queryParamsCount}</Badge>}
            </TabsTrigger>
            <TabsTrigger value="headers" className="text-[11px] h-6 data-[state=active]:bg-muted rounded-sm">
              Headers
              {request.headers.length > 0 && <Badge variant="secondary" className="ml-1 h-4 px-1 text-[9px]">{request.headers.length}</Badge>}
            </TabsTrigger>
            <TabsTrigger value="body" className="text-[11px] h-6 data-[state=active]:bg-muted rounded-sm">Body</TabsTrigger>
            <TabsTrigger value="script" className="text-[11px] h-6 data-[state=active]:bg-muted rounded-sm">Script</TabsTrigger>
          </TabsList>
          {envSelector && <div className="ml-auto pr-1">{envSelector}</div>}
        </div>
        <TabsContent value="params" className="flex-1 m-0 mt-2 min-h-0 overflow-auto">
          <div className="flex flex-row items-start gap-4">
            <div className="min-w-0 flex-1">
              <div className="mb-1 px-1 text-[10px] uppercase tracking-wide text-muted-foreground">Path params</div>
              <KeyValueEditor
                items={request.pathParams}
                onChange={(pathParams) => onChange({ ...request, pathParams })}
              />
            </div>
            <div className="min-w-0 flex-1">
              <div className="mb-1 px-1 text-[10px] uppercase tracking-wide text-muted-foreground">Query params</div>
              <KeyValueEditor
                items={request.queryParams}
                onChange={(queryParams) =>
                  onChange({
                    ...request,
                    queryParams,
                    url: buildUrlWithQuery(request.url.split('?')[0], queryParams),
                  })
                }
              />
            </div>
          </div>
        </TabsContent>
        <TabsContent value="headers" className="flex-1 m-0 mt-2 min-h-0 overflow-auto">
          <KeyValueEditor
            items={request.headers}
            onChange={(headers) => onChange({ ...request, headers })}
            keyAutocomplete={COMMON_HTTP_HEADERS}
          />
        </TabsContent>
        <TabsContent value="body" className="flex-1 m-0 mt-2 min-h-0 flex flex-col gap-2">
          <div className="flex items-center gap-2 shrink-0">
            <span className="text-[10px] uppercase tracking-wide text-muted-foreground px-1">Type</span>
            <Select
              value={request.bodyMode}
              onValueChange={(value) =>
                onChange({
                  ...request,
                  bodyMode: value as BodyMode,
                })
              }
            >
              <SelectTrigger className="h-7 w-[200px] text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="json">JSON</SelectItem>
                <SelectItem value="form-urlencoded">x-www-form-urlencoded</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {request.bodyMode === 'form-urlencoded' ? (
            <div className="flex-1 min-h-0 overflow-auto">
              <KeyValueEditor
                items={request.formBody}
                onChange={(formBody) => onChange({ ...request, formBody })}
              />
            </div>
          ) : (
            <HttpBodyEditor
              value={request.body}
              onChange={(body) => onChange({ ...request, body })}
              placeholder='{\n  "key": "value"\n}'
            />
          )}
        </TabsContent>
        <TabsContent value="script" className="flex-1 m-0 mt-2 min-h-0">
          <ScriptEditor
            value={request.postScript ?? ''}
            onChange={(postScript) => onChange({ ...request, postScript })}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
};
