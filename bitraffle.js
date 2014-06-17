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

    var TX_PROCESS_BATCH = 20;
    var unspentOutputs = [];
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
      // Process at max TX_PROCESS_BATCH outputs
      var txToProcess = outputs.length > TX_PROCESS_BATCH ? TX_PROCESS_BATCH : outputs.length;
      for (var i = 0; i < txToProcess; i++) {
        var tx = {hash: outputs[i].tx, value: Math.round(outputs[i].amount * 1e8), tickets: []};
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
            var hashBin = sjcl.hash.sha256.hash(address + tx.hash + targetBlock.hash + targetBlock.prev_block_hash + j);
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

      // Next outputs block to process
      outputs = outputs.slice(txToProcess);

      if (outputs.length > 0) {
        setTimeout(function () { outputProcessor(outputs); }, 0);
      }
      else {
        finish();
      }
    };


    var getOutputs = function() {

      get("http://btc.blockr.io/api/v1/address/unspent/" + address, function(err, response) {
        if (err) {
          error(err);
          return;
        }

        var apiResult = JSON.parse(response);
//          console.log(apiResult);
        if (apiResult.data === undefined || apiResult.data.unspent === undefined) {
          error("Server returned incorrect data");
          return;
        }
        else if (apiResult.data.unspent.length === 0) {
          error("Address " + address + " has not received any founds yet. Try again later.");
          return;
        }

        unspentOutputs = apiResult.data.unspent;

        setTimeout(function () { outputProcessor(unspentOutputs); }, 0);
      });
    };


    // Get latest block,
    getBlocks("last,"+targetBlockHeight, function(err, blocks){
      if (err) {
        error(err);
        return;
      }

      setTimeout(function () { updateBlock({height: blocks[0].nb}); }, 0);

      // if only latest block found and target block is in the future
      if (blocks.length === 1) {
        setTimeout(function () { getOutputs(); }, 0);
      }
      else {
        targetBlock = blocks[1];
        setTimeout(function () { getOutputs(); }, 0);
      }
    });
  };

  function getBlocks(heightQuery, callback) {
    var error = function(message) {
      setTimeout(function () { callback(message); }, 0);
    };

    var requestUrl = "http://btc.blockr.io/api/v1/block/info/" + heightQuery;

    get(requestUrl, function(err, response) {
      if (err) {
        error(err);
        return;
      }

      var apiResult = JSON.parse(response);
//          console.log(apiResult);
      if (apiResult.data === undefined) {
        error("Server returned incorrect data");
        return;
      }
      else if (apiResult.data.length === 0) {
        error("Block " + height + " was not not found.");
        return;
      }

      var blocks;
      if (apiResult.data instanceof Array) {
        blocks = apiResult.data;
      } else {
        blocks = [apiResult.data]
      }

      setTimeout(function () { callback(undefined, blocks); }, 0);

    });
  }


  function get(url, callback) {
    var error = function(message) {
      setTimeout(function () { callback(message); }, 0);
    };

    var request = new XMLHttpRequest();

    request.open('GET', url, true);

    request.onload = function() {
      if (request.status >= 200 && request.status < 400){
        setTimeout(function () { callback(undefined, request.responseText); }, 0);
      } else {
        error(request.statusText === "" ? "Could not get "+ url : request.statusText);
      }
    };

    request.onerror = function() {
      error(request.statusText === "" ? "Could not get "+ url : request.statusText);
    };

    request.send();
  }

})(this);