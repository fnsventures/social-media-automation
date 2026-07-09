import readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";

export function parseSetupArgs(argv = process.argv.slice(2)) {
  return {
    checkOnly: argv.includes("--check"),
    yes: argv.includes("--yes") || argv.includes("-y"),
    fix: argv.includes("--fix"),
    help: argv.includes("--help") || argv.includes("-h"),
  };
}

export function printHeading(title) {
  const line = "─".repeat(Math.max(title.length + 4, 48));
  console.log(`\n${line}\n  ${title}\n${line}\n`);
}

export function printStep(number, text) {
  console.log(`  ${number}. ${text}`);
}

export function printCopyBlock(title, lines) {
  console.log(`\n${title}`);
  console.log("┌" + "─".repeat(58) + "┐");
  for (const line of lines) {
    console.log(`│ ${line.padEnd(57)} │`);
  }
  console.log("└" + "─".repeat(58) + "┘\n");
}

export function printGitHubSecretsReminder(secretNames) {
  if (!secretNames.length) return;
  printCopyBlock("Copy these to GitHub → Settings → Secrets → Actions:", secretNames);
  console.log(
    "  https://github.com/<owner>/social-media-automation/settings/secrets/actions\n"
  );
}

export async function ask(question, { defaultValue = "" } = {}) {
  const rl = readline.createInterface({ input, output });
  const suffix = defaultValue ? ` [${defaultValue}]` : "";
  const answer = (await rl.question(`${question}${suffix}: `)).trim();
  rl.close();
  return answer || defaultValue;
}

export async function askYesNo(question, { defaultYes = true } = {}) {
  const hint = defaultYes ? "Y/n" : "y/N";
  const answer = (await ask(`${question} (${hint})`)).toLowerCase();
  if (!answer) return defaultYes;
  return answer.startsWith("y");
}
