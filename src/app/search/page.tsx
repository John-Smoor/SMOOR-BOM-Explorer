import { Suspense } from "react";
import { SearchView } from "@/components/views/SearchView";
export const metadata = { title: "Search" };
export default function Page() {
  return <Suspense><SearchView /></Suspense>;
}
