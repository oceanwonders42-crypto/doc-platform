"use strict";
/**
 * Registry of export destinations. Add new CRM adapters by implementing IExportDestination
 * and registering here under the same "crm" kind or a new kind.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.emailPacketDestination = exports.crmDestination = exports.cloudFolderDestination = exports.downloadBundleDestination = void 0;
exports.getExportDestination = getExportDestination;
exports.getSupportedDestinationKinds = getSupportedDestinationKinds;
const downloadBundle_1 = require("./downloadBundle");
Object.defineProperty(exports, "downloadBundleDestination", { enumerable: true, get: function () { return downloadBundle_1.downloadBundleDestination; } });
const cloudFolder_1 = require("./cloudFolder");
Object.defineProperty(exports, "cloudFolderDestination", { enumerable: true, get: function () { return cloudFolder_1.cloudFolderDestination; } });
const crmAdapter_1 = require("./crmAdapter");
Object.defineProperty(exports, "crmDestination", { enumerable: true, get: function () { return crmAdapter_1.crmDestination; } });
const emailPacket_1 = require("./emailPacket");
Object.defineProperty(exports, "emailPacketDestination", { enumerable: true, get: function () { return emailPacket_1.emailPacketDestination; } });
const byKind = {
    download_bundle: downloadBundle_1.downloadBundleDestination,
    cloud_folder: cloudFolder_1.cloudFolderDestination,
    crm: crmAdapter_1.crmDestination,
    email_packet: emailPacket_1.emailPacketDestination,
};
function getExportDestination(kind) {
    const d = byKind[kind];
    if (!d)
        throw new Error(`Unknown export destination: ${kind}`);
    return d;
}
function getSupportedDestinationKinds() {
    return ["download_bundle", "cloud_folder", "crm", "email_packet"];
}
