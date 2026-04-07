import { redirect } from "react-router";
import type { Route } from "./+types/home";

export function meta({}: Route.MetaArgs) {
  return [
    { title: "New React Router App" },
    { name: "description", content: "Welcome to React Router!" },
  ];
}

// 👇 Redirect immediately when route loads
export async function loader() {
  return redirect("/logs");
}

export default function Home() {
  return null; // Nothing renders because it redirects
}