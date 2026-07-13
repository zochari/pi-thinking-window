Output assets/demo.gif
Set FontSize 14
Set FontFamily "Monospace"
Set Width 1200
Set Height 640
Set Theme "Dracula"
Set Padding 12

# Launch pi at a HIGH thinking level so the very first turn thinks at length
# (no context-gathering warm-up needed for a pure-reasoning prompt).
Type "pi --thinking high" Enter
Sleep 5s

# A prompt that makes the model think at length, so the sliding box fills up
Type "Think about lorem ipsum for a very long time" Enter
Sleep 5s
