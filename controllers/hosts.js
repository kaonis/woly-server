const sqlite3 = require('sqlite3').verbose();
const wol = require('wake_on_lan');

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

exports.getAllHosts = (req, res, next) => {
  const sql = 'SELECT hosts.name name, hosts.mac mac, hosts.ip ip, hosts.status status FROM hosts';

  const hostArray = [];

  db.each(
    sql,
    (err, row) => {
      hostArray.push(row);
    },
    () => {
      const hostsMap = { hosts: hostArray };
      console.log(hostsMap);
      res.status(200).json(hostsMap);
    }
  );
};

exports.getHost = (req, res, next) => {
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
};

exports.wakeUpHost = (req, res, next) => {
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
        res.status(204).send(`[{"name": ${row.name},"result": "error"}]`);
        return console.error(`Error waking up host with name ${name} ${error.stack}`);
      }
      wol.createMagicPacket(row.mac);
      console.log(`Sent WoL to host with name ${name}`);
      res.status(200).send(`[{"name": ${row.name},"result": "success"}]`);
      return null;
    });

    // const magic_packet = wol.createMagicPacket(row.mac);
    return row;
  });
};

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
        function(error) {
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
