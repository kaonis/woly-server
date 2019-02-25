const express = require('express');
const hosts = require('./routes/hosts');

const app = express();
// const fs = require("fs");
// const router = express.Router();
/*
router.get('/hosts', hosts.findAll);
router.get('/hosts/:name', hosts.findByName);
router.get('/hosts/wakeup/:name', hosts.wakeUp);
*/

app.get('/hosts', hosts);

const server = app.listen(8082, () => {
  const { host } = server.address().address;
  const { port } = server.address().port;

  console.log('WoLy listening at http://%s:%s', host, port);
});
