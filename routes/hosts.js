const sqlite3 = require('sqlite3').verbose();
const wol = require('wake_on_lan');
const express = require('express');

const router = express.Router();

const db = new sqlite3.Database('./db/woly.db', err => {
  if (err) {
    console.error(err.message);
  }
  console.log('Connected to the WoLy database.');
});

const hostTable = [
  ['whitehead', '50:E5:49:55:4A:8C', '192.168.1.10', 'asleep'],
  ['phantom-senior', '00:24:8C:23:D6:3E', '192.168.1.7', 'asleep'],
  ['phantom qualcomm', '40:8D:5C:53:90:91', '192.168.1.100', 'asleep'],
  ['phantom intel', '40:8D:5C:53:90:93', '192.168.1.101', 'asleep'],
  ['giota-pc', '74:2F:68:C8:BD:C5', '192.168.1.8', 'asleep'],
  ['jb-ng', '50:E5:49:EF:26:DA', '192.168.1.49', 'asleep'],
  ['jb-pc', '50:E5:49:56:4A:8C', '192.168.1.50', 'asleep']
];

router.get('/:name', (req, res) => {
  const { name } = req.params.name;
  console.log(`Retrieving host with name ${name}`);

  // SQL statement
  const sql =
    'SELECT hosts.name name, hosts.mac mac, hosts.ip ip, hosts.status status' +
    'FROM hosts' +
    'WHERE name  = ?';

  // return first row only
  db.get(sql, [name], (err, row) => {
    if (err) {
      return console.error(err.message);
    }
    if (!row) {
      res.status(204).send();
      return console.log(`No host found with the name ${name}`);
      // console.log(`No host found with the name ${name}`);
    }
    res.json(row);
    return console.log(`Found and sent host ${row.name} details`);
  });
});

router.get('/wakeup/:name', (req, res) => {
  const { name } = req.params.name;
  console.log(`Trying to wake up host with name $name`);

  // SQL statement
  const sql = `SELECT hosts.name name, hosts.mac mac, hosts.ip ip, hosts.status status
           FROM hosts
           WHERE name  = ?`;

  db.get(sql, [name], (err, row) => {
    if (err) {
      return console.error(err.message);
    }
    if (!row) {
      res.status(204).send();
      return console.log(`No host found with name ${name}`);
      // return console.error(new Error(`No host found with the name ${name}`));
    }
    wol.wake(row.mac, error => {
      if (error) {
        res.send(`[{"name": ${row.name},"result": "error"}]`);
        return console.error(`Error waking up host with name ${name} ${error.stack}`);
      }
      wol.createMagicPacket(row.mac);
      console.log(`Sent WoL to host with name ${name}`);
      res.send(`[{"name": ${row.name},"result": "success"}]`);
      return null;
    });

    // const magic_packet = wol.createMagicPacket(row.mac);
    return row;
  });
});

db.run(
  'CREATE TABLE IF NOT EXISTS hosts(\n' +
    ' name text PRIMARY KEY UNIQUE,\n' +
    ' mac text NOT NULL UNIQUE,\n' +
    ' ip text NOT NULL UNIQUE,\n' +
    ' status text NOT NULL\n' +
    //    ' table_constraint\n' +
    ');',
  err => {
    for (let i = 0; i < hostTable.length; i += 1) {
      db.run(
        'INSERT INTO hosts("name", "mac", "ip", "status") VALUES(?,?,?,?)',
        hostTable[i][0],
        hostTable[i][1],
        hostTable[i][2],
        hostTable[i][3],
        error => {
          if (error) {
            return console.log(error.message);
          }
          return console.log(`Row inserted ${this.changes}`);
        }
      );
    }
    if (err) {
      return console.log(err.stack);
    }
    // console.log(data.toString());
    return null;
  }
);

router.get('/', (req, res) => {
  const sql = 'SELECT hosts.name name, hosts.mac mac, hosts.ip ip, hosts.status status FROM hosts';

  const hostArray = [];

  db.each(
    sql,
    (err, row) => {
      hostArray.push(row);
    },
    () => {
      console.log(hostArray);
      res.json(hostArray);
    }
  );
});
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
