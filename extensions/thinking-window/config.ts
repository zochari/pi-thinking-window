import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import type { KeyId } from "@earendil-works/pi-tui";

/**
 * Configuration for the thinking window, read from Pi's global `settings.json`.
 *
 * Pi has no per-extension config slot, so we use a namespaced `thinkingWindow`
 * key in `~/.pi/agent/settings.json` (the same path Pi resolves via
 * `$PI_CODING_AGENT_DIR` or `~/.pi/agent`). On load the extension ensures this
 * block exists, writing the defaults if it's missing — so installing the
 * extension automatically populates the config. Unknown keys are preserved when
 * Pi rewrites settings.json, so the block is safe alongside Pi's own fields.
 *
 * settings.json shape (auto-created if absent):
 *   {
 *     "thinkingWindow": {
 *       "height": 12,           // box ceiling (rows); THINKING_WINDOW_HEIGHT env wins
 *       "enabled": true,        // render the box on load
 *       "toggleKey": "alt+shift+b"    // toggle shortcut, as a KeyId string
 *     }
 *   }
 */
export interface ThinkingWindowSettings {
  height?: number;
  enabled?: boolean;
  toggleKey?: string;
  cursorActivityFix?: boolean;

const DEFAULTS: Required<ThinkingWindowSettings> = {
  height: 12,
  enabled: true,
  toggleKey: "alt+shift+b",
  cursorActivityFix: true,
};

const SPECIAL_KEYS = new Set([
  "escape",
  "esc",
  "enter",
  "return",
  "tab",
  "space",
  "backspace",
  "delete",
  "insert",
  "clear",
  "home",
  "end",
  "pageup",
  "pagedown",
  "up",
  "down",
  "left",
  "right",
  "f1",
  "f2",
  "f3",
  "f4",
  "f5",
  "f6",
  "f7",
  "f8",
  "f9",
  "f10",
  "f11",
  "f12",
]);

const MODIFIERS = new Set(["ctrl", "shift", "alt", "super"]);

// Mirror pi-coding-agent's getSettingsPath(): $PI_CODING_AGENT_DIR/settings.json,
// else ~/.pi/agent/settings.json (CONFIG_DIR_NAME defaults to ".pi").
function getSettingsPath(): string {
  const envDir = process.env.PI_CODING_AGENT_DIR;
  const agentDir = envDir ? envDir : path.join(os.homedir(), ".pi", "agent");
  return path.join(agentDir, "settings.json");
}

function readRawSettings(): Record<string, unknown> | null {
  try {
    const file = getSettingsPath();
    if (fs.existsSync(file)) {
      const parsed = JSON.parse(fs.readFileSync(file, "utf-8"));
      if (parsed && typeof parsed === "object") return parsed as Record<string, unknown>;
    }
  } catch {
    // Corrupt/missing settings is non-fatal.
  }
  return null;
}

function writeRawSettings(obj: Record<string, unknown>): void {
  try {
    const file = getSettingsPath();
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify(obj, null, 2) + "\n", "utf-8");
  } catch {
    // Non-fatal: config just won't be auto-materialized this run.
  }
}

/**
 * Load the thinkingWindow config, creating the block in settings.json with
 * defaults if it doesn't exist yet.
 */
function bootstrap(): ThinkingWindowSettings {
  const raw = readRawSettings() ?? {};
  const existing = raw.thinkingWindow;
  if (!existing || typeof existing !== "object") {
    raw.thinkingWindow = { ...DEFAULTS };
    writeRawSettings(raw);
    return { ...DEFAULTS };
  }
  return { ...DEFAULTS, ...(existing as ThinkingWindowSettings) };
}

const settings: ThinkingWindowSettings = bootstrap();

export function getInitialHeight(): number {
  const fromEnv = process.env.THINKING_WINDOW_HEIGHT;
  if (fromEnv) {
    const n = Number.parseInt(fromEnv, 10);
    if (Number.isFinite(n)) return n;
  }
  return settings.height ?? DEFAULTS.height;
}

export function getInitialEnabled(): boolean {
  return settings.enabled ?? DEFAULTS.enabled;
}

export function getCursorActivityFix(): boolean {
  return settings.cursorActivityFix ?? DEFAULTS.cursorActivityFix;
}

/**
 * Parse a config `toggleKey` string (e.g. "alt+b", "ctrl+shift+t", "f5") into a
 * KeyId. Falls back to "alt+b" on any invalid input. The pi-tui parser treats
 * the final token as the key and any earlier tokens as modifiers, so modifier
 * order is irrelevant.
 */
export function parseToggleKey(): KeyId {
  const raw = (settings.toggleKey ?? DEFAULTS.toggleKey).trim().toLowerCase();
  const parts = raw.split("+");
  const key = parts.pop();
  const mods = parts;
  if (!key || mods.some((m) => !MODIFIERS.has(m))) return "alt+b" as KeyId;
  const validKey = /^[a-z0-9]$/.test(key) || SPECIAL_KEYS.has(key);
  if (!validKey) return "alt+b" as KeyId;
  return (mods.length ? `${mods.join("+")}+${key}` : key) as KeyId;
}
