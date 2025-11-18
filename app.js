const express = require('express');
const HostDatabase = require('./services/hostDatabase');
const hostsController = require('./controllers/hosts');
const hosts = require('./routes/hosts');

const app = express();

// Middleware
app.use(express.json());

// Initialize database
const hostDb = new HostDatabase('./db/woly.db');

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
    app.use('/hosts', hosts);
    
    // Health check endpoint
    app.get('/health', (req, res) => {
      res.json({ status: 'ok', message: 'WoLy server is running' });
    });
    
    // Start listening
    const server = app.listen(8082, '0.0.0.0', () => {
      const { address, port } = server.address();
      console.log('WoLy listening at http://%s:%s', address, port);
    });
    
    // Graceful shutdown
    process.on('SIGINT', async () => {
      console.log('Shutting down...');
      await hostDb.close();
      process.exit(0);
    });
    
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

startServer();
