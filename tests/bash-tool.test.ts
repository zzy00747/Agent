import { describe, it, expect } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import {
  BashTool,
  BashOutputTool,
  BashKillTool,
} from "../src/tools/bash-tool.js";

const describeIf = process.platform === "win32" ? describe.skip : describe;

describeIf("Bash tool", () => {
  it("should execute foreground commands", async () => {
    const tool = new BashTool();
    const result = await tool.execute({
      command: "echo 'Hello from foreground'",
    });

    expect(result.success).toBe(true);
    expect(result.stdout).toContain("Hello from foreground");
    expect(result.exit_code).toBe(0);
  });

  it("should capture stdout and stderr", async () => {
    const tool = new BashTool();
    const result = await tool.execute({
      command: "echo 'stdout message' && echo 'stderr message' >&2",
    });

    expect(result.success).toBe(true);
    expect(result.stdout).toContain("stdout message");
    expect(result.stderr).toContain("stderr message");
  });

  it("should report command failures", async () => {
    const tool = new BashTool();
    const result = await tool.execute({
      command: "ls /nonexistent_directory_12345",
    });

    expect(result.success).toBe(false);
    expect(result.exit_code).not.toBe(0);
    expect(result.error).toBeTruthy();
  });

  it("should handle timeouts", async () => {
    const tool = new BashTool();
    const result = await tool.execute({ command: "sleep 5", timeout: 1 });

    expect(result.success).toBe(false);
    expect(result.error?.toLowerCase()).toContain("timed out");
  }, 10000);

  it("should run background commands and fetch output", async () => {
    const tool = new BashTool();
    const result = await tool.execute({
      command: "for i in 1 2 3; do echo 'Line '$i; sleep 0.2; done",
      run_in_background: true,
    });

    expect(result.success).toBe(true);
    const bashId = result.bash_id ?? "";
    expect(bashId).not.toBe("");
    await new Promise((resolve) => setTimeout(resolve, 500));

    const outputTool = new BashOutputTool();
    const outputResult = await outputTool.execute({ bash_id: bashId });

    expect(outputResult.success).toBe(true);
    expect(outputResult.stdout).toContain("Line");

    const killTool = new BashKillTool();
    const killResult = await killTool.execute({ bash_id: bashId });
    expect(killResult.success).toBe(true);
  }, 10000);

  it("should filter background output", async () => {
    const tool = new BashTool();
    const result = await tool.execute({
      command: "for i in 1 2 3 4 5; do echo 'Line '$i; sleep 0.2; done",
      run_in_background: true,
    });

    const bashId = result.bash_id ?? "";
    expect(bashId).not.toBe("");
    await new Promise((resolve) => setTimeout(resolve, 800));

    const outputTool = new BashOutputTool();
    const outputResult = await outputTool.execute({
      bash_id: bashId,
      filter_str: "Line [24]",
    });

    expect(outputResult.success).toBe(true);
    if (outputResult.stdout) {
      expect(outputResult.stdout).toMatch(/Line (2|4)/);
    }

    const killTool = new BashKillTool();
    await killTool.execute({ bash_id: bashId });
  }, 10000);

  it("should handle non-existent bash ids", async () => {
    const killTool = new BashKillTool();
    const killResult = await killTool.execute({ bash_id: "nonexistent123" });

    expect(killResult.success).toBe(false);
    expect(killResult.error?.toLowerCase()).toContain("not found");

    const outputTool = new BashOutputTool();
    const outputResult = await outputTool.execute({
      bash_id: "nonexistent123",
    });

    expect(outputResult.success).toBe(false);
    expect(outputResult.error?.toLowerCase()).toContain("not found");
  });

  it("should run commands in the configured workspace directory", async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "bash-workspace-"));
    const tool = new BashTool(tempDir);

    const result = await tool.execute({ command: "pwd" });

    expect(result.success).toBe(true);
    expect(result.stdout.trim()).toBe(tempDir);

    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it("should block dangerous commands", async () => {
    const tool = new BashTool("/tmp");

    const blocked = [
      "rm -rf /",
      "rm -rf /*",
      "format C:",
      "dd if=/dev/zero of=/dev/sda",
      "mkfs.ext4 /dev/sda1",
    ];

    for (const command of blocked) {
      const result = await tool.execute({ command });
      expect(result.success).toBe(false);
      expect(result.error?.toLowerCase()).toContain("blocked");
    }
  });

  it("should flag sensitive commands by default", async () => {
    const tool = new BashTool("/tmp");
    const result = await tool.execute({ command: "rm file.txt" });

    expect(result.success).toBe(false);
    expect(result.error?.toLowerCase()).toContain("sensitive");
  });

  it("should allow commands matching allowedPatterns", async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "bash-allow-"));
    fs.writeFileSync(path.join(tempDir, "file.txt"), "hello", "utf8");

    const tool = new BashTool(tempDir, {
      allowedPatterns: ["rm file\\.txt"],
    });
    const result = await tool.execute({ command: "rm file.txt" });

    expect(result.success).toBe(true);
    expect(fs.existsSync(path.join(tempDir, "file.txt"))).toBe(false);

    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it("should block commands matching custom blockedPatterns", async () => {
    const tool = new BashTool("/tmp", {
      blockedPatterns: ["evil-command"],
    });

    const result = await tool.execute({ command: "evil-command" });
    expect(result.success).toBe(false);
    expect(result.error?.toLowerCase()).toContain("blocked");
  });
});
