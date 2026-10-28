import { Suspense } from "react";
import { HistoryView } from "@/components/views/HistoryView";
export const metadata = { title: "History" };
export default function Page() {
  return <Suspense><HistoryView /></Suspense>;
}
