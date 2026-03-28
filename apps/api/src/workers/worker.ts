import "dotenv/config";
import { startDocumentWorkerLoop } from "./documentWorkerLoop";

startDocumentWorkerLoop({ label: "worker" }).catch((e) => {
  console.error(e);
  process.exit(1);
});
