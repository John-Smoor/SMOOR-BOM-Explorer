import { Suspense } from "react";
import { EditView } from "@/components/views/EditView";
export const metadata = { title: "Edit" };
export default function Page() {
  return <Suspense><EditView /></Suspense>;
}
