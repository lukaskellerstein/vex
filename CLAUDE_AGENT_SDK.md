Review implementation of `/home/lukas/Projects/Github/lukaskellerstein/vex/agent-orchestrator/src/agent_orchestrator`, specifically `/home/lukas/Projects/Github/lukaskellerstein/vex/agent-orchestrator/src/agent_orchestrator/adapters/claude_code_sdk.py`.

Here is the project, where usage of marketplace work nicely, agent correctly choosing plugins/skills/agents: `/home/lukas/Projects/Github/lukaskellerstein/my-claude-code/claude_agent_sdk/python/1_single_agent/10_marketplace`

Here is documentation on how to correctly use plugins and troubleshooting guide: `https://platform.claude.com/docs/en/agent-sdk/plugins`

I want from Agent orchestrator to download defined `marketplace` (Claude, codex ... perhaps others in future) to the it's folder (all configurable, ideally via config.json), and then the particular agents, will reference these plugins (again, ideally configurable, let's have a claude.json config, where we wil be able to define multiple agents, let's start with "general" one, and we can add others, where we will define system message, plugins that it should be able to use, allowed tools ... etc.).

Let's also have a test script, that will test defined agents with "testing" prompts, and make sure, that they behaves correctly (will output it's run and messages to the terminal - colored as here: `/home/lukas/Projects/Github/lukaskellerstein/my-claude-code/claude_agent_sdk/python/1_single_agent/10_marketplace/10_agent_with_marketplace.py`) and validate that agent called skills/agents when expected.

Let's define following marketplace in the config:

- `https://github.com/lukaskellerstein/claude-my-marketplace`

Let's create one "general" agent in the config:

- model: `claude-opus-4.6`
- plugins: [
  `dev-tools-plugin@claude-my-marketplace`,
  `documentation-plugin@claude-my-marketplace`,
  `media-plugin@claude-my-marketplace`,
  `design-plugin@claude-my-marketplace`,
  `web-design-plugin@claude-my-marketplace`
  ]
