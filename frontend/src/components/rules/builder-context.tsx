"use client";

import { createContext, useContext } from "react";

import type { FieldInfo } from "@/lib/api/types";
import type { GroupNode, Issues } from "@/lib/rules/tree";

export interface BuilderContextValue {
  root: GroupNode;
  setRoot: (updater: (root: GroupNode) => GroupNode) => void;
  fields: FieldInfo[];
  issues: Issues;
  showIssues: boolean;
  nodeCount: number;
}

export const BuilderContext = createContext<BuilderContextValue | null>(null);

export function useBuilder() {
  const ctx = useContext(BuilderContext);
  if (!ctx) throw new Error("useBuilder must be used inside the rule builder");
  return ctx;
}
