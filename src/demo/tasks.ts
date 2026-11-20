/**
 * Demo tasks — re-exported from the atomic fixture generator.
 *
 * DemoProvider.ts calls createDemoWorkspace() once and uses the full store.
 * This module is kept for backward compatibility with any imports that
 * reference demoTasks directly (e.g. legacy tests).
 */
import type { Task } from "@/types/database";
import { createDemoWorkspace } from "./fixtures";

const _workspace = createDemoWorkspace();
export const demoTasks: Task[] = _workspace.tasks;
