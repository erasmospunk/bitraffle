/**
 * BitRaffle a Bitcoin based Raffle or Lottery. Works currently in browser only.
 *
 * Use like this:
 *
 * bitraffle(315000, 0, 1000, function(err, result) {
 *   if (err) {
 *     console.error(err);
 *     return;
 *   }
 *
 *   console.log(result);
 * });
 */

(function (global) {
  global.bitraffle = {};

  global.bitraffle.run = function(targetBlockHeight, address, ticketPrice, callback, updateBlock, updateTxs) {

    var error = function(message) {
      setTimeout(function () { callback(message); }, 0);
    };

    var unspentOutputs = [];
    var txApiQueryUrl = "https://api.biteasy.com/blockchain/v1/addresses/"+address+"/unspent-outputs?per_page=40";

    var ticketsList = [];
    var ticketsIndex = {};
    var targetBlock;

    var finish = function() {
      if (targetBlock) {
        ticketsList.sort();
        var winner = ticketsList[0];
  //      console.log(ticketsList);
        setTimeout(function () { callback(undefined, {tx: ticketsIndex[winner], winner: winner}); }, 0);
      }
      else {
        setTimeout(function () { callback(undefined, {tx: null, winner: null}); }, 0);
      }
    };

    var outputProcessor = function(outputs) {
      var processedTx = [];
      for (var i=0; i<outputs.length; i++) {
        var tx = {hash: outputs[i].transaction_hash, value: outputs[i].value, tickets: []};
        processedTx.push(tx);

//        console.log(output)
        var tickets = Math.floor(tx.value / ticketPrice);
        if (tickets === 0) {
//            console.debug(tx.hash + " transaction too small to buy a ticket: " + tx.value);
          continue;
        }

        // Create ticket hashes
        for (var j=0; j < tickets; j++) {
          var ticketHash;
          if (targetBlock) {
            // Different ticket hash for the same transaction based on j nonce
            var hashBin = sjcl.hash.sha256.hash(address + tx.hash + targetBlock.hash + targetBlock.previous_block + j);
            ticketHash = sjcl.codec.hex.fromBits(hashBin);
          }
          else {
            // target block is not know yet
            ticketHash = "";
          }
          tx.tickets.push(ticketHash);
          ticketsIndex[ticketHash] = tx;
          ticketsList.push(ticketHash);
        }
      }

      if (updateTxs !== undefined) {
        setTimeout(function () { updateTxs(processedTx); }, 0);
      }
    };


    var getOutputs = function(page, outputs) {
      var requestUrl = txApiQueryUrl + "&page="+page;
      var request = new XMLHttpRequest();

      request.open('GET', requestUrl, true);

      request.onload = function() {
        if (request.status >= 200 && request.status < 400){
          var apiResult = JSON.parse(request.responseText);
//          console.log(apiResult);
          if (apiResult.data === undefined || apiResult.data.outputs === undefined) {
            error("Server returned incorrect data");
            return;
          }
          else if (apiResult.data.outputs.length === 0 && outputs.length === 0) {
            error("Address " + address + " has not received any founds yet. Try again later.");
            return;
          }

          outputs = outputs.concat(apiResult.data.outputs);

          setTimeout(function () { outputProcessor(apiResult.data.outputs); }, 0);

          if (apiResult.data.pagination.next_page === false) {
            setTimeout(function () { finish(); }, 0);
          }
          else {
            // process next page, maximum query 4 times per second
            setTimeout(function () { getOutputs(apiResult.data.pagination.next_page, outputs); }, 250);
          }
        } else {
          error(request.statusText === "" ? "Could not get "+ requestUrl : request.statusText);
        }
      };

      request.onerror = function() {
        error(request.statusText === "" ? "Could not get "+ requestUrl : request.statusText);
      };

      request.send();
    };


    // Get latest block,
    global.bitraffle.getBlock(-1, function(err, latestBlock){
      if (err) {
        error(err);
        return;
      }

      setTimeout(function () { updateBlock(latestBlock); }, 0);

      // if target block is in the future
      if (latestBlock.height < targetBlockHeight) {
        setTimeout(function () { getOutputs(1, unspentOutputs); }, 250); // 4 queries/s
      }
      else {
        global.bitraffle.getBlock(targetBlockHeight, function(err, block){
          if (err) {
            error(err);
            return;
          }

          targetBlock = block;
          // start querying
          setTimeout(function () { getOutputs(1, unspentOutputs); }, 250); // 4 queries/s
        });
      }
    });



  };

  global.bitraffle.getBlock = function(height, callback) {
    var error = function(message) {
      setTimeout(function () { callback(message); }, 0);
    };

    var requestUrl = "https://api.biteasy.com/blockchain/v1/blocks?per_page=1";

    if (height >= 0) {
      requestUrl += "&height=" + height;
    }

    var request = new XMLHttpRequest();

    request.open('GET', requestUrl, true);

    request.onload = function() {
      if (request.status >= 200 && request.status < 400){
        var apiResult = JSON.parse(request.responseText);
//          console.log(apiResult);
        if (apiResult.data === undefined || apiResult.data.blocks === undefined) {
          error("Server returned incorrect data");
          return;
        }
        else if (apiResult.data.blocks.length === 0) {
          error("Block " + height + " was not not found.");
          return;
        }

        setTimeout(function () { callback(undefined, apiResult.data.blocks[0]); }, 0);
      } else {
        error(request.statusText === "" ? "Could not get "+ requestUrl : request.statusText);
      }
    };

    request.onerror = function() {
      error(request.statusText === "" ? "Could not get "+ requestUrl : request.statusText);
    };

    request.send();
  }

})(this);