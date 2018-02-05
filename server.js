var express = require('express');
var hosts = require('./routes/hosts');

var app = express();
//var fs = require("fs");
//var router = express.Router();
/*
router.get('/hosts', hosts.findAll);
router.get('/hosts/:name', hosts.findByName);
router.get('/hosts/wakeup/:name', hosts.wakeUp);
*/

app.use('/hosts', hosts);

var server = app.listen(8082, function () {
    var host = server.address().address;
    var port = server.address().port;

  console.log("WoLy listening at http://%s:%s", host, port);

});