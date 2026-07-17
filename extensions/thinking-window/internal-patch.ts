/**
 * Runtime patch of Pi's internal AssistantMessageComponent.
 *
 * Pi exposes only `setHiddenThinkingLabel` for built-in thinking rendering, so
 * to host the thinking stream in our own fixed box we replace
 * `AssistantMessageComponent.prototype.updateContent` (and `setHideThinkingBlock`)
 * at runtime, then call the original back as a fallback when internals drift.
 *
 * Technique borrowed from crustyhacker/pi-thinking-steps (MIT). The patch depends
 * on Pi's internal `dist/...` modules, so a Pi upgrade can break it; install
 * failures degrade gracefully to Pi's native thinking renderer for that session.
 */
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { Markdown, Spacer, Text } from "@earendil-works/pi-tui";
import { ThinkingWindowComponent, type ThinkingThemeLike } from "./thinking-window.ts";
import { isEnabled, getBoxHeight } from "./state.ts";

const PI_CODING_AGENT = "@earendil-works/pi-coding-agent";
const INTERNAL_MODULES = {
  assistantMessageComponent: "dist/modes/interactive/components/assistant-message.js",
  theme: "dist/modes/interactive/theme/theme.js",
} as const;

interface ThinkingContentLike {
  type: "thinking";
  thinking: string;
  redacted?: boolean;
}
interface TextContentLike {
  type: "text";
  text: string;
}
interface ToolCallContentLike {
  type: "toolCall";
}
type ContentLike =
  | ThinkingContentLike
  | TextContentLike
  | ToolCallContentLike;
interface AssistantMessageLike {
  content: ContentLike[];
  stopReason?: string;
  errorMessage?: string;
}

function getPackageRoot(packageName: string): string {
  const entryUrl = import.meta.resolve(packageName);
  return dirname(dirname(fileURLToPath(entryUrl)));
}

function resolveInternalModuleUrl(relativePath: string): string {
  return pathToFileURL(join(getPackageRoot(PI_CODING_AGENT), relativePath)).href;
}

async function importInternal<T>(relativePath: string): Promise<T> {
  return (await import(resolveInternalModuleUrl(relativePath))) as T;
}

function getThemeOrFallback(raw: unknown): ThinkingThemeLike {
  const candidate = raw as ThinkingThemeLike | undefined;
  if (candidate && typeof candidate.fg === "function" && typeof candidate.italic === "function") {
    return candidate;
  }
  const identity = (s: string) => s;
  return { fg: (_c, t) => t, italic: identity };
}

function hasVisibleThinking(content: ThinkingContentLike): boolean {
  return content.redacted === true || (content.thinking?.trim().length ?? 0) > 0;
}

function hasAnyVisibleThinking(message: AssistantMessageLike): boolean {
  return message.content.some(
    (content) => content.type === "thinking" && hasVisibleThinking(content as ThinkingContentLike),
  );
}

let cleanup: (() => void) | undefined;
let refCount = 0;
let installing: Promise<() => void> | undefined;
const PATCHED = Symbol("thinking-window-patched");

/**
 * Reference-counted install. Returns a release() that restores the original
 * methods once every retained scope has released.
 */
export async function retainThinkingWindowPatch(): Promise<() => Promise<void>> {
  refCount++;
  if (!cleanup) {
    const pending = installing ?? installPatch();
    installing = installing ?? pending;
    try {
      cleanup = await pending;
    } catch (error) {
      refCount--;
      installing = undefined;
      throw error;
    } finally {
      if (installing === pending) installing = undefined;
    }
  }
  let released = false;
  return async () => {
    if (released) return;
    released = true;
    refCount--;
    if (refCount <= 0 && cleanup) {
      const restore = cleanup;
      cleanup = undefined;
      refCount = 0;
      restore();
    }
  };
}

