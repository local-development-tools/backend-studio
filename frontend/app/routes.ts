import {type RouteConfig, index, layout, route} from "@react-router/dev/routes";

export default [
  index("routes/home.tsx"),
  layout("routes/_layout.tsx", [
    route("logs", "routes/logs.tsx"),
    route("requests", "routes/requests.tsx"),
    route("requests-api-test", "routes/requests-api-test.tsx"),
    route("db-viewer", "routes/db-viewer.tsx"),
    route("settings", "routes/settings.tsx"),
    route("pubsub-monitor", "routes/pubsub-monitor.tsx"),
  ]),
  
] satisfies RouteConfig;
