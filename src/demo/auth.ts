import type { Account } from "../auth/session";
import { demoUserProfile } from "./users";

/** Demo is a local workspace identity. Cloud authentication always comes from Supabase. */
export const demoUser: Account = {
  id: demoUserProfile.id,
  email: demoUserProfile.email,
  user_metadata: { display_name: demoUserProfile.full_name },
};
