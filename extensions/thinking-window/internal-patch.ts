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

function collectThinkingBlocks(
  message: AssistantMessageLike,
): { contentIndex: number; text: string }[] {
  const blocks: { contentIndex: number; text: string }[] = [];
  message.content.forEach((content, index) => {
    if (content.type !== "thinking") return;
    const thinking = content as ThinkingContentLike;
    if (!hasVisibleThinking(thinking)) return;
    blocks.push({ contentIndex: index, text: thinking.thinking });
  });
  return blocks;
}

let cleanup: (() => void) | undefined;
let refCount = 0;
let installing: Promise<() => void> | undefined;

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

  const originalUpdateContent = proto.updateContent as (message: AssistantMessageLike) => void;
  const originalSetHideThinkingBlock = proto.setHideThinkingBlock as (
    hide: boolean,
  ) => void;

  const restore = () => {
    if (proto.updateContent !== originalUpdateContent) proto.updateContent = originalUpdateContent;
    if (proto.setHideThinkingBlock !== originalSetHideThinkingBlock) {
      proto.setHideThinkingBlock = originalSetHideThinkingBlock;
    }
  };

  const safeTheme = getThemeOrFallback(theme);

  const patchedUpdateContent = function (this: any, message: AssistantMessageLike) {
    this.lastMessage = message;
    const blocks = collectThinkingBlocks(message);
    if (blocks.length === 0) {
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
      const thinkingText = blocks.map((b) => b.text).join("\n");
      const firstThinkingIndex = blocks[0].contentIndex;
      const hasTextAfterThinking = message.content
        .slice(firstThinkingIndex + 1)
        .some((c) => c.type === "text" && c.text.trim());
      let renderedThinking = false;
      for (const content of message.content) {
        if (content.type === "text" && content.text.trim()) {
          this.contentContainer.addChild(
            new Markdown(content.text.trim(), 1, 0, this.markdownTheme),
          );
          continue;
        }
        if (content.type === "thinking" && !renderedThinking) {
          this.contentContainer.addChild(
            new ThinkingWindowComponent(safeTheme, thinkingText, getBoxHeight()),
          );
          renderedThinking = true;
          if (hasTextAfterThinking) this.contentContainer.addChild(new Spacer(1));
        }
      }

      const hasToolCalls = message.content.some((c) => c.type === "toolCall");
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

  proto.updateContent = patchedUpdateContent;
  proto.setHideThinkingBlock = patchedSetHideThinkingBlock;
  return restore;
}
