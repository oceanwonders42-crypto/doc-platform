#!/usr/bin/env npx tsx
/**
 * Task queue loop - helps developers resume work after system crashes.
 * Reads TASK_QUEUE.md, shows current task, allows updating on completion.
 */

import * as fs from "fs";
import * as readline from "readline";

const TASK_QUEUE_PATH = "TASK_QUEUE.md";

interface ParsedTaskQueue {
  currentTask: number;
  tasks: string[];
  rawContent: string;
}

function parseTaskQueue(content: string): ParsedTaskQueue {
  const lines = content.split("\n");
  let currentTask = 1;
  const tasks: string[] = [];

  for (const line of lines) {
    const taskMatch = line.match(/^CURRENT_TASK:\s*(\d+)/i);
    if (taskMatch) {
      currentTask = parseInt(taskMatch[1], 10);
    }
    const taskLineMatch = line.match(/^(\d+)\.\s+(.+)$/);
    if (taskLineMatch) {
      const num = parseInt(taskLineMatch[1], 10);
      const desc = taskLineMatch[2].trim();
      tasks[num] = desc;
    }
  }

  return { currentTask, tasks, rawContent: content };
}

function updateCurrentTask(content: string, newTask: number): string {
  return content.replace(/CURRENT_TASK:\s*\d+/i, `CURRENT_TASK: ${newTask}`);
}

function readTaskQueue(): ParsedTaskQueue {
  const content = fs.readFileSync(TASK_QUEUE_PATH, "utf-8");
  return parseTaskQueue(content);
}

function writeTaskQueue(content: string): void {
  fs.writeFileSync(TASK_QUEUE_PATH, content, "utf-8");
}

function prompt(question: string): Promise<string> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

async function main(): Promise<void> {
  if (!fs.existsSync(TASK_QUEUE_PATH)) {
    console.error(`Error: ${TASK_QUEUE_PATH} not found.`);
    process.exit(1);
  }

  const { currentTask, tasks, rawContent } = readTaskQueue();
  const taskDesc = tasks[currentTask] ?? `Task ${currentTask}`;

  console.log("\n--- TASK QUEUE ---\n");
  console.log(`CURRENT_TASK: ${currentTask}`);
  console.log(`Task: ${taskDesc}\n`);

  const answer = await prompt("Mark task complete and prepare next? (y/n): ");

  if (answer.toLowerCase() === "y" || answer.toLowerCase() === "yes") {
    const nextTask = currentTask + 1;
    const nextDesc = tasks[nextTask] ?? `Task ${nextTask}`;

    const updated = updateCurrentTask(rawContent, nextTask);
    writeTaskQueue(updated);

    console.log(`\nUpdated CURRENT_TASK to ${nextTask}.`);
    console.log(`Next task: ${nextDesc}\n`);
  } else {
    console.log("\nNo changes made.\n");
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
