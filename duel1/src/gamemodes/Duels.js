var Mode = require('./Mode');

function Duels() {
    Mode.apply(this, Array.prototype.slice.call(arguments));
    
    this.ID = 4;
    this.name = "Duels US 1";
    this.packetLB = 48;
    this.IsTournament = true;
    
    this.canRemergeLimit = 200;
    this.newPlayerCellBoostValue = 410;
    
    // Config (1 tick = 1000 ms)
    this.prepTime = 5; // Amount of ticks after the server fills up to wait until starting the game
    this.endTime = 15; // Amount of ticks after someone wins to restart the game
    this.autoFill = false;
    this.autoFillPlayers = 1;
    
    // Gamemode Specific Variables
    this.gamePhase = 0; // 0 = Waiting for players, 1 = Prepare to start, 2 = Game in progress, 3 = End
    this.contenders = [];
    this.maxContenders = 12;
    this.SpawnPlayers = [
        // Right side of map
        {x: 2450,y:-2400},
        {x: 2450,y: 2450},
        // Top of map
        {x:-2500,y: 2400},
        {x:-2500,y: -2450},
    ];
    this.contenderSpawnPlayers;
    this.isPlayerLb = false;
    
    this.winner;
    this.timer;
    this.timeLimit = 3600; // in seconds
}

module.exports = Duels;
Duels.prototype = new Mode();

// Gamemode Specific Functions

Duels.prototype.getPos = function () {
    var pos = {
        x: 0,
        y: 0
    };
    
    // Random Position
    if (this.contenderSpawnPlayers.length > 0) {
        var index = Math.floor(Math.random() * this.contenderSpawnPlayers.length);
        pos = this.contenderSpawnPlayers[index];
        this.contenderSpawnPlayers.splice(index, 1);
    }
    
    return {
        x: pos.x,
        y: pos.y
    };
};

Duels.prototype.startGamePrep = function (gameServer) {
    this.gamePhase = 1;
    this.timer = this.prepTime; // 10 seconds
};

Duels.prototype.startGame = function (gameServer) {
    gameServer.run = true;
    this.gamePhase = 2;
    this.getSpectate(); // Gets a random person to spectate
};

Duels.prototype.endGame = function (gameServer) {
    this.winner = this.contenders[0];
    this.gamePhase = 3;
    this.timer = this.endTime; // 30 Seconds
};

Duels.prototype.endGameTimeout = function (gameServer) {
    gameServer.run = false;
    this.gamePhase = 4;
    this.timer = this.endTime; // 30 Seconds
};

Duels.prototype.fillBots = function (gameServer) {
    // Fills the server with bots if there arent enough players
    var fill = this.maxContenders - this.contenders.length;
    for (var i = 0; i < fill; i++) {
        gameServer.bots.addBot();
    }
};

Duels.prototype.getSpectate = function () {
    // Finds a random person to spectate
    var index = Math.floor(Math.random() * this.contenders.length);
    this.rankOne = this.contenders[index];
};

Duels.prototype.prepare = function (gameServer) {
    // Remove all cells
    var len = gameServer.nodes.length;
    for (var i = 0; i < len; i++) {
        var node = gameServer.nodes[0];
        
        if (!node) {
            continue;
        }
        
        gameServer.removeNode(node);
    }

    //Kick all bots for restart.
    for (var i = 0; i < gameServer.clients.length; i++) {
        if (gameServer.clients[i].isConnected != null)
            continue; // verify that the client is a bot
        gameServer.clients[i].close();
    }
    
    gameServer.bots.loadNames();
    
    // Pauses the server
    gameServer.run = false;
    this.gamePhase = 0;
    
    // Get config values
    if (gameServer.config.tourneyAutoFill > 0) {
        this.timer = gameServer.config.tourneyAutoFill;
        this.autoFill = true;
        this.autoFillPlayers = gameServer.config.tourneyAutoFillPlayers;
    }

    this.prepTime = gameServer.config.tourneyPrepTime;
    this.endTime = gameServer.config.tourneyEndTime;
    this.maxContenders = gameServer.config.tourneyMaxPlayers;
    
    // Time limit
    this.timeLimit = gameServer.config.tourneyTimeLimit * 60; // in seconds
};

Duels.prototype.onPlayerDeath = function (gameServer) {
    process.exit(0);
};

Duels.prototype.formatTime = function (time) {
    if (time < 0) {
        return "0:00";
    }
    // Format
    var min = Math.floor(this.timeLimit / 60);
    var sec = this.timeLimit % 60;
    sec = (sec > 9) ? sec : "0" + sec.toString();
    return min + ":" + sec;
};

