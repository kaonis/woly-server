const express = require('express');

const hostsController = require('../controllers/hosts');

const router = express.Router();

router.get('/:name', hostsController.getHost);

router.get('/wakeup/:name', hostsController.wakeUpHost);

router.get('/', hostsController.getAllHosts);

/*
exports.addHost = function (req, res) {
    const host = req.body;
    console.log('Adding host: ' + JSON.stringify(host));
    db.collection('hosts', function (err, collection) {
        collection.insert(host, {safe: true}, function (err, result) {
            if (err) {
                res.send({'error': 'An error has occurred'});
            } else {
                console.log('Success: ' + JSON.stringify(result[0]));
                res.send(result[0]);
            }
        });
    });
};
*/
/*
router.get('/update/:name exports.updateHost = function (req, res) {
    const id = req.params.id;
    const host = req.body;
    console.log('Updating host: ' + id);
    console.log(JSON.stringify(host));
    db.collection('hosts', function (err, collection) {
        collection.update({'_id': new mongo.ObjectID(id)}, host, {safe: true}, function (err, result) {
            if (err) {
                console.log('Error updating host: ' + err);
                res.send({'error': 'An error has occurred'});
            } else {
                console.log('' + result + ' document(s) updated');
                res.send(host);
            }
        });
    });
};
*/
/*
exports.deleteHost = function (req, res) {
    const id = req.params.id;
    console.log('Deleting host: ' + id);
    db.collection('hosts', function (err, collection) {
        collection.remove({'_id': new mongo.ObjectID(id)}, {safe: true}, function (err, result) {
            if (err) {
                res.send({'error': 'An error has occurred - ' + err});
            } else {
                console.log('' + result + ' document(s) deleted');
                res.send(req.body);
            }
        });
    });
};
*/
/*--------------------------------------------------------------------------------------------------------------------*/
// Populate database with sample data -- Only used once: the first time the application is started.
// You'd typically not find this code in a real-life app, since the database would already exist.

/*
const populateDB = function() {

    const hosts = [
	{
      "name" : "whitehead",
      "mac" : "50:E5:49:55:4A:8C",
      "ip" : "192.168.1.10",
	  "status" : "awake"
   },
   {
      "name" : "phantom-senior",
      "mac" : "00:24:8C:23:D6:3E",
      "ip" : "192.168.1.7",
	  "status" : "asleep"
   },
   {
      "name" : "phantom qualcomm",
      "mac" : "40:8D:5C:53:90:91",
      "ip" : "192.168.1.100",
	  "status" : "asleep"
   },
   {
      "name" : "phantom intel",
      "mac" : "40:8D:5C:53:90:93",
      "ip" : "192.168.1.101",
	  "status" : "asleep"
   },
   {
      "name" : "giota-pc",
      "mac" : "74:2F:68:C8:BD:C5",
      "ip" : "192.168.1.8",
	  "status" : "asleep"
   },
   {
      "name" : "jb-ng",
      "mac" : "50:E5:49:EF:26:DA",
      "ip" : "192.168.1.49",
	  "status" : "asleep"
   },
   {
      "name" : "jb-pc",
      "mac" : "50:E5:49:56:4A:8C",
      "ip" : "192.168.1.50",
	  "status" : "asleep"
   }
	];

    db.collection('hosts', function(err, collection) {
        collection.insert(hosts, {safe:true}, function(err, result) {});
    });

    };
*/

/* sqlite
    db.close((err) => {
        if (err) {
            console.error(err.message);
        }
        console.log('Close the database connection.');
    });
*/

module.exports = router;
