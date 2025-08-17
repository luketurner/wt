#!/usr/bin/env bun

import { $, spawn } from "bun";
import { existsSync, writeFileSync } from "fs";
import { createConnection } from "net";
import { humanId } from "human-id";
import { Command } from "commander";
import zellijLayout from "./zellij-layout.kdl" with { type: "file" };
import defaultConfig from "./default-config.ts" with { type: "file" };

// AIDEV-NOTE: CLI script for creating git worktrees and opening Claude Code in them

const SCRIPT_NAME = "worktree";

function showError(message: string) {
  console.error(`Error: ${message}`);
  process.exit(1);
}

/**
 * Check if a port is available
 */
function isPortAvailable(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const server = createConnection({ port, host: "localhost" }, () => {
      server.end();
      resolve(false); // Port is in use
    });

    server.on("error", () => {
      resolve(true); // Port is available
    });
  });
}

/**
 * Find two adjacent available ports in the 3002-4000 range
 */
async function findAvailablePorts(): Promise<{
  adminPort: number;
  webhookPort: number;
}> {
  for (let port = 3002; port < 4000; port++) {
    const webhookAvailable = await isPortAvailable(port);
    const adminAvailable = await isPortAvailable(port + 1);

    if (adminAvailable && webhookAvailable) {
      return { adminPort: port + 1, webhookPort: port };
    }
  }

  throw new Error("No adjacent ports available in range 3002-4000");
}

/**
 * Prompt user for yes/no input
 */
function promptUser(question: string): Promise<boolean> {
  return new Promise((resolve) => {
    process.stdout.write(`${question} (y/N): `);
    process.stdin.resume();
    process.stdin.setEncoding("utf8");

    process.stdin.once("data", (data) => {
      const input = data.toString().trim().toLowerCase();
      process.stdin.pause();
      resolve(input === "y" || input === "yes");
    });
  });
}

/**
 * Check if branch has commits not merged into main
 */
async function hasUnmergedCommits(branch: string): Promise<boolean> {
  try {
    const result = await $`git log main..${branch} --oneline`.quiet();
    return result.stdout.toString().trim().length > 0;
  } catch {
    return false;
  }
}

/**
 * Get list of all our worktrees (those matching /workspaces/worktree-*)
 */
async function getAllWorktrees(): Promise<string[]> {
  try {
    const result = await $`git worktree list --porcelain`.quiet();
    const lines = result.stdout.toString().split("\n");
    const worktrees: string[] = [];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]?.trim();
      if (line && line.startsWith("worktree /workspaces/worktree-")) {
        const worktreePath = line.substring("worktree ".length);
        const label = worktreePath.split("/workspaces/worktree-")[1];
        if (label && label !== "") {
          worktrees.push(label);
        }
      }
    }

    return worktrees;
  } catch {
    return [];
  }
}

/**
 * Cleanup all worktrees
 */
async function cleanupAllWorktrees() {
  const worktrees = await getAllWorktrees();

  if (worktrees.length === 0) {
    console.log("No worktrees found to clean up.");
    return;
  }

  console.log(`Found ${worktrees.length} worktree(s): ${worktrees.join(", ")}`);

  const shouldProceed = await promptUser(
    "Do you want to clean up all worktrees?",
  );
  if (!shouldProceed) {
    console.log("Cleanup cancelled.");
    return;
  }

  for (const label of worktrees) {
    console.log(`\n--- Cleaning up worktree: ${label} ---`);
    await cleanupWorktree(label);
  }

  console.log("\n✓ All worktrees cleaned up successfully");
}

/**
 * Cleanup worktree and associated branch
 */