// Override

Duels.prototype.onServerInit = function (gameServer) {
    this.prepare(gameServer);
    // Resets spawn points
    this.contenderSpawnPlayers = this.SpawnPlayers.slice();
    
};

Duels.prototype.onPlayerSpawn = function (gameServer, player) {
    // Only spawn players if the game hasnt started yet
    if ((this.gamePhase == 0) && (this.contenders.length < this.maxContenders)) {
        player.color = gameServer.getRandomColor(); // Random color
        this.contenders.push(player); // Add to contenders list
        gameServer.spawnPlayer(player, this.getPos());
        
        if (this.contenders.length == this.maxContenders) {
            // Start the game once there is enough players
            this.startGamePrep(gameServer);
        }
    }
};


Duels.prototype.onCellRemove = function (cell) {
    var owner = cell.owner,
        human_just_died = false;
    
    if (owner.cells.length <= 0) {
        // Remove from contenders list
        var index = this.contenders.indexOf(owner);
        if (index != -1) {
            if ('_socket' in this.contenders[index].socket) {
                human_just_died = true;
            }
            this.contenders.splice(index, 1);
        }
        
        // Victory conditions
        var humans = 0;
        for (var i = 0; i < this.contenders.length; i++) {
            if ('_socket' in this.contenders[i].socket) {
                humans++;
            }
        }
        
        // the game is over if:
        // 1) there is only 1 player left, OR
        // 2) all the humans are dead, OR
        // 3) the last-but-one human just died
        if ((this.contenders.length == 1 || humans == 0 || (humans == 1 && human_just_died)) && this.gamePhase == 2) {
            this.endGame(cell.owner.gameServer);
        } else {
            // Do stuff
            this.onPlayerDeath(cell.owner.gameServer);
        }
    }
};

Duels.prototype.updateLB_FFA = function (gameServer, lb) {
    gameServer.leaderboardType = 49;
    for (var i = 0, pos = 0; i < gameServer.clients.length; i++) {
        var player = gameServer.clients[i].playerTracker;
        if (player.isRemoved || !player.cells.length ||
            player.socket.isConnected == false || player.isMi)
            continue;

        for (var j = 0; j < pos; j++)
            if (lb[j]._score < player._score) break;

        lb.splice(j, 0, player);
        pos++;
    }
    this.rankOne = lb[0];
};

Duels.prototype.updateLB = function (gameServer, lb) {
    gameServer.leaderboardType = this.packetLB;
    switch (this.gamePhase) {
        case 0:
            lb[0] = "في أنتضار ألاعبين";
            lb[1] = "عدد الاعبين";
            lb[2] = this.contenders.length + "/" + this.maxContenders;
            break;
        case 1:
            lb[0] = "أللعبة تبدأ بعد";
            lb[1] = this.timer.toString();
            lb[2] = "حظأ موفقاُ!";
            if (this.timer <= 0) {
                // Reset the game
                this.startGame(gameServer);
            } else {
                this.timer--;
            }
            break;
        case 2:
            if (!this.isPlayerLb) {
                gameServer.leaderboardType = this.packetLB;
                lb[0] = "عدد الاعبين";
                lb[1] = this.contenders.length + "/" + this.maxContenders;
                lb[2] = "أعادة تشغيل أللعبة بعد";
                lb[3] = this.formatTime(this.timeLimit);
            } else {
                this.updateLB_FFA(gameServer, lb);
            }
            if (this.timeLimit < 0) {
                // Timed out
                this.endGame(gameServer);
            } else {
                if (this.timeLimit % gameServer.config.tourneyLeaderboardToggleTime == 0) {
                    this.isPlayerLb ^= true;
                }
                this.timeLimit--;
            }
            break;
        case 3:
            lb[0] = "مبروك لى";
            lb[1] = this.winner._name;
            lb[2] = "لقد فاز!";
            if (this.timer <= 0) {
                // Reset the game
                this.prepare(gameServer);
                this.endGameTimeout(gameServer);
            } else {
                lb[3] = this.timer.toString();
                this.timer--;
            }
            break;
        case 4:
            lb[0] = "أنتهى ألوقت";
            if (this.timer <= 0) {
                // Restarting the game
                process.exit(0);
            } else {
                lb[1] = "أعادة تشغيل أللعبة بعد";
                lb[2] = this.timer.toString();
                this.timer--;
            }
        default:
            break;
    }
};
