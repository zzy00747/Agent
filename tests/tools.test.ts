import { describe, it, expect } from "vitest";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import { ReadTool, WriteTool, EditTool } from "../src/tools/file-tools.js";

describe("File tools", () => {
  it("should read files with line numbers", async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "mini-agent-"));
    const filePath = path.join(tempDir, "sample.txt");
    await fs.writeFile(filePath, "line1\nline2\nline3\n", "utf8");

    const tool = new ReadTool(tempDir);
    const result = await tool.execute({ path: "sample.txt" });

    expect(result.success).toBe(true);
    expect(result.content).toContain("     1|line1");
    expect(result.content).toContain("     2|line2");

    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it("should read files with offset and limit", async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "mini-agent-"));
    const filePath = path.join(tempDir, "sample.txt");
    await fs.writeFile(filePath, "a\nb\nc\nd\n", "utf8");

    const tool = new ReadTool(tempDir);
    const result = await tool.execute({
      path: "sample.txt",
      offset: 2,
      limit: 2,
    });

    expect(result.success).toBe(true);
    expect(result.content).toContain("     2|b");
    expect(result.content).toContain("     3|c");
    expect(result.content).not.toContain("     1|a");

    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it("should write files", async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "mini-agent-"));
    const filePath = path.join(tempDir, "write.txt");
    const tool = new WriteTool(tempDir);

    const result = await tool.execute({
      path: "write.txt",
      content: "Test content",
    });

    expect(result.success).toBe(true);
    const content = await fs.readFile(filePath, "utf8");
    expect(content).toBe("Test content");

    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it("should edit files", async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "mini-agent-"));
    const filePath = path.join(tempDir, "edit.txt");
    await fs.writeFile(filePath, "hello world", "utf8");
    const tool = new EditTool(tempDir);

    const result = await tool.execute({
      path: "edit.txt",
      old_str: "world",
      new_str: "agent",
    });

    expect(result.success).toBe(true);
    const content = await fs.readFile(filePath, "utf8");
    expect(content).toBe("hello agent");

    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it("should read multiple files via glob", async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "mini-agent-"));
    await fs.writeFile(path.join(tempDir, "a.txt"), "aaa", "utf8");
    await fs.writeFile(path.join(tempDir, "b.txt"), "bbb", "utf8");

    const tool = new ReadTool(tempDir);
    const result = await tool.execute({ glob: "*.txt" });

    expect(result.success).toBe(true);
    expect(result.content).toContain("=== file: a.txt ===");
    expect(result.content).toContain("=== file: b.txt ===");
    expect(result.content).toContain("aaa");
    expect(result.content).toContain("bbb");

    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it("should auto-chunk large files", async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "mini-agent-"));
    const filePath = path.join(tempDir, "big.txt");
    // ~4000 tokens of content (well above 8000-token threshold would need more,
    // so we create enough to trigger head/tail truncation).
    const longLine = "x".repeat(100);
    const lines = Array.from({ length: 400 }, () => longLine);
    await fs.writeFile(filePath, lines.join("\n"), "utf8");

    const tool = new ReadTool(tempDir);
    const result = await tool.execute({ path: "big.txt" });

    expect(result.success).toBe(true);
    expect(result.content).toContain("[Content truncated");

    await fs.rm(tempDir, { recursive: true, force: true });
  });
});
