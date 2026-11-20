/**
 * Demo categories and preferences — re-exported from the atomic fixture generator.
 *
 * DemoProvider.ts uses the full store from createDemoWorkspace().
 * This module exists for backward compatibility with direct imports.
 */
import type { Category, UserPreferences } from "@/types/database";
import { createDemoWorkspace } from "./fixtures";

const _workspace = createDemoWorkspace();
export const demoCategories: Category[] = _workspace.categories;
export const demoUserPreferences: UserPreferences = _workspace.user_preferences[0];
