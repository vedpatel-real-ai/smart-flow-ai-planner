import { useState } from "react";
import { Download, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { errorText } from "@/auth/session";
import { demoStoreKey, resetDemo } from "@/providers/DemoProvider";

export default function DemoStorageControls() {
  const [problem, setProblem] = useState("");
  const [busy, setBusy] = useState(false);
  async function reset() {
    if (!window.confirm("Replace all tasks, schedules, categories, preferences and completion history in this browser’s demo workspace with a fresh sample?")) return;
    setBusy(true);
    try {
      await resetDemo();
      location.reload();
    } catch (error) {
      setProblem(errorText(error));
      setBusy(false);
    }
  }
  function download() {
    try {
      const raw = localStorage.getItem(demoStoreKey);
      if (raw === null) throw new Error("There is no saved demo workspace to export.");
      const url = URL.createObjectURL(new Blob([raw], { type: "application/json" }));
      const link = document.createElement("a");
      link.href = url;
      link.download = "smart-flow-demo-backup.json";
      link.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      setProblem("");
    } catch (error) {
      setProblem(errorText(error));
    }
  }
  return <>
    <Button size="sm" variant="ghost" onClick={download}><Download size={14} className="mr-1" />Export saved data</Button>
    <Button size="sm" variant="outline" disabled={busy} onClick={reset}><RotateCcw size={14} className="mr-1" />Reset demo</Button>
    {problem && <p role="alert" className="basis-full text-sm text-destructive">{problem}</p>}
  </>;
}
