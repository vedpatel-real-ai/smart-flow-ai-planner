import { ReactNode, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useDataProvider } from "@/providers/DataProvider";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { Brain, LogOut, User, Settings, Menu, Sparkles } from "lucide-react";

interface LayoutProps {
  children: ReactNode;
}

const Layout = ({ children }: LayoutProps) => {
  const { user, signOut } = useAuth();
  const { isDemoMode } = useDataProvider();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const displayName = user?.user_metadata?.full_name || "Ved Patel";
  const displayRole = user?.user_metadata?.role || "Lead Developer";
  const displayEmail = user?.email || "demo@example.com";
  
  const handleSignOut = async () => {
    await signOut();
  };

  const UserMenuContent = () => (
    <>
      <div className="px-2 py-2 border-b">
        <p className="text-sm font-semibold">{displayName}</p>
        <p className="text-xs text-muted-foreground truncate">{displayEmail}</p>
        <div className="mt-1 flex items-center gap-1">
          <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
            {displayRole}
          </Badge>
          {isDemoMode && (
            <Badge variant="outline" className="text-[10px] px-1.5 py-0 text-primary border-primary/30">
              Demo
            </Badge>
          )}
        </div>
      </div>
      <DropdownMenuItem className="mt-1">
        <User className="mr-2 h-4 w-4" />
        Profile
      </DropdownMenuItem>
      <DropdownMenuItem>
        <Settings className="mr-2 h-4 w-4" />
        Preferences
      </DropdownMenuItem>
      <DropdownMenuItem onClick={handleSignOut} className="text-destructive focus:text-destructive">
        <LogOut className="mr-2 h-4 w-4" />
        Sign Out
      </DropdownMenuItem>
    </>
  );

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <header className="sticky top-0 z-50 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="container mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <Brain className="h-8 w-8 text-primary animate-pulse" />
            <div className="flex items-center gap-2">
              <h1 className="text-xl md:text-2xl font-bold bg-gradient-to-r from-primary to-primary/60 bg-clip-text text-transparent">
                Smart TaskFlow
              </h1>
              <Badge variant="outline" className="hidden sm:inline-flex text-xs font-normal bg-primary/5 text-primary border-primary/20 items-center gap-1">
                <Sparkles className="h-3 w-3" />
                {isDemoMode ? "Demo Mode" : "Cloud Connected"}
              </Badge>
            </div>
          </div>
          
          {/* Desktop Menu */}
          <div className="hidden md:flex items-center space-x-4">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" className="relative h-10 w-10 rounded-full hover-lift">
                  <Avatar className="h-10 w-10 border border-primary/20">
                    <AvatarFallback className="bg-primary/10 text-primary font-medium">
                      {displayName.charAt(0).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent className="w-56" align="end" forceMount>
                <UserMenuContent />
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          {/* Mobile Menu */}
          <div className="md:hidden">
            <Sheet open={mobileMenuOpen} onOpenChange={setMobileMenuOpen}>
              <SheetTrigger asChild>
                <Button variant="ghost" size="icon" className="hover-lift">
                  <Menu className="h-6 w-6" />
                </Button>
              </SheetTrigger>
              <SheetContent side="right" className="w-80">
                <div className="flex flex-col space-y-4 mt-6">
                  <div className="flex items-center space-x-3 p-4 bg-muted/50 rounded-lg">
                    <Avatar className="h-12 w-12 border border-primary/20">
                      <AvatarFallback className="bg-primary/10 text-primary text-lg font-medium">
                        {displayName.charAt(0).toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium truncate">{displayName}</p>
                      <p className="text-xs text-muted-foreground truncate">{displayEmail}</p>
                      <span className="text-[10px] text-primary font-medium">{displayRole}</span>
                    </div>
                  </div>
                  
                  <div className="space-y-2">
                    <Button variant="ghost" className="w-full justify-start" onClick={() => setMobileMenuOpen(false)}>
                      <Settings className="mr-3 h-5 w-5" />
                      Settings
                    </Button>
                    <Button variant="ghost" className="w-full justify-start text-destructive hover:text-destructive" onClick={handleSignOut}>
                      <LogOut className="mr-3 h-5 w-5" />
                      Sign Out
                    </Button>
                  </div>
                </div>
              </SheetContent>
            </Sheet>
          </div>
        </div>
      </header>
      
      <main className="container mx-auto px-4 py-4 md:py-6 flex-1">
        <div className="animate-enter">
          {children}
        </div>
      </main>

      <footer className="border-t py-4 md:py-6 mt-12 bg-background/50 text-xs text-muted-foreground">
        <div className="container mx-auto px-4 flex flex-col sm:flex-row items-center justify-between gap-2 text-center sm:text-left">
          <p>Smart TaskFlow • Developed by Ved Patel</p>
          <p className="text-muted-foreground/70">AI-Powered Intelligent Productivity & Scheduling</p>
        </div>
      </footer>
    </div>
  );
};

export default Layout;