import { Suspense } from "react";
import { PendingView } from "@/components/views/PendingView";
export const metadata = { title: "Pending" };
export default function Page() {
  return <Suspense><PendingView /></Suspense>;
}
