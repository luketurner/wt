# `CLAUDE.md` - wt

## Project Context

`wt` is a CLI tool for running claude in a worktree.

## Code Style and Patterns

### Anchor comments

Add specially formatted comments throughout the codebase, where appropriate, for yourself as inline knowledge that can be easily `grep`ped for.

### Guidelines:

- Use `AIDEV-NOTE:`, `AIDEV-TODO:`, or `AIDEV-QUESTION:` (all-caps prefix) for comments aimed at AI and developers.
- **Important:** Before scanning files, always first try to **grep for existing anchors** `AIDEV-*` in relevant subdirectories.
- **Update relevant anchors** when modifying associated code.
- **Do not remove `AIDEV-NOTE`s** without explicit human instruction.
- Make sure to add relevant anchor comments, whenever a file or piece of code is:
  - too complex, or
  - very important, or
  - confusing, or
  - could have a bug

### Organize your project by feature areas

Organize your project into subdirectories based on the features or your application or common themes to the code in those directories.

Avoid creating subdirectories based on the type of code that lives in those directories. For example, avoid creating directories like components, directives, and services.

Avoid putting so many files into one directory that it becomes hard to read or navigate. As the number files in a directory grows, consider splitting further into additional sub-directories.

### One concept per file

Prefer focusing source files on a single concept. When in doubt, go with the approach that leads to smaller files.

### Util directory

If a helper function would be useful across multiple feature areas, put it in an appropriate file in the `./src/util` directory.

### Writing tests

When writing tests:

- Avoid performing expensive tasks in `beforeEach`. Note that DB state is already reset between each test automatically.
- When generating UUIDs for testing, use the randomUUID function from the @/util/uuid module to brand them with the correct type.
- When generating base64 strings for testing, use parseBase64 function from @/util/base64 function to brand them with the correct type.

## Development Best Practices

- NEVER use the `any` type to fix TypeScript errors.
- Use `bun` for all package management commands. DO NOT use `npm`.
- Commit messages should tersely explain what changed without excessive prose.
- Prefix all commit messages with "claude: "
- Use `bun run format` to format code changes.
- Use `bun run compile` to compile code changes. DO NOT use `bunx tsc`.
