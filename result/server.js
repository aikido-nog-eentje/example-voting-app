// Load required dependencies
var express = require('express'),
    async = require('async'),
    { Pool } = require('pg'),
    cookieParser = require('cookie-parser'),
    helmet = require('helmet'),
    app = express(),
// Apply helmet middleware for security headers
app.use(helmet()),
    server = require('http').Server(app),
    io = require('socket.io')(server);

// Configure server port
var port = process.env.PORT || 4000;

// Handle WebSocket connections
io.on('connection', function (socket) {

  // Send welcome message to newly connected client
  socket.emit('message', { text : 'Welcome!' });

  // Allow clients to subscribe to specific channels
  socket.on('subscribe', function (data) {
    socket.join(data.channel);
  });
});

// Initialize PostgreSQL connection pool
var pool = new Pool({
  connectionString: 'postgres://postgres:postgres@db/postgres'
});

// Retry database connection with exponential backoff
async.retry(
  {times: 1000, interval: 1000},
  function(callback) {
    pool.connect(function(err, client, done) {
      if (err) {
        console.error("Waiting for db");
      }
      callback(err, client);
    });
  },
  function(err, client) {
    if (err) {
      return console.error("Giving up");
    }
    console.log("Connected to db");
    getVotes(client);
  }
);

// Query database for vote counts and emit results via WebSocket
function getVotes(client) {
  client.query('SELECT vote, COUNT(id) AS count FROM votes GROUP BY vote', [], function(err, result) {
    if (err) {
      console.error("Error performing query: " + err);
    } else {
      var votes = collectVotesFromResult(result);
      // Broadcast vote results to all connected clients
      io.sockets.emit("scores", JSON.stringify(votes));
    }

    // Poll database every second for updated results
    setTimeout(function() {getVotes(client) }, 1000);
  });
}

// Transform database query results into vote count object
function collectVotesFromResult(result) {
  var votes = {a: 0, b: 0};

  result.rows.forEach(function (row) {
    votes[row.vote] = parseInt(row.count);
  });

  return votes;
}

// Configure Express middleware
app.use(cookieParser());
app.use(express.urlencoded());
app.use(express.static(__dirname + '/views'));

// Serve main HTML page
app.get('/', function (req, res) {
  res.sendFile(path.resolve(__dirname + '/views/index.html'));
});

// Start HTTP server
server.listen(port, function () {
  var port = server.address().port;
  console.log('App running on port ' + port);
});