async function cleanupWorktree(label: string) {
  const worktreePath = `/workspaces/worktree-${label}`;

  // Check if worktree exists
  if (!existsSync(worktreePath)) {
    console.log(`Worktree ${worktreePath} does not exist.`);
    return;
  }

  console.log(`Cleaning up worktree: ${worktreePath}`);

  try {
    // Check if branch has unmerged commits
    const hasUnmerged = await hasUnmergedCommits(label);

    if (hasUnmerged) {
      console.log(`Branch '${label}' has commits not merged into main.`);
      const shouldCherryPick = await promptUser(
        "Do you want to cherry-pick them into main first?",
      );

      if (shouldCherryPick) {
        console.log("Switching to main and cherry-picking commits...");
        await $`git checkout main`;

        // Get the list of commits to cherry-pick
        const commitsResult = await $`git rev-list main..${label}`.quiet();
        const commits = commitsResult.stdout
          .toString()
          .trim()
          .split("\n")
          .reverse();

        for (const commit of commits) {
          if (commit.trim()) {
            await $`git cherry-pick ${commit}`;
          }
        }
        console.log(`✓ Cherry-picked commits from ${label} into main`);
      }
    }

    // Remove worktree
    console.log("Removing worktree...");
    await $`git worktree remove ${worktreePath} --force`;
    console.log(`✓ Removed worktree ${worktreePath}`);

    // Delete branch
    console.log("Deleting branch...");
    await $`git branch -D ${label}`;
    console.log(`✓ Deleted branch ${label}`);

    // delete zellij session -- removes it from list of ressurectable sessions
    await $`zellij delete-session wtt-${label}`;

    console.log("✓ Cleanup completed successfully");
  } catch (error) {
    showError(`Failed to cleanup worktree: ${error}`);
  }
}

/**
 * Open an existing worktree in zellij
 */
async function openWorktree(label: string) {
  const worktreePath = `/workspaces/worktree-${label}`;

  // Check if worktree exists
  if (!existsSync(worktreePath)) {
    showError(`Worktree ${worktreePath} does not exist.`);
  }

  const sessionName = `wtt-${label}`;

  // Check if session already exists
  try {
    const result = await $`zellij list-sessions -ns`.quiet().nothrow();
    const sessions =
      result.exitCode === 0 ? result.stdout.toString().trim().split("\n") : [];
    const sessionExists = sessions.some((s) => s.includes(sessionName));

    if (sessionExists) {
      console.log(`Attaching to existing zellij session: ${sessionName}`);
      // Attach to existing session
      const zellijProc = spawn(["zellij", "attach", sessionName], {
        stdio: ["inherit", "inherit", "inherit"],
        cwd: worktreePath,
      });

      await zellijProc.exited;
    } else {
      console.log(`Creating new zellij session: ${sessionName}`);
      // Create new session
      const zellijProc = spawn(
        ["zellij", "-n", ".zellij/worktree.kdl", "-s", sessionName],
        {
          stdio: ["inherit", "inherit", "inherit"],
          cwd: worktreePath,
        },
      );

      await zellijProc.exited;
    }

    console.log("✓ Closed worktree session");
  } catch (error) {
    showError(`Failed to open worktree session: ${error}`);
  }
}

/**
 * Create a new worktree
 */
async function createWorktree(label?: string) {
  // Generate label if not provided
  if (!label) {
    label = humanId({
      separator: "-",
      capitalize: false,
    });
    console.log(`Auto-generated label: ${label}`);
  }

  // Validate label (basic git branch name rules)
  if (!/^[a-zA-Z0-9_-]+$/.test(label)) {
    showError(
      "Label must contain only letters, numbers, underscores, and hyphens",
    );
  }

  const worktreePath = `/workspaces/worktree-${label}`;
  const envPath = `${worktreePath}/.env.local`;

  // Check if worktree already exists
  if (existsSync(worktreePath)) {
    console.log(`Worktree already exists at ${worktreePath}`);
    console.log("Opening Claude Code in existing worktree...");
  } else {
    console.log(`Creating worktree: ${worktreePath}`);

    // Create the worktree (this will create a new branch if it doesn't exist)
    try {
      await $`git worktree add ${worktreePath} -b ${label}`;
      await $`cp -r local ${worktreePath}/local`;
      await $`cd ${worktreePath} && bun install`;
      console.log(`✓ Worktree created at ${worktreePath}`);
    } catch (error) {
      showError(`Failed to create worktree: ${error}`);
    }
  }

  // Find available ports and create .env.local
  console.log("Finding available ports...");
  let adminPort: number;
  let webhookPort: number;

  try {
    const ports = await findAvailablePorts();
    adminPort = ports.adminPort;
    webhookPort = ports.webhookPort;

    const envContent = `WTT_ADMIN_PORT=${adminPort}\nWTT_WEBHOOK_PORT=${webhookPort}\n`;
    writeFileSync(envPath, envContent);
    console.log(
      `✓ Created .env.local with ports ${adminPort} and ${webhookPort}`,
    );
  } catch (error) {
    showError(`Failed to find available ports: ${error}`);
  }

  console.log("Creating zellij session...");
  const sessionName = `wtt-${label}`;

  try {
    const zellijProc = spawn(
      ["zellij", "-n", ".zellij/worktree.kdl", "-s", sessionName],
      {
        stdio: ["inherit", "inherit", "inherit"],
        cwd: worktreePath,
      },
    );

    const exitCode = await zellijProc.exited;

    if (exitCode === 0) {
      console.log("✓ Worktree session completed");
    } else {
      console.log(`Worktree exited with code ${exitCode}`);
    }

    // Prompt for automatic cleanup
    console.log("");
    const shouldCleanup = await promptUser(
      `Do you want to clean up the worktree '${label}'?`,
    );

    if (shouldCleanup) {
      console.log("\n--- Starting automatic cleanup ---");
      await cleanupWorktree(label);
    } else {
      console.log(`Worktree '${label}' preserved at ${worktreePath}`);
    }
  } catch (error) {
    showError(`Failed to create zellij session: ${error}`);
  }
}

