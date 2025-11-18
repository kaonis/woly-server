const wol = require('wake_on_lan');

// Database service will be set by app.js
let hostDb = null;

function setHostDatabase(db) {
  hostDb = db;
}

exports.getAllHosts = async (req, res, next) => {
  try {
    const hosts = await hostDb.getAllHosts();
    res.status(200).json({ hosts });
  } catch (error) {
    console.error('Error fetching hosts:', error);
    res.status(500).json({ error: 'Failed to fetch hosts' });
  }
};

exports.getHost = async (req, res, next) => {
  const { name } = req.params;
  console.log(`Retrieving host with name ${name}`);

  try {
    const host = await hostDb.getHost(name);
    if (!host) {
      res.status(204).send();
      return console.log(`No host found with the name ${name}`);
    }
    res.json(host);
    return console.log(`Found and sent host ${host.name} details`);
  } catch (error) {
    console.error('Error fetching host:', error);
    res.status(500).json({ error: 'Failed to fetch host' });
  }
};

exports.wakeUpHost = async (req, res, next) => {
  const { name } = req.params;
  console.log(`Trying to wake up host with name ${name}`);

  try {
    const host = await hostDb.getHost(name);
    
    if (!host) {
      res.status(204).send();
      return console.log(`No host found with name ${name}`);
    }

    wol.wake(host.mac, (error) => {
      if (error) {
        console.error(`Error waking up host ${name}: ${error.stack}`);
        res.status(500).json({ 
          success: false, 
          name: host.name, 
          error: error.message 
        });
        return;
      }

      console.log(`Sent WoL magic packet to host ${name} (${host.mac})`);
      res.status(200).json({ 
        success: true, 
        name: host.name, 
        mac: host.mac,
        message: 'Wake-on-LAN packet sent' 
      });
    });
  } catch (error) {
    console.error('Error waking up host:', error);
    res.status(500).json({ error: 'Failed to wake up host' });
  }
};

/**
 * Force a network scan and sync immediately
 */
exports.scanNetwork = async (req, res, next) => {
  try {
    console.log('Manual network scan requested');
    await hostDb.syncWithNetwork();
    
    const hosts = await hostDb.getAllHosts();
    res.status(200).json({ 
      message: 'Network scan completed',
      hostsCount: hosts.length,
      hosts 
    });
  } catch (error) {
    console.error('Network scan error:', error);
    res.status(500).json({ error: 'Failed to scan network' });
  }
};

/**
 * Add a new host manually
 */
exports.addHost = async (req, res, next) => {
  const { name, mac, ip } = req.body;

  if (!name || !mac || !ip) {
    res.status(400).json({ error: 'Missing required fields: name, mac, ip' });
    return;
  }

  try {
    const host = await hostDb.addHost(name, mac, ip);
    res.status(201).json(host);
  } catch (error) {
    console.error('Error adding host:', error);
    res.status(500).json({ error: 'Failed to add host' });
  }
};

module.exports.setHostDatabase = setHostDatabase;
