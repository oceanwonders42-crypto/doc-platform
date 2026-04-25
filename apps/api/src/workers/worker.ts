import "dotenv/config";
import { startDocumentWorkerLoop } from "./documentWorkerLoop";
import { startIntegrationSyncWorker } from "./integrationSyncWorker";
import { startJobQueueWorker } from "./jobQueueWorker";

async function main() {
  await Promise.all([
    startDocumentWorkerLoop({ label: "worker" }),
    startIntegrationSyncWorker(),
    startJobQueueWorker(),
  ]);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
