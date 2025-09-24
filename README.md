# wt

`wt` is a CLI tool that makes it easy to run multiple AI agents in parallel in separate Git worktrees. It handles:

1. Creating Git worktrees and associated branches.
2. Running setup commands in the worktree (e.g. installing dependencies)
3. Creating a `.env.local` in the worktree based on dynamic configuration, including checking the system for available ports to run servers on.
4. Launching a terminal-based "micro-IDE" in the worktree using a [Zellij](https://zellij.dev/) layout to prompt, monitor, and commit code changes.
5. Cleaning up the worktree when work is done, including cherry-picking changes back into the `main` branch automatically.

I created this as a generalization of the [worktree.ts script](https://github.com/luketurner/webhook-testing-tool/blob/main/scripts/worktree.ts) I created for my [webhook-testing-tool](https://github.com/luketurner/webhook-testing-tool) project.

See [Run parallel Claude Code sessions with Git worktrees](https://docs.claude.com/en/docs/claude-code/common-workflows#run-parallel-claude-code-sessions-with-git-worktrees) in the Claude Code docs for an intro to the workflow. Also, see my [How I'm using Claude Code](https://blog.luketurner.org/posts/how-i-m-using-claude-code/) blog post for a deeper explanation.

## Basic usage

1. Run the `wt init` command in your project's root directory to create default configuration files in `.wt/` (These files should be committed).
2. Edit the config files for your particular app.
3. Run `wt new` to create a new worktree session. (If you want to name the session, you can do `wt new my-name`).
4. When finished in the worktree, quit the Zellij session (`Ctrl q`).
5. `wt` will automatically prompt you to clean up the worktree and cherry pick commits back into `main`. Type `y` to confirm.

## Installation

Dependencies:

- `git`
- `zellij`
- `claude`
- `bun`

Optional, but recommended:

- `lazygit`
- Terminal-based editor (e.g. `neovim`, `helix`)

To install `wt`, you have four options:

1. Download a single-file binary from the [latest release](https://github.com/luketurner/wt/releases/latest).
2. Run `bun add -g @luketurner/wt` to install globally.
3. Run `bun add @luketurner/wt` to install just in the current project.
4. Run `bunx @luketurner/wt` to install and run `wt` with a single command.

## Configuration

`wt` uses the `.wt/config.ts` file for config settings. A default config is automatically scaffolded by the `wt init` command. The following options are available:

| Setting       | Type       | Usage                                                                                                                                                |
| ------------- | ---------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| `layout`      | `string`   | Relative path to the `zellij` layout file to use when opening worktree sessions.                                                                     |
| `environment` | `function` | Function that should return an object of environment variables to be placed in the `.env.local` file when creating a new worktree session.           |
| `setup`       | `function` | Function that runs when creating a new worktree session. Can be used to install dependencies, create test files, or whatever your application needs. |
