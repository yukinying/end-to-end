/**
 * @license
 * Copyright 2015 Yahoo Inc. All rights reserved.
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

/**
 * @fileoverview coname client.
 */

goog.provide('e2e.coname.Client');

goog.require('e2e.ext.config');
goog.require('e2e.coname.verifyLookup');

goog.require('goog.format.EmailAddress');
goog.require('goog.net.jsloader');



/**
 * Constructor for the coname client.
 * @constructor
 */
e2e.coname.Client = function() {
  /**
   * @type {?{LookupRequest: Function}}
   */
  this.proto = null;

  /**
   * @private {boolean}
   */
  this.initialized_ = false;
};


/**
 * Initializes the external protobuf dependency.
 * @param {function()} callback The function to call when protobuf is loaded.
 * @param {function()} errback The error callback.
 */
e2e.coname.Client.prototype.initialize = function(callback, errback) {
  var longURL = chrome.runtime.getURL('long.min.js');
  var bbURL = chrome.runtime.getURL('bytebuffer.min.js');
  var pbURL = chrome.runtime.getURL('protobuf-light.min.js');
  var clientProtoURL = chrome.runtime.getURL('coname-client.proto.json');

  if (window.dcodeIO && window.dcodeIO.ByteBuffer && window.dcodeIO.ProtoBuf) {
    this.initialized_ = true;
    callback.call(this);
    return;
  }

  // XXX: jsloader has spurious timeout errors, so set it to 0 for no timeout.
  // Load long.js for int64 support.
  goog.net.jsloader.load(longURL, {timeout: 0}).addCallback(function() {
    if (window.dcodeIO && window.dcodeIO.Long) {
      // Load the ByteBuffer dependency for ProtoBuf
      goog.net.jsloader.load(bbURL, {timeout: 0}).addCallback(function() {
        if (window.dcodeIO && window.dcodeIO.ByteBuffer) {
          // Load ProtoBuf
          goog.net.jsloader.load(pbURL, {timeout: 0}).addCallback(function() {
            if (window.dcodeIO && window.dcodeIO.ProtoBuf) {
              // Success
              this.initialized_ = true;
              this.proto = window.dcodeIO.ProtoBuf.loadJsonFile(
                               clientProtoURL).build('proto');
              callback.call(this);
            } else {
              return new Error('Missing protobuf!');
            }
          }, this).addErrback(errback, this);
        } else {
          return new Error('Missing bytebuffer!');
        }
      }, this).addErrback(errback, this);
    } else {
      return new Error('Missing long!');
    }
  }, this).addErrback(errback, this);
};


/**
 * Decodes the base64 encoded message, and append it as an encoding property
 * @param {string} userid The email to look up.
 * @return {ArrayBuffer}
 */
e2e.coname.Client.base64ToByteArray_ = function(string) {
    string = atob(string);
    for (var i = 0, n = string.length, ret = []; i < n; i++) {
        ret[i] = string.charCodeAt(i);
    }
    return ret;
};


/**
 * Decode and parse a lookup message.
 * @param {object} lookupProof The request to decode.
 */
e2e.coname.Client.prototype.decodeLookupMessage_ = function(lookupProof) {
  var self = this, base64ToByteArray = e2e.coname.Client.base64ToByteArray_;

  lookupProof.index = base64ToByteArray(lookupProof.index);
  lookupProof.index_proof = base64ToByteArray(lookupProof.index_proof);
  lookupProof.tree_proof.neighbors = goog.array.map(
                                      lookupProof.tree_proof.neighbors, 
                                      function(n){return base64ToByteArray(n);}
                                    );
  lookupProof.tree_proof.existing_index = base64ToByteArray(
    lookupProof.tree_proof.existing_index);
  lookupProof.tree_proof.existing_entry_hash = base64ToByteArray(
    lookupProof.tree_proof.existing_entry_hash);

  goog.array.forEach(lookupProof.ratifications, function(ratification){
    var id,
        encoding = base64ToByteArray(ratification.head),
        head = self.proto.TimestampedEpochHead.decode(encoding);

    ratification.head = {
      head: head.head,
      encoding: encoding
    };

    for (id in ratification.signatures) {
      ratification.signatures[id] = base64ToByteArray(ratification.signatures[id]);
    }
  });

  var entry = base64ToByteArray(lookupProof.entry);
  lookupProof.entry = self.proto.Entry.decode(entry);
  lookupProof.entry.encoding = entry;

  var profile = base64ToByteArray(lookupProof.profile);
  lookupProof.profile = self.proto.Profile.decode(profile);
  lookupProof.profile.encoding = profile;
};


/**
 * Builds and encodes a lookup request.
 * @param {string} email The email address to look up.
 * @return {ArrayBuffer}
 */
e2e.coname.Client.prototype.lookup = function(email, callback, errback) {

  // normalize the email address
  email = email.toLowerCase();
  if (!goog.format.EmailAddress.isValidAddrSpec(email)) {
    throw new e2e.error.InvalidArgumentsError(
        'KeyLookup: the email address is invalid.');
  }

  var url = 'http://alpha.coname.corp.yahoo.com:25519/lookup';

  var xhr = new XMLHttpRequest();
  xhr.timeout = 1000;
  xhr.open('POST', url, true);
  xhr.setRequestHeader('Content-Type', 'application/json');
  
  xhr.onreadystatechange = function() {
    var lookupProof;
    if (xhr.readyState === 4) {
      if (xhr.status === 200) {
        lookupProof = JSON.parse(xhr.responseText);

        this.decodeLookupMessage_(lookupProof);

        if (e2e.coname.verifyLookup(e2e.ext.config.CONAME, userid, lookupProof)) {
          callback(lookupProof.keys.map);
          return;
        }
      }
      errback();
    }
  }.bind(this);

  xhr.send(JSON.stringify({
    epoch: 0,
    user_id: email,
    quorum_requirement: {
      threshold: 3,
      subexpressions: [
        {threshold: 1, candidates: ["5004056709842995553"]},
        {threshold: 1, candidates: ["16574727844889599213"]},
        {threshold: 1, candidates: ["1702327623518731708"]}
      ]
  }));

};

