const express = require('express');

const hostsController = require('../controllers/hosts');

const router = express.Router();

// Get all hosts
router.get('/', hostsController.getAllHosts);

// Scan network and sync hosts
router.post('/scan', hostsController.scanNetwork);

// Add a new host manually
router.post('/', hostsController.addHost);

// Get a specific host by name
router.get('/:name', hostsController.getHost);

// Get MAC address vendor information
router.get('/mac-vendor/:mac', hostsController.getMacVendor);

// Wake up a specific host
router.post('/wakeup/:name', hostsController.wakeUpHost);

module.exports = router;
