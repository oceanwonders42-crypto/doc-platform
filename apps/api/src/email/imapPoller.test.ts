import assert from "node:assert/strict";

import {
  pollImapSinceUid,
  shouldUseLocalMailboxSandbox,
  testImapConnection,
  type ImapConfig,
} from "./imapPoller";

const originalNodeEnv = process.env.NODE_ENV;
const originalSandboxFlag = process.env.ONYX_ENABLE_LOCAL_MAILBOX_SANDBOX;

function buildSandboxConfig(): ImapConfig {
  return {
    host: "127.0.0.1",
    port: 1,
    secure: false,
    auth: {
      user: "smoke-mailbox@local.onyx",
      pass: "sandbox-only",
    },
    mailbox: "INBOX",
    sandbox: {
      mode: "local_imap_fixture",
      label: "Internal smoke mailbox sandbox",
      fixtureId: "imap_poller_test",
    },
  };
}

async function main() {
  process.env.NODE_ENV = "development";
  process.env.ONYX_ENABLE_LOCAL_MAILBOX_SANDBOX = "true";

  const cfg = buildSandboxConfig();
  assert.equal(shouldUseLocalMailboxSandbox(cfg), true);

  const firstPoll = await pollImapSinceUid(cfg, null, 25);
  assert.equal(firstPoll.messages.length, 3);
  assert.equal(firstPoll.highestUid, 1003);
  assert.deepEqual(
    firstPoll.messages.map((message) => message.attachments[0]?.filename),
    [
      "smoke-strong-record.pdf",
      "smoke-ambiguous-note.pdf",
      "smoke-clio-routing-letter.pdf",
    ]
  );
  assert.ok(
    firstPoll.messages.every((message) => message.rawHeaders["x-onyx-local-mailbox-sandbox"] === "true")
  );

  const followUpPoll = await pollImapSinceUid(cfg, 1001, 25);
  assert.equal(followUpPoll.messages.length, 2);
  assert.equal(followUpPoll.messages[0]?.uid, 1002);
  assert.equal(followUpPoll.highestUid, 1003);

  const connectionTest = await testImapConnection(cfg);
  assert.deepEqual(connectionTest, { ok: true });

  process.env.NODE_ENV = "production";
  assert.equal(shouldUseLocalMailboxSandbox(cfg), false);

  console.log("imapPoller sandbox tests passed");
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => {
    if (originalNodeEnv == null) {
      delete process.env.NODE_ENV;
    } else {
      process.env.NODE_ENV = originalNodeEnv;
    }
    if (originalSandboxFlag == null) {
      delete process.env.ONYX_ENABLE_LOCAL_MAILBOX_SANDBOX;
    } else {
      process.env.ONYX_ENABLE_LOCAL_MAILBOX_SANDBOX = originalSandboxFlag;
    }
  });
