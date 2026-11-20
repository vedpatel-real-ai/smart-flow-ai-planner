import { useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CalendarDays, BarChart3, Target, Clock } from "lucide-react";
import TaskManager from "@/components/TaskManager";
import DailyPlanner from "@/components/DailyPlanner";
import Analytics from "@/components/Analytics";
import DashboardOverview from "@/components/DashboardOverview";

const Dashboard = () => {
  const [activeTab, setActiveTab] = useState("overview");

  return (
    <div className="space-y-4 md:space-y-6">
      <div className="flex flex-col space-y-2 md:flex-row md:items-center md:justify-between md:space-y-0">
        <div>
          <h2 className="text-2xl md:text-3xl font-bold tracking-tight">Dashboard</h2>

        </div>
        <p className="text-sm font-medium text-muted-foreground">{new Date().toLocaleDateString(undefined, {
          weekday: "long", month: "long", day: "numeric", year: "numeric",
        })}</p>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <TabsList className="grid w-full grid-cols-4 h-auto rounded-xl border bg-card p-1 shadow-sm">
          <TabsTrigger value="overview" className="flex items-center gap-1 md:gap-2 transition-none min-w-0 px-1 text-xs md:text-sm py-2.5 data-[state=active]:bg-primary data-[state=active]:text-white">
            <Target className="h-3 w-3 md:h-4 md:w-4" />
            <span className="hidden sm:inline">Overview</span>
            <span className="sm:hidden">Home</span>
          </TabsTrigger>
          <TabsTrigger value="tasks" className="flex items-center gap-1 md:gap-2 transition-none min-w-0 px-1 text-xs md:text-sm py-2.5 data-[state=active]:bg-primary data-[state=active]:text-white">
            <Clock className="h-3 w-3 md:h-4 md:w-4" />
            <span className="hidden sm:inline">Task Manager</span>
            <span className="sm:hidden">Tasks</span>
          </TabsTrigger>
          <TabsTrigger value="planner" className="flex items-center gap-1 md:gap-2 transition-none min-w-0 px-1 text-xs md:text-sm py-2.5 data-[state=active]:bg-primary data-[state=active]:text-white">
            <CalendarDays className="h-3 w-3 md:h-4 md:w-4" />
            <span className="hidden sm:inline">Daily Planner</span>
            <span className="sm:hidden">Planner</span>
          </TabsTrigger>
          <TabsTrigger value="analytics" className="flex items-center gap-1 md:gap-2 transition-none min-w-0 px-1 text-xs md:text-sm py-2.5 data-[state=active]:bg-primary data-[state=active]:text-white">
            <BarChart3 className="h-3 w-3 md:h-4 md:w-4" />
            <span className="hidden sm:inline">Analytics</span>
            <span className="sm:hidden">Stats</span>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-4">
          <DashboardOverview onTasks={() => setActiveTab("tasks")} onPlanner={() => setActiveTab("planner")} />
        </TabsContent>

        <TabsContent value="tasks">
          <TaskManager />
        </TabsContent>

        <TabsContent value="planner">
          <DailyPlanner />
        </TabsContent>

        <TabsContent value="analytics">
          <Analytics />
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default Dashboard;