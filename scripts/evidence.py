"""Run independent verification gates and record their provenance in verification-output."""
import datetime
import hashlib
import json
import os
import platform
import re
import subprocess
import sys
import xml.etree.ElementTree as ET
from pathlib import Path

out = Path("verification-output")
out.mkdir(exist_ok=True)
def now():
    return datetime.datetime.now(datetime.timezone.utc).isoformat()
def output(*command):
    return subprocess.check_output(command, text=True).strip()

def gate(name, command):
    started = now()
    with (out / (name + ".log")).open("w") as log:
        process = subprocess.Popen(command, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True)
        for line in process.stdout:
            # The local CLI prints generated keys when the development stack starts.
            if re.search(r"eyJ[A-Za-z0-9_-]+\.|sb_(?:secret|publishable)_|Bearer [A-Za-z0-9._-]+|postgres(?:ql)?://[^ ]+@", line, re.I):
                continue
            print(line, end="", flush=True)
            log.write(line)
        code = process.wait()
    (out / (name + ".status.json")).write_text(json.dumps({"gate": name, "started": started, "finished": now(), "exit": code}))
    return code

def summarize():
    sha = output("git", "rev-parse", "HEAD")
    report = {"commit":sha, "created":now(), "working_tree_clean":not output("git","status","--porcelain"),
              "runner":platform.platform(), "node":output("node","--version"), "npm":output("npm","--version"),
              "deno":output("deno","--version").splitlines()[0],
              "pull_request_head":os.environ.get("PR_HEAD_SHA"), "run_id":os.environ.get("GITHUB_RUN_ID"),
              "gates":[json.loads(p.read_text()) for p in sorted(out.glob("*.status.json"))], "suites":{}}
    for path in sorted(out.glob("*.xml")):
        cases = ET.parse(path).findall(".//testcase")
        counts = {"passed":0,"failed":0,"skipped":0}
        for case in cases:
            outcome = "skipped" if case.find("skipped") is not None else "failed" if any(case.find(t) is not None for t in ["failure","error"]) else "passed"
            counts[outcome] += 1
        report["suites"][path.stem] = counts
    (out / "manifest.json").write_text(json.dumps(report,indent=2)+"\n")
    lines = [f"# Smart Flow verification\n\nCommit `{sha}`\n", "| Suite | Passed | Failed | Skipped |","|---|---:|---:|---:|"]
    for name, counts in report["suites"].items():
        lines.append(f"| {name} | {counts['passed']} | {counts['failed']} | {counts['skipped']} |")
    lines += ["","| Gate | Exit code |","|---|---:|"]
    lines += [f"| {gate['gate']} | {gate['exit']} |" for gate in report["gates"]]
    (out / "summary.md").write_text("\n".join(lines)+"\n")
    checksums = [hashlib.sha256(p.read_bytes()).hexdigest()+"  "+p.name for p in sorted(out.iterdir()) if p.is_file() and p.name != "SHA256SUMS"]
    (out / "SHA256SUMS").write_text("\n".join(checksums)+"\n")
    if os.environ.get("GITHUB_STEP_SUMMARY"):
        with open(os.environ["GITHUB_STEP_SUMMARY"],"a") as handle:
            handle.write((out / "summary.md").read_text())
if __name__ == "__main__":
    if len(sys.argv) == 2 and sys.argv[1] == "summary":
        summarize()
    else:
        sys.exit(gate(sys.argv[1], sys.argv[2:]))
