

1) the electron app when starts, it should start NATS as well.


```md
Yes, NATS can be run directly as a standalone executable without Docker. It's distributed as a single binary with zero dependencies, which is one of its key selling points.
Download and run directly:
You can grab the binary from GitHub releases and just run it:
bash# Download
curl -L https://github.com/nats-io/nats-server/releases/download/v2.10.x/nats-server-v2.10.x-linux-amd64.tar.gz -o nats.tar.gz
tar xzf nats.tar.gz
./nats-server
That's it — single binary, no runtime, no dependencies.
```


2) the agent-orchestrator should already use/trigger claude agent sdk  agents - /home/lukas/Projects/Github/lukaskellerstein/my-claude-code/claude_agent_sdk/python

so far, i do not see any implementation of it: /home/lukas/Projects/Github/lukaskellerstein/vex/agent-orchestrator/src/agent_orchestrator/adapters/claude_code_sdk.py





3) Extension


1. - The dialog does not have the icon for screenshot, so I can see the screenshot taken in "select" mode.
2. When selected "resize" mode, it does not show any rectangle/border around elements
3. When selected "style" mode:
- the style editor should be draggable, so i can move it around
- the style editor should have a "close" button
- the selected element should have a rectangle/border as it is selected (perhaps the same as in "select" mode when it is selected)
- the style editor should have button "copy style" => we don't need the "copy style" mode anymore

4. The VEX extension dialog should have not have the list of actions recorded. That should be moved into the VEX flowtable popup on the page, where we have now only the "modes". We should add the expandable chevron, when clicked it should open bigger panel with all the actions recorded.

5. When any mode is activated, no links on the page should work, if often happens for me that I am getting redirected while just clicking around.