// Create the CLI program
const program = new Command();

program
  .name(SCRIPT_NAME)
  .description(
    "CLI tool for creating git worktrees and opening Claude Code in them",
  )
  .version("1.0.0")
  .option("-c, --config-dir <dir>", "Configuration directory", ".wt");

// New command
program
  .command("new [label]")
  .description("Create a new worktree and open Claude Code")
  .helpOption("-h, --help", "Display help for command")
  .action(async (label?: string) => {
    await createWorktree(label);
  });

// Open command
program
  .command("open <label>")
  .description("Open an existing worktree in zellij")
  .helpOption("-h, --help", "Display help for command")
  .action(async (label: string) => {
    if (!/^[a-zA-Z0-9_-]+$/.test(label)) {
      showError(
        "Label must contain only letters, numbers, underscores, and hyphens",
      );
    }
    await openWorktree(label);
  });

// Cleanup command
program
  .command("cleanup [label]")
  .description("Remove worktree and associated branch")
  .helpOption("-h, --help", "Display help for command")
  .action(async (label?: string) => {
    if (!label) {
      // Cleanup all worktrees
      await cleanupAllWorktrees();
    } else {
      // Cleanup specific worktree
      if (!/^[a-zA-Z0-9_-]+$/.test(label)) {
        showError(
          "Label must contain only letters, numbers, underscores, and hyphens",
        );
      }
      await cleanupWorktree(label);
    }
  });

// Init command
program
  .command("init")
  .description("Initialize repository with default config files")
  .helpOption("-h, --help", "Display help for command")
  .action(async () => {
    console.log("Initializing repository...");

    const options = program.opts();
    const wtDir = options.configDir;

    // Create layout.kdl file
    const layoutFile = `${wtDir}/layout.kdl`;
    if (!existsSync(layoutFile)) {
      Bun.write(layoutFile, Bun.file(zellijLayout as string), {
        createPath: true,
      });
      console.log(`✓ Created ${layoutFile}`);
    }

    const configFile = `${wtDir}/config.ts`;
    if (!existsSync(configFile)) {
      Bun.write(configFile, Bun.file(defaultConfig as unknown as string), {
        createPath: true,
      });
      console.log(`✓ Created ${configFile}`);
    }

    console.log("\n✓ Repository initialized successfully!");
    console.log("You can now use 'wt new' to create worktrees.");
  });

// Add examples to help
program.addHelpText(
  "after",
  `
Examples:
  ${SCRIPT_NAME} init
  # Initialize repository with .wt/layout.kdl and .wt/config.ts

  ${SCRIPT_NAME} --config-dir .my-config init
  # Initialize repository with custom config directory

  ${SCRIPT_NAME} new
  # Creates worktree with auto-generated label like 'funny-hippo-42'

  ${SCRIPT_NAME} new feature-auth
  # Creates /workspaces/worktree-feature-auth and opens Claude Code

  ${SCRIPT_NAME} open feature-auth
  # Opens existing worktree in zellij (attaches or creates session)

  ${SCRIPT_NAME} cleanup feature-auth
  # Removes specific worktree and branch (prompts for merge if needed)

  ${SCRIPT_NAME} cleanup
  # Removes all worktrees and branches (prompts for each)`,
);

// Parse the command line arguments
program.parse(process.argv);

// Show help if no command provided
if (!process.argv.slice(2).length) {
  program.outputHelp();
  process.exit(1);
}
