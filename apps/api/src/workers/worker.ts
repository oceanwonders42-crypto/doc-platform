import "dotenv/config";
import { startDocumentWorkerLoop } from "./documentWorkerLoop";
import { startJobQueueWorker } from "./jobQueueWorker";

async function main() {
  await Promise.all([
    startDocumentWorkerLoop({ label: "worker" }),
    startJobQueueWorker(),
  ]);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
