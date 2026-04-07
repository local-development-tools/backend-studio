import { DatabasesScreen } from "~/components/databases/DatabasesScreen"

import type { Route } from "./+types/db-viewer"

export function meta({}: Route.MetaArgs) {
  return [
    { title: "Database Viewer" },
    { name: "description", content: "Query and manage your databases" },
  ]
}

export default function DbViewer() {
  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden bg-background">
      <DatabasesScreen />
    </div>
  )
}