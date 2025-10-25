const sqlite = require('sqlite3');
const db = new sqlite.Database('./bot/data/main.db');

db.serialize(() => {
  db.run("INSERT OR REPLACE INTO twitterUsers (username, data, cachedAt) VALUES (?, ?, ?)", ['cli_test', JSON.stringify({id:'1', username:'cli_test'}), Date.now()], function(err){
    if(err) console.error('insert err', err);
    else console.log('insert ok');

    db.get("SELECT data, cachedAt FROM twitterUsers WHERE username = ?", ['cli_test'], (err, row) => {
      if(err) console.error('select err', err);
      else console.log('select row', row);
      db.close();
    });
  });
});
