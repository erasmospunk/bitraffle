
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
  "use strict";
  var sjcl = global.sjcl;

  global.bitraffle = {};

  global.bitraffle.run = function(targetBlockHeight, address, ticketPrice, giftEvery, callback, updateBlock, updateTxs) {

    var error = function(message) {
      setTimeout(function () { callback(message); }, 0);
    };

    var TX_PROCESS_BATCH = 20;
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

    var outputProcessor = function(outputs, isFinalBlock) {
      var processedTx = [];

      // Process at max TX_PROCESS_BATCH outputs
      var txToProcess = outputs.length > TX_PROCESS_BATCH ? TX_PROCESS_BATCH : outputs.length;
//      var txToProcess = outputs.length;

      for (var i = 0; i < txToProcess; i++) {
        var output = outputs[i];
//        console.log(output)

        // Ignore sent outputs with negative amount
        if (output.amount < 0) {
          continue;
        }


        var tx = {hash: output.tx, value: Math.round(output.amount * 1e8), totalTickets: 0, tickets: []};
        processedTx.push(tx);

        var totalTickets = Math.floor(tx.value / ticketPrice);

        if (giftEvery > 0) {
          totalTickets += Math.floor(totalTickets / giftEvery);
        }

        tx.totalTickets = totalTickets;

        if (totalTickets > 0 && targetBlock) {
          // Create ticket hashes
          for (var j=0; j < totalTickets; j++) {
            var ticketHash;

            // Different ticket hash for the same transaction based on j nonce
            var hashBin = sjcl.hash.sha256.hash(tx.hash + targetBlock.hash + j);
            ticketHash = sjcl.codec.hex.fromBits(hashBin);

            tx.tickets.push(ticketHash);
            ticketsIndex[ticketHash] = tx;
            ticketsList.push(ticketHash);
          }
        }
      }

      if (updateTxs !== undefined) {
        setTimeout(function () { updateTxs(processedTx); }, 0);
      }

      // Next outputs block to process
      var outputsLeft = outputs.slice(txToProcess);

      if (outputsLeft.length > 0) {
        setTimeout(function () { outputProcessor(outputsLeft, isFinalBlock); }, 0);
      }
      else if (isFinalBlock) {
        finish();
      }
    };


    var getOutputs = function(fromTx) {
      var apiUrl = "http://btc.blockr.io/api/v1/address/txs/" + address;

      if (fromTx) {
        apiUrl += "?from_tx=" + fromTx;
      }

      get(apiUrl, function(err, response) {
        if (err) {
          error(err);
          return;
        }

        var apiResult = JSON.parse(response);
        if (apiResult.data === undefined || apiResult.data.txs === undefined) {
          error("Server returned incorrect data. Request URL: " + apiUrl);
          return;
        }

        var txs = apiResult.data.txs;
        var data = apiResult.data;
        var isFinalPage = true;

        // Check if there are more transactions
        if (data.limit_txs === data.nb_txs_displayed &&
            data.nb_txs > data.limit_txs) {
          isFinalPage = false;
          var lastTxHash = txs[txs.length - 1].tx;
          setTimeout(function () { getOutputs(lastTxHash); }, 0);
        }
        setTimeout(function () { outputProcessor(txs, isFinalPage); }, 0);
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
        error("Server returned incorrect data. Request URL: " + requestUrl);
        return;
      }
      else if (apiResult.data.length === 0) {
        error("Block " + heightQuery + " was not not found. Request URL: " + requestUrl);
        return;
      }

      var blocks;
      if (apiResult.data instanceof Array) {
        blocks = apiResult.data;
      } else {
        blocks = [apiResult.data];
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