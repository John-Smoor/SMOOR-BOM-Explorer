"use client";
import { createContext, useContext, useState, type ReactNode } from "react";
import type { BomRow, OrderCheckResult, SohData } from "@/lib/types";

export interface OrderState {
  /** FG codes in the order, in the order they were added */
  picked: string[];
  qtyMemory: Record<string, number>;
  result: OrderCheckResult | null;
}

interface Ctx {
  master: BomRow[];
  soh: SohData;
  sohCount: number;
  hasDraft: boolean;
  images: Record<string, string>;
  categories: Record<string, string>;
  user: string | null;
  order: OrderState;
  setOrder: (fn: (o: OrderState) => OrderState) => void;
}

const AppCtx = createContext<Ctx | null>(null);

export function AppProvider(props: Omit<Ctx, "order" | "setOrder"> & { children: ReactNode }) {
  const [order, setOrderState] = useState<OrderState>({ picked: [], qtyMemory: {}, result: null });
  const { children, ...data } = props;
  return <AppCtx.Provider value={{ ...data, order, setOrder: setOrderState }}>{children}</AppCtx.Provider>;
}

export function useApp() {
  const c = useContext(AppCtx);
  if (!c) throw new Error("useApp outside AppProvider");
  return c;
}
