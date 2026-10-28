import { Suspense } from "react";
import { OrderCheckView } from "@/components/views/OrderCheckView";
export const metadata = { title: "Order check" };
export default function Page() {
  return <Suspense><OrderCheckView /></Suspense>;
}
