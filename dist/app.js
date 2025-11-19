"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const hostDatabase_1 = __importDefault(require("./services/hostDatabase"));
const hostsController = __importStar(require("./controllers/hosts"));
const hosts_1 = __importDefault(require("./routes/hosts"));
const app = (0, express_1.default)();
// Middleware
app.use(express_1.default.json());
// Initialize database
const hostDb = new hostDatabase_1.default('./db/woly.db');
// Initialize and start the server
async function startServer() {
    try {
        // Initialize database (create tables, seed data)
        await hostDb.initialize();
        // Pass database instance to controller
        hostsController.setHostDatabase(hostDb);
        // Start periodic network scanning (every 5 minutes)
        // Initial scan runs in background after 5 seconds for faster API availability
        hostDb.startPeriodicSync(5 * 60 * 1000, false);
        // Routes
        app.use('/hosts', hosts_1.default);
        // Health check endpoint
        app.get('/health', (req, res) => {
            res.json({ status: 'ok', message: 'WoLy server is running' });
        });
        // Start listening
        const server = app.listen(8082, '0.0.0.0', () => {
            const address = server.address();
            if (typeof address === 'string') {
                console.log('WoLy listening at %s', address);
            }
            else if (address) {
                const { address: host, port } = address;
                console.log('WoLy listening at http://%s:%s', host, port);
            }
        });
        // Graceful shutdown
        process.on('SIGINT', async () => {
            console.log('Shutting down...');
            await hostDb.close();
            process.exit(0);
        });
    }
    catch (error) {
        console.error('Failed to start server:', error);
        process.exit(1);
    }
}
startServer();
