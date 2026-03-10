"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MAX_UPLOAD_BYTES = exports.validateSize = exports.validateFileType = exports.validateUploadFileSync = exports.validateUploadFileLegacy = exports.validateUploadFile = void 0;
/**
 * File security scan — re-export from fileSecurity module for backward compatibility.
 * validateUploadFile is async (runs stub scanner); use await.
 */
var index_1 = require("./fileSecurity/index");
Object.defineProperty(exports, "validateUploadFile", { enumerable: true, get: function () { return index_1.validateUploadFile; } });
var index_2 = require("./fileSecurity/index");
Object.defineProperty(exports, "validateUploadFileLegacy", { enumerable: true, get: function () { return index_2.validateUploadFileLegacy; } });
Object.defineProperty(exports, "validateUploadFileSync", { enumerable: true, get: function () { return index_2.validateUploadFileSync; } });
Object.defineProperty(exports, "validateFileType", { enumerable: true, get: function () { return index_2.validateFileType; } });
Object.defineProperty(exports, "validateSize", { enumerable: true, get: function () { return index_2.validateSize; } });
Object.defineProperty(exports, "MAX_UPLOAD_BYTES", { enumerable: true, get: function () { return index_2.MAX_UPLOAD_BYTES; } });
