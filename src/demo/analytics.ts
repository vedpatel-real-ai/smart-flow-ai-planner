/**
 * Demo completion events — re-exported from the atomic fixture generator.
 *
 * DemoProvider.ts uses the full store from createDemoWorkspace().
 * This module exists for backward compatibility with direct imports.
 */
import type { TaskCompletion } from "../types/database";
import { createDemoWorkspace } from "./fixtures";

const _workspace = createDemoWorkspace();
export const demoTaskCompletions: TaskCompletion[] = _workspace.task_completions;
