const sqlite = require('sqlite3');
const db = new sqlite.Database('./bot/data/main.db');
db.all("SELECT name, sql FROM sqlite_master WHERE type='table'", (e, rows) => {
  if (e) console.error(e);
  else console.log(JSON.stringify(rows, null, 2));
  db.close();
});
