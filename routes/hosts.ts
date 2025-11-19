import express from 'express';
import * as hostsController from '../controllers/hosts';
import { apiLimiter, scanLimiter, wakeLimiter } from '../middleware/rateLimiter';
import { validateRequest } from '../middleware/validateRequest';
import { macAddressSchema, updateHostSchema, wakeHostSchema } from '../validators/hostValidator';

const router = express.Router();

// Apply general API rate limiter to all routes
router.use(apiLimiter);

// Get all hosts
router.get('/', hostsController.getAllHosts);

// Scan network and sync hosts (with stricter rate limiting)
router.post('/scan', scanLimiter, hostsController.scanNetwork);

// Add a new host manually (with validation)
router.post('/', validateRequest(updateHostSchema, 'body'), hostsController.addHost);

// Get MAC address vendor information (with validation)
router.get('/mac-vendor/:mac', validateRequest(macAddressSchema, 'params'), hostsController.getMacVendor);

// Get a specific host by name
router.get('/:name', hostsController.getHost);

// Wake up a specific host (with validation and rate limiting)
router.post('/wakeup/:name', wakeLimiter, hostsController.wakeUpHost);

export default router;