async function installPatch(): Promise<() => void> {
  const [{ AssistantMessageComponent }, { theme }] = await Promise.all([
    importInternal<{ AssistantMessageComponent: unknown }>(
      INTERNAL_MODULES.assistantMessageComponent,
    ),
    importInternal<{ theme: unknown }>(INTERNAL_MODULES.theme),
  ]);

  const proto = (AssistantMessageComponent as { prototype?: unknown })?.prototype as
    | Record<string, unknown>
    | undefined;
  if (!proto || typeof proto.updateContent !== "function") {
    throw new Error("AssistantMessageComponent internals incompatible (missing updateContent).");
  }
  if ((proto as any)[PATCHED]) {
    // Already patched (e.g. extension loaded twice via -e . and a global install).
    // Become a no-op so we don't double-wrap and don't restore someone else's patch.
    return () => {};
  }

  const originalUpdateContent = proto.updateContent as (message: AssistantMessageLike) => void;
  const originalSetHideThinkingBlock = proto.setHideThinkingBlock as (
    hide: boolean,
  ) => void;

  const restore = () => {
    if (proto.updateContent !== originalUpdateContent) proto.updateContent = originalUpdateContent;
    if (proto.setHideThinkingBlock !== originalSetHideThinkingBlock) {
      proto.setHideThinkingBlock = originalSetHideThinkingBlock;
    }
    delete (proto as any)[PATCHED];
  };

  const safeTheme = getThemeOrFallback(theme);

  const patchedUpdateContent = function (this: any, message: any) {
    this.lastMessage = message;
    // Guard against malformed/partial messages so we never throw inside the
    // TUI render path (which would break the whole panel).
    if (!message || !Array.isArray(message.content)) {
      return originalUpdateContent.call(this, message);
    }
    let hasThinking: boolean;
    try {
      hasThinking = hasAnyVisibleThinking(message);
    } catch {
      return originalUpdateContent.call(this, message);
    }
    if (!hasThinking) {
      // No thinking to box up: keep Pi's native rendering for text/tools.
      return originalUpdateContent.call(this, message);
    }
    // Box disabled: fall back to Pi's native thinking rendering.
    if (!isEnabled()) {
      return originalUpdateContent.call(this, message);
    }
    try {
      this.contentContainer.clear();
      this.contentContainer.addChild(new Spacer(1));
      // Coalesce adjacent thinking blocks into one box (matches Pi's native
      // updateContent). The message content array routinely carries multiple
      // adjacent thinking entries, so per-entry boxes produced "multiple
      // thinking boxes in a row" instead of one.
      for (let i = 0; i < message.content.length; i++) {
        const content = message.content[i];
        if (content.type === "text" && content.text.trim()) {
          this.contentContainer.addChild(
            new Markdown(content.text.trim(), 1, 0, this.markdownTheme),
          );
          continue;
        }
        if (content.type === "thinking") {
          // Merge the run of consecutive thinking entries into one box (matches
          // Pi's native updateContent).
          const thinkingBlocks: string[] = [];
          for (; i < message.content.length; i++) {
            const tb = message.content[i] as ThinkingContentLike;
            if (tb.type !== "thinking") break;
            const t = tb.thinking?.trim();
            if (t || tb.redacted) thinkingBlocks.push(t ?? "");
          }
          i--;
          if (thinkingBlocks.length === 0) continue;
          const hasVisibleContentAfter = message.content
            .slice(i + 1)
            .some(
              (c: ContentLike) =>
                (c.type === "text" && c.text.trim()) ||
                (c.type === "thinking" && hasVisibleThinking(c as ThinkingContentLike)),
            );
          this.contentContainer.addChild(
            new ThinkingWindowComponent(
              safeTheme,
              thinkingBlocks.join("\n\n"),
              getBoxHeight(),
            ),
          );
          if (hasVisibleContentAfter) this.contentContainer.addChild(new Spacer(1));
        }
      }

      const hasToolCalls = message.content.some((c: ContentLike) => c.type === "toolCall");
      // Mirror native updateContent: render() uses hasToolCalls to decide OSC133
      // zone wrapping. Without this, assistant messages with tool calls were still
      // wrapped in OSC133 zones (hasToolCalls stayed false all session).
      this.hasToolCalls = hasToolCalls;
      if (!hasToolCalls) {
        if (message.stopReason === "aborted") {
          const abortMessage =
            message.errorMessage && message.errorMessage !== "Request was aborted"
              ? message.errorMessage
              : "Operation aborted";
          this.contentContainer.addChild(new Spacer(1));
          this.contentContainer.addChild(new Text(safeTheme.fg("error", abortMessage), 1, 0));
        } else if (message.stopReason === "error") {
          const errorMsg = message.errorMessage || "Unknown error";
          this.contentContainer.addChild(new Spacer(1));
          this.contentContainer.addChild(
            new Text(safeTheme.fg("error", `Error: ${errorMsg}`), 1, 0),
          );
        }
      }
    } catch (error) {
      // Never leave the panel broken: fall back to Pi's native renderer.
      try {
        originalUpdateContent.call(this, message);
      } catch {
        throw new Error("Thinking Window patch failed and fallback rendering also failed.", {
          cause: error,
        });
      }
    }
  };

  // Always show the box, even if the user toggles "hide thinking".
  const patchedSetHideThinkingBlock = function (this: any, _hide: boolean) {
    this.hideThinkingBlock = false;
    if (this.lastMessage) {
      try {
        this.updateContent(this.lastMessage);
      } catch {
        // noop
      }
    }
  };
  (proto as any)[PATCHED] = true;
  proto.updateContent = patchedUpdateContent;
  proto.setHideThinkingBlock = patchedSetHideThinkingBlock;
  return restore;
}
