import Link from "next/link";
import { Empty } from "@/components/ui";
export default function NotFound() {
  return <Empty title="This page doesn't exist">Go back to <Link href="/search">BOM search</Link>.</Empty>;
}
