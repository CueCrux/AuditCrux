// MemoryCrux Benchmark — File-based memory proxy for F1 arm
//
// Simulates file-based knowledge management (Glob/Grep/Read equivalent).
// Materialises corpus as an in-memory file tree that the LLM searches via tools.

import type { ProjectFixture, CorpusDocument, FixtureConstraint, ToolCallRecord } from "./types.js";

interface FileEntry {
  path: string;
  content: string;
}

export class FileProxy {
  private files: Map<string, FileEntry> = new Map();
  private memoryIndex: string;

  constructor(fixture: ProjectFixture) {
    // Materialise corpus as files
    for (const doc of fixture.corpus) {
      const dir = doc.type === "constraint" ? "constraints" : "docs";
      const path = `${dir}/${doc.id}.md`;
      const header = `# ${doc.title}\n\nType: ${doc.type}${doc.domain ? ` | Domain: ${doc.domain}` : ""}\n\n`;
      this.files.set(path, { path, content: header + doc.content });
    }

    // Materialise constraints as separate files
    for (const c of fixture.constraints) {
      const path = `constraints/${c.id}.md`;
      if (!this.files.has(path)) {
        const content = `# Constraint: ${c.id}\n\nSeverity: ${c.severity}\nScope: ${c.scope ?? "global"}\n\n${c.assertion}`;
        this.files.set(path, { path, content });
      }
    }

    // Build MEMORY.md index
    const indexLines = ["# MEMORY.md — Document Index", ""];
    const sortedPaths = [...this.files.keys()].sort();
    for (const p of sortedPaths) {
      const entry = this.files.get(p)!;
      const firstLine = entry.content.split("\n").find((l) => l.startsWith("# "))?.replace(/^#\s*/, "") ?? p;
      indexLines.push(`- [${firstLine}](${p})`);
    }
    this.memoryIndex = indexLines.join("\n");
    this.files.set("MEMORY.md", { path: "MEMORY.md", content: this.memoryIndex });
  }

  getMemoryIndex(): string {
    return this.memoryIndex;
  }

  async callTool(name: string, args: Record<string, unknown>): Promise<ToolCallRecord> {
    const start = performance.now();

    try {
      let result: unknown;

      switch (name) {
        case "search_files": {
          const pattern = String(args.pattern ?? "").toLowerCase();
          const matches = [...this.files.keys()].filter((p) => p.toLowerCase().includes(pattern));
          result = { matches, count: matches.length };
          break;
        }

        case "read_file": {
          const path = String(args.path ?? "");
          const entry = this.files.get(path);
          if (entry) {
            result = { path, content: entry.content };
          } else {
            return {
              toolName: name,
              args,
              result: null,
              latencyMs: Math.round(performance.now() - start),
              success: false,
              error: `File not found: ${path}`,
            };
          }
          break;
        }

        case "search_content": {
          const query = String(args.query ?? "").toLowerCase();
          const glob = args.glob ? String(args.glob).toLowerCase() : undefined;
          const matches: Array<{ path: string; line: number; text: string }> = [];

          for (const [path, entry] of this.files) {
            if (glob && !path.toLowerCase().includes(glob)) continue;
            const lines = entry.content.split("\n");
            for (let i = 0; i < lines.length; i++) {
              if (lines[i].toLowerCase().includes(query)) {
                matches.push({ path, line: i + 1, text: lines[i] });
              }
            }
          }
          result = { matches: matches.slice(0, 50), total: matches.length, query };
          break;
        }

        default:
          return {
            toolName: name,
            args,
            result: null,
            latencyMs: Math.round(performance.now() - start),
            success: false,
            error: `Unknown file tool: ${name}`,
          };
      }

      return {
        toolName: name,
        args,
        result,
        latencyMs: Math.round(performance.now() - start),
        success: true,
      };
    } catch (err) {
      return {
        toolName: name,
        args,
        result: null,
        latencyMs: Math.round(performance.now() - start),
        success: false,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }
}
