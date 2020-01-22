const axios = require("axios");
const jwt = require("jsonwebtoken");

// declare interval for server based turn logic

// {socket id : token}
let userMap = {};
// keep an array of users, first index being whose turn it is
let users = [];

// keep a list of moves made by the user whose turn it is
let moves = [];

let turnTime;
let timeLeft;

let currWord = "";
// rotate an array like a deque
// https://stackoverflow.com/a/33451102
const arrayRotate = (arr, count) => {
  count -= arr.length * Math.floor(count / arr.length);
  arr.push.apply(arr, arr.splice(0, count));
  return arr;
};

// logic for when the time interval has completed
// rotates users array (mutation side effect)
// emits new drawing
// emits to to next user it's their turn
const emitter = (io, socket, users, userMap) => {};

module.exports = io => {
  // execute whenever a new socket connects
  io.on("connection", socket => {
    // sanity check log
    users.push(socket.id);
    console.log("New client connected");

    if (users.length === 1) {
      axios.get("http://localhost:1234/api/users/generateWord").then(res => {
        currWord = res.data;
        io.to(users[0]).emit("turn", res.data);
      });
    }

    // get new client's token and associate it with socket id
    socket.on("token", data => {
      let token = data.split(" ")[1];
      let decoded = jwt.verify(token, process.env.ACCESS_TOKEN_SECRET);

      userMap[socket.id] = {
        username: decoded.username,
        score: 0
      };

      io.emit("initialize", {
        moves: moves,
        users: Object.values(userMap)
      });
    });

    // event in which the player has drawn
    socket.on("newPositionData", data => {
      // broadcast new drawing points to everyone
      io.emit("newDrawingData", data);
      // add to the moves array so new clients receive all the work until that point
      moves.push(data);
    });

    socket.on("startDrawing", () => {
      timeLeft = 60;

      if (timeLeft === 60) {
        turnTime = setInterval(() => {
          io.emit("updateTime", timeLeft);
          timeLeft--;

          if (timeLeft === -1) {
            clearInterval(turnTime);
            console.log(`it is time: ${Date.now()}`);
            io.to(users[0]).emit("endTurn", -1);
          }
        }, 1000);
      }
    });

    socket.on("changedTurn", () => {
      io.emit("changedTurn", -1);
      moves = [];
      arrayRotate(users, 1);

      axios.get("http://localhost:1234/api/users/generateWord").then(res => {
        currWord = res.data;
        io.to(users[0]).emit("turn", res.data);
      });
    });
    // event for new clients to receive drawings already in progress

    io.emit("initialize", {
      moves: moves,
      users: Object.values(userMap)
    });

    socket.on("guessWord", word => {
      if (currWord === word) {
        io.to(socket.id).emit("guessWord", timeLeft * 10);
      }
    });
    // execute whenever a connected socket disconnects
    socket.on("disconnect", () => {
      delete userMap[socket.id];

      for (let i = 0; i < users.length; ++i) {
        if (socket.id === users[i]) {
          users.splice(i, 1);
          // socket.emit("updateUsers", Object.values(userMap));

          if (i === 0) {
            if (users.length > 0) {
              arrayRotate(users, -1);
              timeLeft = 0;
              io.emit("changedTurn", -1);
              io.to(users[0]).emit("turn", currWord);
            }

            moves = [];
          }
        }
      }
      // sanity check log
      console.log("Client disconnected");
    });
  });
};
