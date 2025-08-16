#!/usr/bin/env bun

import { $, spawn } from "bun";
import { existsSync, writeFileSync } from "fs";
import { createConnection } from "net";
import { humanId } from "human-id";

// AIDEV-NOTE: CLI script for creating git worktrees and opening Claude Code in them

const SCRIPT_NAME = "worktree";

function showUsage() {
  console.log(`Usage: ${SCRIPT_NAME} <command> [label]`);
  console.log("");
  console.log("Commands:");
  console.log("  new [label]       Create a new worktree and open Claude Code");
  console.log(
    "                    If no label provided, generates one automatically",
  );
  console.log("  open <label>      Open an existing worktree in zellij");
  console.log(
    "                    Attaches to existing session or creates new one",
  );
  console.log("  cleanup [label]   Remove worktree and associated branch");
  console.log(
    "                    If no label provided, cleans up all worktrees",
  );
  console.log("");
  console.log("Examples:");
  console.log(`  ${SCRIPT_NAME} new`);
  console.log(
    "  # Creates worktree with auto-generated label like 'funny-hippo-42'",
  );
  console.log("");
  console.log(`  ${SCRIPT_NAME} new feature-auth`);
  console.log(
    "  # Creates /workspaces/worktree-feature-auth and opens Claude Code",
  );
  console.log("");
  console.log(`  ${SCRIPT_NAME} open feature-auth`);
  console.log(
    "  # Opens existing worktree in zellij (attaches or creates session)",
  );
  console.log("");
  console.log(`  ${SCRIPT_NAME} cleanup feature-auth`);
  console.log(
    "  # Removes specific worktree and branch (prompts for merge if needed)",
  );
  console.log("");
  console.log(`  ${SCRIPT_NAME} cleanup`);
  console.log("  # Removes all worktrees and branches (prompts for each)");
}

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
      const line = lines[i].trim();
      if (line.startsWith("worktree /workspaces/worktree-")) {
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

async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    showUsage();
    process.exit(1);
  }

  if (args[0] === "--help" || args[0] === "-h") {
    showUsage();
    process.exit(0);
  }

  const command = args[0];
  let label = args[1];

  if (!["new", "open", "cleanup"].includes(command)) {
    showError("Command must be 'new', 'open', or 'cleanup'");
  }

  // Handle cleanup command
  if (command === "cleanup") {
    if (!label) {
      // Cleanup all worktrees
      await cleanupAllWorktrees();
      return;
    } else {
      // Cleanup specific worktree
      if (!/^[a-zA-Z0-9_-]+$/.test(label)) {
        showError(
          "Label must contain only letters, numbers, underscores, and hyphens",
        );
      }
      await cleanupWorktree(label);
      return;
    }
  }

  // Handle open command
  if (command === "open") {
    if (!label) {
      showError("Label is required for 'open' command");
    }
    if (!/^[a-zA-Z0-9_-]+$/.test(label)) {
      showError(
        "Label must contain only letters, numbers, underscores, and hyphens",
      );
    }
    await openWorktree(label);
    return;
  }

  // For 'new' command, generate label if not provided
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

  // Continue with new command (existing logic)

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

// Run the script
main().catch((error) => {
  console.error("Unexpected error:", error);
  process.exit(1);
});