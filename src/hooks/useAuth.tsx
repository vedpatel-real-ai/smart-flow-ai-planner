import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { User, Session } from "@supabase/supabase-js";
import { demoSession, demoUser } from "@/demo/auth";
import { forceDemoMode, getActiveDataProvider } from "@/providers/DataProvider";

interface AuthContextType {
  user: User | null;
  session: Session | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<{ error: any }>;
  signUp: (email: string, password: string, displayName?: string) => Promise<{ error: any }>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
};

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const provider = getActiveDataProvider();

    const { data: { subscription } } = provider.auth.onAuthStateChange(
      (_event, currentSession) => {
        setSession(currentSession);
        setUser(currentSession?.user ?? null);
        setLoading(false);
      }
    );

    provider.auth.getSession()
      .then(({ data: { session: initialSession } }) => {
        setSession(initialSession);
        setUser(initialSession?.user ?? null);
        setLoading(false);
      })
      .catch(() => {
        setSession(null);
        setUser(null);
        setLoading(false);
      });

    return () => subscription.unsubscribe();
  }, []);

  const signIn = async (email: string, password: string) => {
    try {
      const { error, data } = await getActiveDataProvider().auth.signInWithPassword({ email, password });
      if (error) throw error;
      if (data?.session) {
        setSession(data.session);
        setUser(data.user);
      }
      return { error: null };
    } catch {
      forceDemoMode();
      const { data } = await getActiveDataProvider().auth.signInWithPassword({ email, password });
      setSession(data?.session || demoSession);
      setUser(data?.user || demoUser);
      return { error: null };
    }
  };

  const signUp = async (email: string, password: string, displayName?: string) => {
    const redirectUrl = `${window.location.origin}/`;
    
    try {
      const { error, data } = await getActiveDataProvider().auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: redirectUrl,
          data: {
            display_name: displayName || email.split('@')[0]
          }
        }
      });
      if (error) throw error;
      if (data?.session) {
        setSession(data.session);
        setUser(data.user);
      }
      return { error: null };
    } catch {
      forceDemoMode();
      const { data } = await getActiveDataProvider().auth.signUp({ email, password });
      setSession(data?.session || demoSession);
      setUser(data?.user || demoUser);
      return { error: null };
    }
  };

  const signOut = async () => {
    await getActiveDataProvider().auth.signOut();
    setSession(null);
    setUser(null);
  };

  const value = {
    user,
    session,
    loading,
    signIn,
    signUp,
    signOut,
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};
