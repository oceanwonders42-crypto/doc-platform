"use strict";
/**
 * CRM-agnostic export layer: unified contract and destinations.
 * Use after document processing is complete. Supports: CRM adapter, cloud folder, email packet, manual download bundle.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.runExport = exports.getSupportedDestinationKinds = exports.getExportDestination = exports.buildExportBundle = void 0;
var contract_1 = require("./contract");
Object.defineProperty(exports, "buildExportBundle", { enumerable: true, get: function () { return contract_1.buildExportBundle; } });
var destinations_1 = require("./destinations");
Object.defineProperty(exports, "getExportDestination", { enumerable: true, get: function () { return destinations_1.getExportDestination; } });
Object.defineProperty(exports, "getSupportedDestinationKinds", { enumerable: true, get: function () { return destinations_1.getSupportedDestinationKinds; } });
var runExport_1 = require("./runExport");
Object.defineProperty(exports, "runExport", { enumerable: true, get: function () { return runExport_1.runExport; } });
