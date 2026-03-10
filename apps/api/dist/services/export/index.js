"use strict";
/**
 * CRM-agnostic export layer: unified contract and destinations.
 * Use after document processing is complete. Supports: CRM adapter, cloud folder, email packet, manual download bundle.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.getRecognitionForDocument = exports.buildDocumentNamingContext = exports.getFolderForDocType = exports.applyFolderPattern = exports.applyFilePattern = exports.setFirmExportNamingRules = exports.getFirmExportNamingRules = exports.runExport = exports.getSupportedDestinationKinds = exports.getExportDestination = exports.buildExportBundle = void 0;
var contract_1 = require("./contract");
Object.defineProperty(exports, "buildExportBundle", { enumerable: true, get: function () { return contract_1.buildExportBundle; } });
var destinations_1 = require("./destinations");
Object.defineProperty(exports, "getExportDestination", { enumerable: true, get: function () { return destinations_1.getExportDestination; } });
Object.defineProperty(exports, "getSupportedDestinationKinds", { enumerable: true, get: function () { return destinations_1.getSupportedDestinationKinds; } });
var runExport_1 = require("./runExport");
Object.defineProperty(exports, "runExport", { enumerable: true, get: function () { return runExport_1.runExport; } });
var namingRules_1 = require("./namingRules");
Object.defineProperty(exports, "getFirmExportNamingRules", { enumerable: true, get: function () { return namingRules_1.getFirmExportNamingRules; } });
Object.defineProperty(exports, "setFirmExportNamingRules", { enumerable: true, get: function () { return namingRules_1.setFirmExportNamingRules; } });
Object.defineProperty(exports, "applyFilePattern", { enumerable: true, get: function () { return namingRules_1.applyFilePattern; } });
Object.defineProperty(exports, "applyFolderPattern", { enumerable: true, get: function () { return namingRules_1.applyFolderPattern; } });
Object.defineProperty(exports, "getFolderForDocType", { enumerable: true, get: function () { return namingRules_1.getFolderForDocType; } });
Object.defineProperty(exports, "buildDocumentNamingContext", { enumerable: true, get: function () { return namingRules_1.buildDocumentNamingContext; } });
Object.defineProperty(exports, "getRecognitionForDocument", { enumerable: true, get: function () { return namingRules_1.getRecognitionForDocument; } });
