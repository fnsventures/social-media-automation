import fs from "node:fs";
import path from "node:path";

export const STATUS_VIEWERS_FILE = "status-viewers.json";

function isPersonalJid(jid) {
  return (
    typeof jid === "string" &&
    (jid.endsWith("@s.whatsapp.net") || jid.endsWith("@lid"))
  );
}

function addJid(set, jid) {
  if (isPersonalJid(jid)) set.add(jid);
}

function addFromContactList(set, list) {
  for (const contact of list ?? []) {
    const id = typeof contact === "string" ? contact : contact?.id;
    addJid(set, id);
  }
}

function addFromChatList(set, chats) {
  for (const chat of chats ?? []) {
    const id = typeof chat === "string" ? chat : chat?.id;
    addJid(set, id);
  }
}

export function createContactCollector() {
  const jids = new Set();

  function attach(sock) {
    sock.ev.on("contacts.upsert", (contacts) => addFromContactList(jids, contacts));
    sock.ev.on("contacts.update", (contacts) => addFromContactList(jids, contacts));
    sock.ev.on("chats.upsert", (chats) => addFromChatList(jids, chats));
    sock.ev.on("chats.update", (chats) => addFromChatList(jids, chats));
    sock.ev.on("messaging-history.set", ({ contacts, chats }) => {
      addFromContactList(jids, contacts);
      addFromChatList(jids, chats);
    });
  }

  return {
    attach,
    getJids() {
      return [...jids];
    },
    async waitForJids(timeoutMs) {
      const deadline = Date.now() + timeoutMs;
      while (Date.now() < deadline) {
        await new Promise((resolve) => setTimeout(resolve, 500));
      }
      return [...jids];
    },
  };
}

export function statusViewersPath(authDir) {
  return path.join(authDir, STATUS_VIEWERS_FILE);
}

export function loadStatusViewers(authDir) {
  const filePath = statusViewersPath(authDir);
  if (!fs.existsSync(filePath)) return [];

  try {
    const data = JSON.parse(fs.readFileSync(filePath, "utf8"));
    return (data.jids ?? []).filter(isPersonalJid);
  } catch {
    return [];
  }
}

export function saveStatusViewers(authDir, jids) {
  const unique = [...new Set(jids.filter(isPersonalJid))];
  const filePath = statusViewersPath(authDir);
  fs.writeFileSync(
    filePath,
    `${JSON.stringify({ syncedAt: new Date().toISOString(), jids: unique }, null, 2)}\n`,
    "utf8"
  );
  return unique.length;
}

export function mergeStatusViewerJids(...lists) {
  const merged = new Set();
  for (const list of lists) {
    for (const jid of list ?? []) addJid(merged, jid);
  }
  return [...merged];
}
