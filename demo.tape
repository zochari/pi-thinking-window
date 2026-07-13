Output assets/demo.gif
Set FontSize 14
Set FontFamily "Monospace"
Set Width 1200
Set Height 640
Set Theme "Dracula"
Set Padding 12

# Launch pi with the thinking-window extension loaded from the repo root.
Type "pi -e ." Enter
Sleep 3s

# A prompt that makes the model think at length, so the sliding box fills up
# and keeps streaming. The interesting "sliding window" segment is the MIDDLE
# of the recording — trim to it afterwards if you want a tighter clip, e.g.:
#   gifsicle assets/demo.gif -O3 "#40-#140" -o assets/demo.gif
Type "Think step by step and explain in detail how Pi's thinking-window box maintains a fixed-height sliding window over a very long stream of reasoning tokens, covering the backing buffer, anchoring to the newest token, and line-wrap handling." Enter
Sleep 20s
