# wt

Dependencies:

- `git`
- `zellij`
- `claude`

Optional, but recommended:

- `lazygit`
- Terminal-based editor (e.g. `neovim`, `helix`)

## Configuration

By default, the `wt` script uses the `.wt/config.ts` file for config settings. (Note this is _not_ in `$HOME`, but in the base directory of your project, and is expected to be added to version control for the project.)

Additionally, `wt` launches a `zellij` layout defined at `.wt/layout.kdl`. You can edit this file to change the layout of the panes or the commands that are run.
