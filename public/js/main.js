(function e(t,n,r){function s(o,u){if(!n[o]){if(!t[o]){var a=typeof require=="function"&&require;if(!u&&a)return a(o,!0);if(i)return i(o,!0);var f=new Error("Cannot find module '"+o+"'");throw f.code="MODULE_NOT_FOUND",f}var l=n[o]={exports:{}};t[o][0].call(l.exports,function(e){var n=t[o][1][e];return s(n?n:e)},l,l.exports,e,t,n,r)}return n[o].exports}var i=typeof require=="function"&&require;for(var o=0;o<r.length;o++)s(r[o]);return s})({1:[function(require,module,exports){
module.exports={
  "name": "SpeechToTextBrowserStarterApp",
  "version": "0.2.1",
  "description": "A sample browser app for Bluemix that use the speech-to-text service, fetching a token via Node.js",
  "dependencies": {
    "body-parser": "~1.10.2",
    "connect": "^3.3.5",
    "errorhandler": "~1.2.4",
    "express": "~4.10.8",
    "harmon": "^1.3.1",
    "http-proxy": "^1.11.1",
    "request": "~2.53.0",
    "transformer-proxy": "^0.3.1"
  },
  "engines": {
    "node": ">=0.10"
  },
  "repository": {
    "type": "git",
    "url": "https://github.com/watson-developer-cloud/speech-to-text-browser.git"
  },
  "author": "IBM Corp.",
  "browserify-shim": {
    "jquery": "global:jQuery"
  },
  "browserify": {
    "transform": [
      "browserify-shim"
    ]
  },
  "contributors": [
    {
      "name": "German Attanasio Ruiz",
      "email": "germanatt@us.ibm.com"
    },
    {
      "name": "Daniel Bolano",
      "email": "dbolano@us.ibm.com"
    },
    {
      "name": "Britany L. Ponvelle",
      "email": "blponvelle@us.ibm.com"
    },
    {
      "name": "Eric S. Bullington",
      "email": "esbullin@us.ibm.com"
    }
  ],
  "license": "Apache-2.0",
  "bugs": {
    "url": "https://github.com/watson-developer-cloud/speech-to-text-browser/issues"
  },
  "scripts": {
    "start": "node app.js",
    "build": "browserify -o public/js/main.js src/index.js",
    "watch": "watchify -v -d -o public/js/main.js src/index.js"
  },
  "devDependencies": {
    "browserify": "^10.2.4",
    "browserify-shim": "^3.8.9",
    "watchify": "^3.2.3"
  }
}

},{}],2:[function(require,module,exports){
/**
 * Copyright 2014 IBM Corp. All Rights Reserved.
 *
 * Licensed under the Apache License, Version 2.0 (the 'License');
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an 'AS IS' BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

'use strict';

var utils = require('./utils');
/**
 * Captures microphone input from the browser.
 * Works at least on latest versions of Firefox and Chrome
 */
function Microphone(_options) {
  var options = _options || {};

  // we record in mono because the speech recognition service
  // does not support stereo.
  this.bufferSize = options.bufferSize || 8192;
  this.inputChannels = options.inputChannels || 1;
  this.outputChannels = options.outputChannels || 1;
  this.recording = false;
  this.requestedAccess = false;
  this.sampleRate = 16000;
  // auxiliar buffer to keep unused samples (used when doing downsampling)
  this.unusedSamples = new Float32Array(0);

  // Chrome or Firefox or IE User media
  if (!navigator.getUserMedia) {
    navigator.getUserMedia = navigator.webkitGetUserMedia ||
    navigator.mozGetUserMedia || navigator.msGetUserMedia;
  }

}

/**
 * Called when the user reject the use of the michrophone
 * @param  error The error
 */
Microphone.prototype.onPermissionRejected = function() {
  console.log('Microphone.onPermissionRejected()');
  this.requestedAccess = false;
  this.onError('Permission to access the microphone rejeted.');
};

Microphone.prototype.onError = function(error) {
  console.log('Microphone.onError():', error);
};


var downsampleBuffer = function (buffer, sampleRate, outSampleRate) {
    if (outSampleRate == sampleRate) {
        return buffer;
    }
    if (outSampleRate > sampleRate) {
        throw "downsampling rate show be smaller than original sample rate";
    }
    var sampleRateRatio = sampleRate / outSampleRate;
    var newLength = Math.round(buffer.length / sampleRateRatio);
    var result = new Int16Array(newLength);
    var offsetResult = 0;
    var offsetBuffer = 0;
    while (offsetResult < result.length) {
        var nextOffsetBuffer = Math.round((offsetResult + 1) * sampleRateRatio);
        var accum = 0, count = 0;
        for (var i = offsetBuffer; i < nextOffsetBuffer && i < buffer.length; i++) {
            accum += buffer[i];
            count++;
        }

        result[offsetResult] = Math.min(1, accum / count)*0x7FFF;
        offsetResult++;
        offsetBuffer = nextOffsetBuffer;
    }
    return result.buffer;
}

var downsampleTwo = function(bufferNewSamples, sampleRate) {
  var newTotalLength = this.unusedSamples.length + bufferNewSamples.length;
  var newArrayBuffer = new Float32Array(newTotalLength);
  for (var i = 0; i < this.unusedSamples.length; i++) {
    newArrayBuffer[i] = this.unusedSamples[i];
  }
  for (var j = 0; j < bufferNewSamples.length; j++) {
    newArrayBuffer[j + this.unusedSamples.length] = bufferNewSamples[j];
  }
  this.unusedSamples = newArrayBuffer;
  var buffer = null,
    newSamples = bufferNewSamples.length,
    // unusedSamples = this.bufferUnusedSamples.length;

  // if (unusedSamples > 0) {
  //   buffer = new Float32Array(newSamples);
  //   for (var i = 0; i < unusedSamples; ++i) {
  //     buffer[i] = this.bufferUnusedSamples[i];
  //   }
  //   for (i = 0; i < newSamples; ++i) {
  //     buffer[unusedSamples + i] = bufferNewSamples[i];
  //   }
  // } else {
  //   buffer = bufferNewSamples;
  // }
  buffer = bufferNewSamples;

  // downsampling variables
  var filter = [
      -0.037935, -0.00089024, 0.040173, 0.019989, 0.0047792, -0.058675, -0.056487,
      -0.0040653, 0.14527, 0.26927, 0.33913, 0.26927, 0.14527, -0.0040653, -0.056487,
      -0.058675, 0.0047792, 0.019989, 0.040173, -0.00089024, -0.037935
    ],
    samplingRateRatio = sampleRate / 16000,
    nOutputSamples = Math.floor((buffer.length - filter.length) / (samplingRateRatio)) + 1,
    pcmEncodedBuffer16k = new ArrayBuffer(nOutputSamples * 2),
    dataView16k = new DataView(pcmEncodedBuffer16k),
    index = 0,
    volume = 0x7FFF, //range from 0 to 0x7FFF to control the volume
    nOut = 0;

  for (var i = 0; i + filter.length - 1 < buffer.length; i = Math.round(samplingRateRatio * nOut)) {
    var sample = 0;
    for (var j = 0; j < filter.length; ++j) {
      sample += buffer[i + j] * filter[j];
    }
    sample *= volume;
    dataView16k.setInt16(index, sample, true); // 'true' -> means little endian
    index += 2;
    nOut++;
  }

  // var indexSampleAfterLastUsed = Math.round(samplingRateRatio * nOut);
  // var remaining = buffer.length - indexSampleAfterLastUsed;
  // if (remaining > 0) {
  //   this.bufferUnusedSamples = new Float32Array(remaining);
  //   for (i = 0; i < remaining; ++i) {
  //     this.bufferUnusedSamples[i] = buffer[indexSampleAfterLastUsed + i];
  //   }
  // } else {
  //   this.bufferUnusedSamples = new Float32Array(0);
  // }

  return new Blob([dataView16k], {
    type: 'audio/l16'
  });
}

/**
 * Called when the user authorizes the use of the microphone.
 * @param  {Object} stream The Stream to connect to
 *
 */
Microphone.prototype.onMediaStream =  function(stream) {
  var AudioCtx = window.AudioContext || window.webkitAudioContext;

  if (!AudioCtx)
    throw new Error('AudioContext not available');

  if (!this.audioContext)
    this.audioContext = new AudioCtx();

  var gain = this.audioContext.createGain();
  var audioInput = this.audioContext.createMediaStreamSource(stream);

  audioInput.connect(gain);

  this.mic = this.audioContext.createScriptProcessor(this.bufferSize,
    this.inputChannels, this.outputChannels);

  // uncomment the following line if you want to use your microphone sample rate
  //this.sampleRate = this.audioContext.sampleRate;
  console.log('Microphone.onMediaStream(): sampling rate is:', this.sampleRate);

  this.mic.onaudioprocess = this._onaudioprocess.bind(this);
  this.stream = stream;

  gain.connect(this.mic);
  this.mic.connect(this.audioContext.destination);
  this.recording = true;
  this.requestedAccess = false;
  this.onStartRecording();
};

/**
 * callback that is being used by the microphone
 * to send audio chunks.
 * @param  {object} data audio
 */
Microphone.prototype._onaudioprocess = function(data) {
  if (!this.recording) {
    // We speak but we are not recording
    return;
  }

  // Single channel
  var chan = data.inputBuffer.getChannelData(0);

  this.onAudio(this._exportDataBufferTo16Khz(new Float32Array(chan)));
  // Other downsampling experiments
  // var self = this;
  // var downSampled = downsampleBuffer(chan, 44100, 16000);
  // var sampleRate = this.audioContext.sampleRate;
  // var downSampled = downsampleTwo(new Float32Array(chan), sampleRate);
  // this.onAudio(downSampled);

};

/**
 * Start the audio recording
 */
Microphone.prototype.record = function() {
  if (!navigator.getUserMedia){
    this.onError('Browser doesn\'t support microphone input');
    return;
  }
  if (this.requestedAccess) {
    return;
  }

  this.requestedAccess = true;
  navigator.getUserMedia({ audio: true },
    this.onMediaStream.bind(this), // Microphone permission granted
    this.onPermissionRejected.bind(this)); // Microphone permission rejected
};

function floatTo16BitPCM(output, offset, input){
  for (var i = 0; i < input.length; i++, offset+=2){
    var s = Math.max(-1, Math.min(1, input[i]));
    output.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7FFF, true);
  }
}

function writeString(view, offset, string){
  for (var i = 0; i < string.length; i++){
    view.setUint8(offset + i, string.charCodeAt(i));
  }
}

function encodeWAV(samples){
  var numChannels = 1;
  var sampleRate = 44100;
  var buffer = new ArrayBuffer(44 + samples.length * 2);
  var view = new DataView(buffer);

  /* RIFF identifier */
  writeString(view, 0, 'RIFF');
  /* RIFF chunk length */
  view.setUint32(4, 36 + samples.length * 2, true);
  /* RIFF type */
  writeString(view, 8, 'WAVE');
  /* format chunk identifier */
  writeString(view, 12, 'fmt ');
  /* format chunk length */
  view.setUint32(16, 16, true);
  /* sample format (raw) */
  view.setUint16(20, 1, true);
  /* channel count */
  view.setUint16(22, numChannels, true);
  /* sample rate */
  view.setUint32(24, sampleRate, true);
  /* byte rate (sample rate * block align) */
  view.setUint32(28, sampleRate * 4, true);
  /* block align (channel count * bytes per sample) */
  view.setUint16(32, numChannels * 2, true);
  /* bits per sample */
  view.setUint16(34, 16, true);
  /* data chunk identifier */
  writeString(view, 36, 'data');
  /* data chunk length */
  view.setUint32(40, samples.length * 2, true);

  floatTo16BitPCM(view, 44, samples);

  return view;
}
/**
 * Stop the audio recording
 */
Microphone.prototype.stop = function() {
  if (!this.recording)
    return;
  this.recording = false;
  this.stream.stop();
  this.requestedAccess = false;
  this.mic.disconnect(0);
  this.mic = null;
  this.onStopRecording();

  var view = encodeWAV(this.unusedSamples);

  // our final binary blob that we can hand off
  var blob = new Blob ( [ view ], { type : 'audio/wav' } );
  var audio = new Audio();
  var objectURL = URL.createObjectURL(blob);
  audio.src = objectURL;
  audio.addEventListener('error', function failed(e) {
       // audio playback failed - show a message saying why
       // to get the source of the audio element use $(this).src
       switch (e.target.error.code) {
         case e.target.error.MEDIA_ERR_ABORTED:
           console.log('You aborted the video playback.');
           break;
         case e.target.error.MEDIA_ERR_NETWORK:
           console.log('A network error caused the audio download to fail.');
           break;
         case e.target.error.MEDIA_ERR_DECODE:
           console.log('The audio playback was aborted due to a corruption problem or because the video used features your browser did not support.');
           break;
         case e.target.error.MEDIA_ERR_SRC_NOT_SUPPORTED:
           console.log('The video audio not be loaded, either because the server or network failed or because the format is not supported.');
           break;
         default:
           console.log('An unknown error occurred.');
           break;
       }
     }, true);
  audio.play();
  console.log('FINAL COUNT', this.unusedSamples.length);
};

/**
 * Creates a Blob type: 'audio/l16' with the chunk and downsampling to 16 kHz
 * coming from the microphone.
 * Explanation for the math: The raw values captured from the Web Audio API are
 * in 32-bit Floating Point, between -1 and 1 (per the specification).
 * The values for 16-bit PCM range between -32768 and +32767 (16-bit signed integer).
 * Multiply to control the volume of the output. We store in little endian.
 * @param  {Object} buffer Microphone audio chunk
 * @return {Blob} 'audio/l16' chunk
 * @deprecated This method is depracated
 */
Microphone.prototype._exportDataBufferTo16Khz = function(bufferNewSamples) {
  var newTotalLength = this.unusedSamples.length + bufferNewSamples.length;
  var newArrayBuffer = new Float32Array(newTotalLength);
  for (var i = 0; i < this.unusedSamples.length; i++) {
    newArrayBuffer[i] = this.unusedSamples[i];
  }
  for (var j = 0; j < bufferNewSamples.length; j++) {
    newArrayBuffer[j + this.unusedSamples.length] = bufferNewSamples[j];
  }
  this.unusedSamples = newArrayBuffer;
  var buffer = null,
    newSamples = bufferNewSamples.length,
    // unusedSamples = this.bufferUnusedSamples.length;

  // if (unusedSamples > 0) {
  //   buffer = new Float32Array(newSamples);
  //   for (var i = 0; i < unusedSamples; ++i) {
  //     buffer[i] = this.bufferUnusedSamples[i];
  //   }
  //   for (i = 0; i < newSamples; ++i) {
  //     buffer[unusedSamples + i] = bufferNewSamples[i];
  //   }
  // } else {
  //   buffer = bufferNewSamples;
  // }
  buffer = bufferNewSamples;

  // downsampling variables
  var filter = [
      -0.037935, -0.00089024, 0.040173, 0.019989, 0.0047792, -0.058675, -0.056487,
      -0.0040653, 0.14527, 0.26927, 0.33913, 0.26927, 0.14527, -0.0040653, -0.056487,
      -0.058675, 0.0047792, 0.019989, 0.040173, -0.00089024, -0.037935
    ],
    samplingRateRatio = this.audioContext.sampleRate / 16000,
    nOutputSamples = Math.floor((buffer.length - filter.length) / (samplingRateRatio)) + 1,
    pcmEncodedBuffer16k = new ArrayBuffer(nOutputSamples * 2),
    dataView16k = new DataView(pcmEncodedBuffer16k),
    index = 0,
    volume = 0x7FFF, //range from 0 to 0x7FFF to control the volume
    nOut = 0;

  for (var i = 0; i + filter.length - 1 < buffer.length; i = Math.round(samplingRateRatio * nOut)) {
    var sample = 0;
    for (var j = 0; j < filter.length; ++j) {
      sample += buffer[i + j] * filter[j];
    }
    sample *= volume;
    dataView16k.setInt16(index, sample, true); // 'true' -> means little endian
    index += 2;
    nOut++;
  }

  // var indexSampleAfterLastUsed = Math.round(samplingRateRatio * nOut);
  // var remaining = buffer.length - indexSampleAfterLastUsed;
  // if (remaining > 0) {
  //   this.bufferUnusedSamples = new Float32Array(remaining);
  //   for (i = 0; i < remaining; ++i) {
  //     this.bufferUnusedSamples[i] = buffer[indexSampleAfterLastUsed + i];
  //   }
  // } else {
  //   this.bufferUnusedSamples = new Float32Array(0);
  // }

  return new Blob([dataView16k], {
    type: 'audio/l16'
  });
  };

/**
 * Creates a Blob type: 'audio/l16' with the
 * chunk coming from the microphone.
 */
var exportDataBuffer = function(buffer, bufferSize) {
  var pcmEncodedBuffer = null,
    dataView = null,
    index = 0,
    volume = 0x7FFF; //range from 0 to 0x7FFF to control the volume

  pcmEncodedBuffer = new ArrayBuffer(bufferSize * 2);
  dataView = new DataView(pcmEncodedBuffer);

  /* Explanation for the math: The raw values captured from the Web Audio API are
   * in 32-bit Floating Point, between -1 and 1 (per the specification).
   * The values for 16-bit PCM range between -32768 and +32767 (16-bit signed integer).
   * Multiply to control the volume of the output. We store in little endian.
   */
  for (var i = 0; i < buffer.length; i++) {
    dataView.setInt16(index, buffer[i] * volume, true);
    index += 2;
  }

  // l16 is the MIME type for 16-bit PCM
  return new Blob([dataView], { type: 'audio/l16' });
};

Microphone.prototype._exportDataBuffer = function(buffer){
  utils.exportDataBuffer(buffer, this.bufferSize);
}; 


// Functions used to control Microphone events listeners.
Microphone.prototype.onStartRecording =  function() {};
Microphone.prototype.onStopRecording =  function() {};
Microphone.prototype.onAudio =  function() {};

module.exports = Microphone;
},{"./utils":7}],3:[function(require,module,exports){
module.exports={
   "models": [
      {
         "url": "https://stream.watsonplatform.net/speech-to-text/api/v1/models/en-US_BroadbandModel", 
         "rate": 16000, 
         "name": "en-US_BroadbandModel", 
         "language": "en-US", 
         "description": "US English broadband model (16KHz)"
      }, 
      {
         "url": "https://stream.watsonplatform.net/speech-to-text/api/v1/models/en-US_NarrowbandModel", 
         "rate": 8000, 
         "name": "en-US_NarrowbandModel", 
         "language": "en-US", 
         "description": "US English narrowband model (8KHz)"
      },
      {
         "url": "https://stream.watsonplatform.net/speech-to-text/api/v1/models/es-ES_BroadbandModel", 
         "rate": 16000, 
         "name": "es-ES_BroadbandModel", 
         "language": "es-ES", 
         "description": "Spanish broadband model (16KHz)"
      }, 
      {
         "url": "https://stream.watsonplatform.net/speech-to-text/api/v1/models/es-ES_NarrowbandModel", 
         "rate": 8000, 
         "name": "es-ES_NarrowbandModel", 
         "language": "es-ES", 
         "description": "Spanish narrowband model (8KHz)"
      }, 
      {
         "url": "https://stream.watsonplatform.net/speech-to-text/api/v1/models/ja-JP_BroadbandModel", 
         "rate": 16000, 
         "name": "ja-JP_BroadbandModel", 
         "language": "ja-JP", 
         "description": "Japanese broadband model (16KHz)"
      }, 
      {
         "url": "https://stream.watsonplatform.net/speech-to-text/api/v1/models/ja-JP_NarrowbandModel", 
         "rate": 8000, 
         "name": "ja-JP_NarrowbandModel", 
         "language": "ja-JP", 
         "description": "Japanese narrowband model (8KHz)"
      }
   ]
}

},{}],4:[function(require,module,exports){

var effects = require('./views/effects');
var display = require('./views/displaymetadata');
var hideError = require('./views/showerror').hideError;
var initSocket = require('./socket').initSocket;

exports.handleFileUpload = function(token, model, file, contentType, callback, onend) {

    // Set currentlyDisplaying to prevent other sockets from opening
    localStorage.setItem('currentlyDisplaying', true);

    // $('#progressIndicator').css('visibility', 'visible');

    $.subscribe('progress', function(evt, data) {
      console.log('progress: ', data);
    });

    console.log('contentType', contentType);

    var baseString = '';
    var baseJSON = '';

    var options = {};
    options.token = token;
    options.message = {
      'action': 'start',
      'content-type': contentType,
      'interim_results': true,
      'continuous': true,
      'word_confidence': true,
      'timestamps': true,
      'max_alternatives': 3
    };
    options.model = model;

    function onOpen(socket) {
      console.log('Socket opened');
    }

    function onListening(socket) {
      console.log('Socket listening');
      callback(socket);
    }

    function onMessage(msg) {
      if (msg.results) {
        // Convert to closure approach
        baseString = display.showResult(msg, baseString);
        baseJSON = display.showJSON(msg, baseJSON);
      }
    }

    function onError(evt) {
      localStorage.setItem('currentlyDisplaying', false);
      onend(evt);
      console.log('Socket err: ', evt.code);
    }

    function onClose(evt) {
      localStorage.setItem('currentlyDisplaying', false);
      onend(evt);
      console.log('Socket closing: ', evt);
    }

    initSocket(options, onOpen, onListening, onMessage, onError, onClose);

  }

},{"./socket":6,"./views/displaymetadata":9,"./views/effects":11,"./views/showerror":18}],5:[function(require,module,exports){

'use strict';

var initSocket = require('./socket').initSocket;
var display = require('./views/displaymetadata');

exports.handleMicrophone = function(token, model, mic, callback) {

  if (model.indexOf('Narrowband') > -1) {
    var err = new Error('Microphone transcription cannot accomodate narrowband models, please select another');
    callback(err, null);
    return false;
  }

  $.publish('clearscreen');

  // Test out websocket
  var baseString = '';
  var baseJSON = '';

  var options = {};
  options.token = token;
  options.message = {
    'action': 'start',
    'content-type': 'audio/l16;rate=16000',
    'interim_results': true,
    'continuous': true,
    'word_confidence': true,
    'timestamps': true,
    'max_alternatives': 3
  };
  options.model = model;

  function onOpen(socket) {
    console.log('Mic socket: opened');
    callback(null, socket);
  }

  function onListening(socket) {

    mic.onAudio = function(blob) {
      if (socket.readyState < 2) {
        socket.send(blob)
      }
    };
  }

  function onMessage(msg, socket) {
    console.log('Mic socket msg: ', msg);
    if (msg.results) {
      // Convert to closure approach
      baseString = display.showResult(msg, baseString);
      baseJSON = display.showJSON(msg, baseJSON);
    }
  }

  function onError(r, socket) {
    console.log('Mic socket err: ', err);
  }

  function onClose(evt) {
    console.log('Mic socket close: ', evt);
  }

  initSocket(options, onOpen, onListening, onMessage, onError, onClose);

}

},{"./socket":6,"./views/displaymetadata":9}],6:[function(require,module,exports){
/**
 * Copyright 2014 IBM Corp. All Rights Reserved.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
/*global $:false */


var utils = require('./utils');
var Microphone = require('./Microphone');
var showerror = require('./views/showerror');
var showError = showerror.showError;
var hideError = showerror.hideError;

// Mini WS callback API, so we can initialize
// with model and token in URI, plus
// start message

// Initialize closure, which holds maximum getToken call count
var tokenGenerator = utils.createTokenGenerator();

var initSocket = exports.initSocket = function(options, onopen, onlistening, onmessage, onerror, onclose) {
  var listening;
  function withDefault(val, defaultVal) {
    return typeof val === 'undefined' ? defaultVal : val;
  }
  var socket;
  var token = options.token;
  var model = options.model || localStorage.getItem('currentModel');
  var message = options.message || {'action': 'start'};
  var sessionPermissions = withDefault(options.sessionPermissions, JSON.parse(localStorage.getItem('sessionPermissions')));
  var sessionPermissionsQueryParam = sessionPermissions ? '0' : '1';
  var url = options.serviceURI || 'wss://stream.watsonplatform.net/speech-to-text/api/v1/recognize?watson-token='
    + token
    + '&X-WDC-PL-OPT-OUT=' + sessionPermissionsQueryParam
    + '&model=' + model;
  console.log('URL model', model);
  try {
    socket = new WebSocket(url);
  } catch(err) {
    console.error('WS connection error: ', err);
  }
  socket.onopen = function(evt) {
    listening = false;
    $.subscribe('hardsocketstop', function(data) {
      console.log('MICROPHONE: close.');
      socket.send(JSON.stringify({action:'stop'}));
    });
    $.subscribe('socketstop', function(data) {
      console.log('MICROPHONE: close.');
      socket.close();
    });
    socket.send(JSON.stringify(message));
    onopen(socket);
  };
  socket.onmessage = function(evt) {
    var msg = JSON.parse(evt.data);
    if (msg.error) {
      showError(msg.error);
      $.publish('hardsocketstop');
      return;
    }
    if (msg.state === 'listening') {
      // Early cut off, without notification
      if (!listening) {
        onlistening(socket);
        listening = true;
      } else {
        console.log('MICROPHONE: Closing socket.');
        socket.close();
      }
    }
    onmessage(msg, socket);
  };

  socket.onerror = function(evt) {
    console.log('WS onerror: ', evt);
    showError('Application error ' + evt.code + ': please refresh your browser and try again');
    $.publish('clearscreen');
    onerror(evt);
  };

  socket.onclose = function(evt) {
    console.log('WS onclose: ', evt);
    if (evt.code === 1006) {
      // Authentication error, try to reconnect
      console.log('generator count', tokenGenerator.getCount());
      if (tokenGenerator.getCount() > 1) {
        $.publish('hardsocketstop');
        throw new Error("No authorization token is currently available");
      }
      tokenGenerator.getToken(function(token, err) {
        if (err) {
          $.publish('hardsocketstop');
          return false;
        }
        console.log('Fetching additional token...');
        options.token = token;
        initSocket(options, onopen, onlistening, onmessage, onerror, onclose);
      });
      return false;
    }
    if (evt.code === 1011) {
      console.error('Server error ' + evt.code + ': please refresh your browser and try again');
      return false;
    }
    if (evt.code > 1000) {
      console.error('Server error ' + evt.code + ': please refresh your browser and try again');
      // showError('Server error ' + evt.code + ': please refresh your browser and try again');
      return false;
    }
    // Made it through, normal close
    $.unsubscribe('hardsocketstop');
    $.unsubscribe('socketstop');
    onclose(evt);
  };

}
},{"./Microphone":2,"./utils":7,"./views/showerror":18}],7:[function(require,module,exports){
(function (global){

// For non-view logic
var $ = (typeof window !== "undefined" ? window.jQuery : typeof global !== "undefined" ? global.jQuery : null);

var fileBlock = function(_offset, length, _file, readChunk) {
  var r = new FileReader();
  var blob = _file.slice(_offset, length + _offset);
  r.onload = readChunk;
  r.readAsArrayBuffer(blob);
}

// Based on alediaferia's SO response
// http://stackoverflow.com/questions/14438187/javascript-filereader-parsing-long-file-in-chunks
exports.onFileProgress = function(options, ondata, onerror, onend) {
  var file       = options.file;
  var fileSize   = file.size;
  var chunkSize  = options.bufferSize || 8192;
  var offset     = 0;
  var readChunk = function(evt) {
    if (offset >= fileSize) {
      console.log("Done reading file");
      onend();
      return;
    }
    if (evt.target.error == null) {
      var buffer = evt.target.result;
      var len = buffer.byteLength;
      offset += len;
      ondata(buffer); // callback for handling read chunk
    } else {
      var errorMessage = evt.target.error;
      console.log("Read error: " + errorMessage);
      onerror(errorMessage);
      return;
    }
    fileBlock(offset, chunkSize, file, readChunk);
  }
  fileBlock(offset, chunkSize, file, readChunk);
}

exports.createTokenGenerator = function() {
  // Make call to API to try and get token
  var hasBeenRunTimes = 0;
  return {
    getToken: function(callback) {
    ++hasBeenRunTimes;
    if (hasBeenRunTimes > 5) {
      var err = new Error('Cannot reach server');
      callback(null, err);
      return;
    }
    var url = '/token';
    var tokenRequest = new XMLHttpRequest();
    tokenRequest.open("GET", url, true);
    tokenRequest.onload = function(evt) {
      var token = tokenRequest.responseText;
      callback(token);
    };
    tokenRequest.send();
    },
    getCount: function() { return hasBeenRunTimes; }
  }
};

exports.getToken = (function() {
  // Make call to API to try and get token
  var hasBeenRunTimes = 0;
  return function(callback) {
    hasBeenRunTimes++
    if (hasBeenRunTimes > 5) {
      var err = new Error('Cannot reach server');
      callback(null, err);
      return;
    }
    var url = '/token';
    var tokenRequest = new XMLHttpRequest();
    tokenRequest.open("GET", url, true);
    tokenRequest.onload = function(evt) {
      var token = tokenRequest.responseText;
      callback(token);
    };
    tokenRequest.send();
  }
})();

exports.initPubSub = function() {
  var o         = $({});
  $.subscribe   = o.on.bind(o);
  $.unsubscribe = o.off.bind(o);
  $.publish     = o.trigger.bind(o);
}
}).call(this,typeof global !== "undefined" ? global : typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {})

},{}],8:[function(require,module,exports){


exports.initAnimatePanel = function() {
  $('.panel-heading span.clickable').on("click", function (e) {
    if ($(this).hasClass('panel-collapsed')) {
      // expand the panel
      $(this).parents('.panel').find('.panel-body').slideDown();
      $(this).removeClass('panel-collapsed');
      $(this).find('i').removeClass('caret-down').addClass('caret-up');
    }
    else {
      // collapse the panel
      $(this).parents('.panel').find('.panel-body').slideUp();
      $(this).addClass('panel-collapsed');
      $(this).find('i').removeClass('caret-up').addClass('caret-down');
    }
  });
}


},{}],9:[function(require,module,exports){
(function (global){
'use strict';

var $ = (typeof window !== "undefined" ? window.jQuery : typeof global !== "undefined" ? global.jQuery : null);
var scrolled = false;

var showTimestamp = function(timestamps, confidences) {
  var word = timestamps[0],
      t0 = timestamps[1],
      t1 = timestamps[2];
  var timelength = t1 - t0;
  // Show confidence if defined, else 'n/a'
  var displayConfidence = confidences ? confidences[1].toString().substring(0, 3) : 'n/a';
  $('#metadataTable > tbody:last-child').append(
      '<tr>'
      + '<td>' + word + '</td>'
      + '<td>' + t0 + '</td>'
      + '<td>' + t1 + '</td>'
      + '<td>' + displayConfidence + '</td>'
      + '</tr>'
      );
}


var showMetaData = function(alternative) {
  var confidenceNestedArray = alternative.word_confidence;;
  var timestampNestedArray = alternative.timestamps;
  if (confidenceNestedArray && confidenceNestedArray.length > 0) {
    for (var i = 0; i < confidenceNestedArray.length; i++) {
      var timestamps = timestampNestedArray[i];
      var confidences = confidenceNestedArray[i];
      showTimestamp(timestamps, confidences);
    }
    return;
  } else {
    if (timestampNestedArray && timestampNestedArray.length > 0) {
      timestampNestedArray.forEach(function(timestamp) {
        showTimestamp(timestamp);
      });
    }
  }
}

var Alternatives = function(){

  var stringOne = '',
    stringTwo = '',
    stringThree = '';

  this.clearString = function() {
    stringOne = '';
    stringTwo = '';
    stringThree = '';
  };

  this.showAlternatives = function(alternatives, isFinal, testing) {
    var $hypotheses = $('.hypotheses ol');
    $hypotheses.empty();
    // $hypotheses.append($('</br>'));
    alternatives.forEach(function(alternative, idx) {
      var $alternative;
      if (alternative.transcript) {
        console.log('ALTERNATIVES INDEX', idx);
        var transcript = alternative.transcript.replace(/%HESITATION\s/g, '');
        transcript = transcript.replace(/(.)\1{2,}/g, '');
        switch (idx) {
          case 0:
            stringOne = stringOne + transcript;
            $alternative = $('<li data-hypothesis-index=' + idx + ' >' + stringOne + '</li>');
            break;
          case 1:
            stringTwo = stringTwo + transcript;
            $alternative = $('<li data-hypothesis-index=' + idx + ' >' + stringTwo + '</li>');
            break;
          case 2:
            stringThree = stringThree + transcript;
            $alternative = $('<li data-hypothesis-index=' + idx + ' >' + stringThree + '</li>');
            break;
        }
        $hypotheses.append($alternative);
      }
    });
  };
}

var alternativePrototype = new Alternatives();

// TODO: Convert to closure approach
var processString = function(baseString, isFinished) {

  if (isFinished) {
    var formattedString = baseString.slice(0, -1);
    formattedString = formattedString.charAt(0).toUpperCase() + formattedString.substring(1);
    formattedString = formattedString.trim() + '.';
    $('#resultsText').val(formattedString);
  } else {
    $('#resultsText').val(baseString);
  }

}

exports.showJSON = function(msg, baseJSON) {
  var json = JSON.stringify(msg, null, 2);
  baseJSON += json;
  baseJSON += '\n';
  $('#resultsJSON').val(baseJSON);
  return baseJSON;
}

function updateScroll(){
    if(!scrolled){
        var element = $('.table-scroll').get(0);
        element.scrollTop = element.scrollHeight;
    }
}

var initScroll = function() {
  $('.table-scroll').on('scroll', function(){
      scrolled=true;
  });
}


exports.showResult = function(msg, baseString, callback) {

  var idx = +msg.result_index;

  if (msg.results && msg.results.length > 0) {

    var alternatives = msg.results[0].alternatives;
    var text = msg.results[0].alternatives[0].transcript || '';

    //Capitalize first word
    // if final results, append a new paragraph
    if (msg.results && msg.results[0] && msg.results[0].final) {
      baseString += text;
      var displayFinalString = baseString;
      displayFinalString = displayFinalString.replace(/%HESITATION\s/g, '');
      displayFinalString = displayFinalString.replace(/(.)\1{2,}/g, '');
      processString(displayFinalString, true);
      // If we're not using the mic, we show extensive metadata
      // But, showing metadata is computationally expensive because
      // of DOM manipulations, and causes some audio distortions
      // even though the DOM changes don't take place in the getUserMedia
      // on data callback
      var micRunning = JSON.parse(localStorage.getItem('micRunning'));
      if (!micRunning) {
        showMetaData(alternatives[0]);
        // Only show alternatives if we're final
        alternativePrototype.showAlternatives(alternatives);
      }
    } else {
      var tempString = baseString + text;
      tempString = tempString.replace(/%HESITATION\s/g, '');
      tempString = tempString.replace(/(.)\1{2,}/g, '');
      processString(tempString, false);
    }
  }

  updateScroll();

  return baseString;

};

$.subscribe('clearscreen', function() {
  var $hypotheses = $('.hypotheses ul');
  scrolled = false;
  $hypotheses.empty();
  alternativePrototype.clearString();
});
}).call(this,typeof global !== "undefined" ? global : typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {})

},{}],10:[function(require,module,exports){

'use strict';

var handleSelectedFile = require('./fileupload').handleSelectedFile;

exports.initDragDrop = function(ctx) {

  var dragAndDropTarget = $(document);

  dragAndDropTarget.on('dragenter', function (e) {
    e.stopPropagation();
    e.preventDefault();
  });

  dragAndDropTarget.on('dragover', function (e) {
    e.stopPropagation();
    e.preventDefault();
  });

  dragAndDropTarget.on('drop', function (e) {
    console.log('File dropped');
    e.preventDefault();
    var evt = e.originalEvent;
    // Handle dragged file event
    handleFileUploadEvent(evt);
  });

  function handleFileUploadEvent(evt) {
    // Init file upload with default model
    var file = evt.dataTransfer.files[0];
    handleSelectedFile(ctx.token, file);
  }

}

},{"./fileupload":12}],11:[function(require,module,exports){



exports.flashSVG = function(el) {
  el.css({ fill: '#A53725' });
  function loop() {
    el.animate({ fill: '#A53725' },
        1000, 'linear')
      .animate({ fill: 'white' },
          1000, 'linear');
  }
  // return timer
  var timer = setTimeout(loop, 2000);
  return timer;
};

exports.stopFlashSVG = function(timer) {
  el.css({ fill: 'white' } );
  clearInterval(timer);
}

exports.toggleImage = function(el, name) {
  if(el.attr('src') === 'images/' + name + '.svg') {
    el.attr("src", 'images/stop-red.svg');
  } else {
    el.attr('src', 'images/stop.svg');
  }
}

var restoreImage = exports.restoreImage = function(el, name) {
  el.attr('src', 'images/' + name + '.svg');
}

exports.stopToggleImage = function(timer, el, name) {
  clearInterval(timer);
  restoreImage(el, name);
}

},{}],12:[function(require,module,exports){

'use strict';

var showError = require('./showerror').showError;
var showNotice = require('./showerror').showNotice;
var handleFileUpload = require('../handlefileupload').handleFileUpload;
var effects = require('./effects');
var utils = require('../utils');

// Need to remove the view logic here and move this out to the handlefileupload controller
var handleSelectedFile = exports.handleSelectedFile = (function() {

    var running = false;
    localStorage.setItem('currentlyDisplaying', false);

    return function(token, file) {

    var currentlyDisplaying = JSON.parse(localStorage.getItem('currentlyDisplaying'));

    // if (currentlyDisplaying) {
    //   showError('Currently another file is playing, please stop the file or wait until it finishes');
    //   return;
    // }

    $.publish('clearscreen');

    localStorage.setItem('currentlyDisplaying', true);
    running = true;

    // Visual effects
    var uploadImageTag = $('#fileUploadTarget > img');
    var timer = setInterval(effects.toggleImage, 750, uploadImageTag, 'stop');
    var uploadText = $('#fileUploadTarget > span');
    uploadText.text('Stop Transcribing');

    function restoreUploadTab() {
      clearInterval(timer);
      effects.restoreImage(uploadImageTag, 'upload');
      uploadText.text('Select File');
    }

    // Clear flashing if socket upload is stopped
    $.subscribe('hardsocketstop', function(data) {
      restoreUploadTab();
    });


    // Get current model
    var currentModel = localStorage.getItem('currentModel');
    console.log('currentModel', currentModel);

    // Read first 4 bytes to determine header
    var blobToText = new Blob([file]).slice(0, 4);
    var r = new FileReader();
    r.readAsText(blobToText);
    r.onload = function() {
      var contentType;
      if (r.result === 'fLaC') {
        contentType = 'audio/flac';
        showNotice('Notice: browsers do not support playing FLAC audio, so no audio will accompany the transcription');
      } else if (r.result === 'RIFF') {
        contentType = 'audio/wav';
        var audio = new Audio();
        var wavBlob = new Blob([file], {type: 'audio/wav'});
        var wavURL = URL.createObjectURL(wavBlob);
        audio.src = wavURL;
        audio.play();
        $.subscribe('hardsocketstop', function() {
          audio.pause();
          audio.currentTime = 0;
        });
      } else {
        restoreUploadTab();
        showError('Only WAV or FLAC files can be transcribed, please try another file format');
        return;
      }
      handleFileUpload(token, currentModel, file, contentType, function(socket) {
        var blob = new Blob([file]);
        var parseOptions = {
          file: blob
        };
        utils.onFileProgress(parseOptions,
          // On data chunk
          function(chunk) {
            socket.send(chunk);
          },
          // On file read error
          function(evt) {
            console.log('Error reading file: ', evt.message);
            showError('Error: ' + evt.message);
          },
          // On load end
          function() {
            socket.send(JSON.stringify({'action': 'stop'}));
          });
      }, 
        function(evt) {
          effects.stopToggleImage(timer, uploadImageTag, 'upload');
          uploadText.text('Select File');
          localStorage.setItem('currentlyDisplaying', false);
        }
      );
    };
  }
})();


exports.initFileUpload = function(ctx) {

  var fileUploadDialog = $("#fileUploadDialog");

  fileUploadDialog.change(function(evt) {
    var file = fileUploadDialog.get(0).files[0];
    handleSelectedFile(ctx.token, file);
  });

  $("#fileUploadTarget").click(function(evt) {

    var currentlyDisplaying = JSON.parse(localStorage.getItem('currentlyDisplaying'));

    if (currentlyDisplaying) {
      console.log('HARD SOCKET STOP');
      $.publish('hardsocketstop');
      localStorage.setItem('currentlyDisplaying', false);
      return;
    }

    fileUploadDialog.val(null);

    fileUploadDialog
    .trigger('click');

  });

}
},{"../handlefileupload":4,"../utils":7,"./effects":11,"./showerror":18}],13:[function(require,module,exports){

var initSessionPermissions = require('./sessionpermissions').initSessionPermissions;
var initSelectModel = require('./selectmodel').initSelectModel;
var initAnimatePanel = require('./animatepanel').initAnimatePanel;
var initShowTab = require('./showtab').initShowTab;
var initDragDrop = require('./dragdrop').initDragDrop;
var initPlaySample = require('./playsample').initPlaySample;
var initRecordButton = require('./recordbutton').initRecordButton;
var initFileUpload = require('./fileupload').initFileUpload;


exports.initViews = function(ctx) {
  console.log('Initializing views...');
  initSelectModel(ctx);
  initPlaySample(ctx);
  initDragDrop(ctx);
  initRecordButton(ctx);
  initFileUpload(ctx);
  initSessionPermissions();
  initShowTab();
  initAnimatePanel();
  initShowTab();
}
},{"./animatepanel":8,"./dragdrop":10,"./fileupload":12,"./playsample":14,"./recordbutton":15,"./selectmodel":16,"./sessionpermissions":17,"./showtab":19}],14:[function(require,module,exports){

'use strict';

var utils = require('../utils');
var onFileProgress = utils.onFileProgress;
var handleFileUpload = require('../handlefileupload').handleFileUpload;
var initSocket = require('../socket').initSocket;
var showError = require('./showerror').showError;
var effects = require('./effects');


var LOOKUP_TABLE = {
  'en-US_BroadbandModel': ['Us_English_Broadband_Sample_1.wav', 'Us_English_Broadband_Sample_2.wav'],
  'en-US_NarrowbandModel': ['Us_English_Narrowband_Sample_1.wav', 'Us_English_Narrowband_Sample_2.wav'],
  'es-ES_BroadbandModel': ['Es_ES_spk24_16khz.wav', 'Es_ES_spk19_16khz.wav'],
  'es-ES_NarrowbandModel': ['Es_ES_spk24_8khz.wav', 'Es_ES_spk19_8khz.wav'],
  'ja-JP_BroadbandModel': ['sample-Ja_JP-wide1.wav', 'sample-Ja_JP-wide2.wav'],
  'ja-JP_NarrowbandModel': ['sample-Ja_JP-narrow3.wav', 'sample-Ja_JP-narrow4.wav']
};

var playSample = (function() {

  var running = false;
  localStorage.setItem('currentlyDisplaying', false);

  return function(token, imageTag, iconName, url, callback) {

    $.publish('clearscreen');

    var currentlyDisplaying = JSON.parse(localStorage.getItem('currentlyDisplaying'));

    console.log('CURRENTLY DISPLAYING', currentlyDisplaying);

    // This error handling needs to be expanded to accomodate
    // the two different play samples files
    if (currentlyDisplaying) {
      console.log('HARD SOCKET STOP');
      $.publish('socketstop');
      localStorage.setItem('currentlyDisplaying', false);
      effects.stopToggleImage(timer, imageTag, iconName);
      effects.restoreImage(imageTag, iconName);
      running = false;
      return;
    }

    if (currentlyDisplaying && running) {
      showError('Currently another file is playing, please stop the file or wait until it finishes');
      return;
    }

    localStorage.setItem('currentlyDisplaying', true);
    running = true;

    var timer = setInterval(effects.toggleImage, 750, imageTag, iconName);

    var xhr = new XMLHttpRequest();
    xhr.open('GET', url, true);
    xhr.responseType = 'blob';
    xhr.onload = function(e) {
      var blob = xhr.response;
      var currentModel = localStorage.getItem('currentModel') || 'en-US_BroadbandModel';
      var reader = new FileReader();
      var blobToText = new Blob([blob]).slice(0, 4);
      reader.readAsText(blobToText);
      reader.onload = function() {
        var contentType = reader.result === 'fLaC' ? 'audio/flac' : 'audio/wav';
        console.log('Uploading file', reader.result);
        var mediaSourceURL = URL.createObjectURL(blob);
        var audio = new Audio();
        audio.src = mediaSourceURL;
        audio.play();
        $.subscribe('hardsocketstop', function() {
          audio.pause();
          audio.currentTime = 0;
        });
        $.subscribe('socketstop', function() {
          audio.pause();
          audio.currentTime = 0;
        });
        handleFileUpload(token, currentModel, blob, contentType, function(socket) {
          var parseOptions = {
            file: blob
          };
          onFileProgress(parseOptions,
            // On data chunk
            function(chunk) {
              socket.send(chunk);
            },
            // On file read error
            function(evt) {
              console.log('Error reading file: ', evt.message);
              // showError(evt.message);
            },
            // On load end
            function() {
              socket.send(JSON.stringify({'action': 'stop'}));
            });
        }, 
        // On connection end
          function(evt) {
            effects.stopToggleImage(timer, imageTag, iconName);
            effects.restoreImage(imageTag, iconName);
            localStorage.getItem('currentlyDisplaying', false);
          }
        );
      };
    };
    xhr.send();
  };
})();


exports.initPlaySample = function(ctx) {

  (function() {
    var fileName = 'audio/' + LOOKUP_TABLE[ctx.currentModel][0];
    var el = $('.play-sample-1');
    el.off('click');
    var iconName = 'play';
    var imageTag = el.find('img');
    el.click( function(evt) {
      playSample(ctx.token, imageTag, iconName, fileName, function(result) {
        console.log('Play sample result', result);
      });
    });
  })(ctx, LOOKUP_TABLE);

  (function() {
    var fileName = 'audio/' + LOOKUP_TABLE[ctx.currentModel][1];
    var el = $('.play-sample-2');
    el.off('click');
    var iconName = 'play';
    var imageTag = el.find('img');
    el.click( function(evt) {
      playSample(ctx.token, imageTag, iconName, fileName, function(result) {
        console.log('Play sample result', result);
      });
    });
  })(ctx, LOOKUP_TABLE);

};
},{"../handlefileupload":4,"../socket":6,"../utils":7,"./effects":11,"./showerror":18}],15:[function(require,module,exports){

'use strict';

var Microphone = require('../Microphone');
var handleMicrophone = require('../handlemicrophone').handleMicrophone;
var showError = require('./showerror').showError;

exports.initRecordButton = function(ctx) {

  var recordButton = $('#recordButton');

  recordButton.click((function() {

    var running = false;
    var token = ctx.token;
    var micOptions = {
      bufferSize: ctx.buffersize
    };
    var mic = new Microphone(micOptions);

    return function(evt) {
      // Prevent default anchor behavior
      evt.preventDefault();

      var currentModel = localStorage.getItem('currentModel');
      var currentlyDisplaying = JSON.parse(localStorage.getItem('currentlyDisplaying'));

      if (currentlyDisplaying) {
        showError('Currently another file is playing, please stop the file or wait until it finishes');
        return;
      }

      if (!running) {
        console.log('Not running, handleMicrophone()');
        handleMicrophone(token, currentModel, mic, function(err, socket) {
          if (err) {
            var msg = 'Error: ' + err.message;
            console.log(msg);
            showError(msg);
            running = false;
          } else {
            recordButton.css('background-color', '#d74108');
            recordButton.find('img').attr('src', 'images/stop.svg');
            console.log('starting mic');
            mic.record();
            running = true;
          }
        });
      } else {
        console.log('Stopping microphone, sending stop action message');
        recordButton.removeAttr('style');
        recordButton.find('img').attr('src', 'images/microphone.svg');
        $.publish('hardsocketstop');
        mic.stop();
        running = false;
      }
    }
  })());
}
},{"../Microphone":2,"../handlemicrophone":5,"./showerror":18}],16:[function(require,module,exports){

var initPlaySample = require('./playsample').initPlaySample;

exports.initSelectModel = function(ctx) {

  function isDefault(model) {
    return model === 'en-US_BroadbandModel';
  }

  ctx.models.forEach(function(model) {
    $("#dropdownMenuList").append(
      $("<li>")
        .attr('role', 'presentation')
        .append(
          $('<a>').attr('role', 'menu-item')
            .attr('href', '/')
            .attr('data-model', model.name)
            .append(model.description)
          )
      )
  });

  $("#dropdownMenuList").click(function(evt) {
    evt.preventDefault();
    evt.stopPropagation();
    console.log('Change view', $(evt.target).text());
    var newModelDescription = $(evt.target).text();
    var newModel = $(evt.target).data('model');
    $('#dropdownMenuDefault').empty().text(newModelDescription);
    $('#dropdownMenu1').dropdown('toggle');
    localStorage.setItem('currentModel', newModel);
    ctx.currentModel = newModel;
    initPlaySample(ctx);
    $.publish('clearscreen');
  });

}
},{"./playsample":14}],17:[function(require,module,exports){

'use strict';

exports.initSessionPermissions = function() {
  console.log('Initializing session permissions handler');
  // Radio buttons
  var sessionPermissionsRadio = $("#sessionPermissionsRadioGroup input[type='radio']");
  sessionPermissionsRadio.click(function(evt) {
    var checkedValue = sessionPermissionsRadio.filter(':checked').val();
    console.log('checkedValue', checkedValue);
    localStorage.setItem('sessionPermissions', checkedValue);
  });
}

},{}],18:[function(require,module,exports){

'use strict';

exports.showError = function(msg) {
  console.log('Error: ', msg);
  var errorAlert = $('.error-row');
  errorAlert.hide();
  errorAlert.css('background-color', '#d74108');
  errorAlert.css('color', 'white');
  var errorMessage = $('#errorMessage');
  errorMessage.text(msg);
  errorAlert.show();
  $('#errorClose').click(function(e) {
    e.preventDefault();
    errorAlert.hide();
    return false;
  });
}

exports.showNotice = function(msg) {
  console.log('Notice: ', msg);
  var noticeAlert = $('.notification-row');
  noticeAlert.hide();
  noticeAlert.css('border', '2px solid #ececec');
  noticeAlert.css('background-color', '#f4f4f4');
  noticeAlert.css('color', 'black');
  var noticeMessage = $('#notificationMessage');
  noticeMessage.text(msg);
  noticeAlert.show();
  $('#notificationClose').click(function(e) {
    e.preventDefault();
    noticeAlert.hide();
    return false;
  });
}

exports.hideError = function() {
  var errorAlert = $('.error-row');
  errorAlert.hide();
}
},{}],19:[function(require,module,exports){


exports.initShowTab = function() {
  $('#nav-tabs a').on("click", function (e) {
    e.preventDefault()
    $(this).tab('show')
  });
}

},{}],20:[function(require,module,exports){
/**
 * Copyright 2014 IBM Corp. All Rights Reserved.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
/*global $:false */

'use strict';

var Microphone = require('./Microphone');
var models = require('./data/models.json').models;
var utils = require('./utils');
utils.initPubSub();
var initViews = require('./views').initViews;
var pkg = require('../package.json');

window.BUFFERSIZE = 8192;

$(document).ready(function() {

  // Temporary app data
  $('#appSettings')
    .html(
      '<p>Version: ' + pkg.version + '</p>'
      + '<p>Buffer Size: ' + BUFFERSIZE + '</p>'
    );


  // Make call to API to try and get token
  utils.getToken(function(token) {

    window.onbeforeunload = function(e) {
      localStorage.clear();
    };

    if (!token) {
      console.error('No authorization token available');
      console.error('Attempting to reconnect...');
    }

    var viewContext = {
      currentModel: 'en-US_BroadbandModel',
      models: models,
      token: token,
      bufferSize: BUFFERSIZE
    };

    initViews(viewContext);

    // Save models to localstorage
    localStorage.setItem('models', JSON.stringify(models));

    // Set default current model
    localStorage.setItem('currentModel', 'en-US_BroadbandModel');
    localStorage.setItem('sessionPermissions', 'true');
    localStorage.setItem('micRunning', 'false');


    $.subscribe('clearscreen', function() {
      $('#resultsText').text('');
      $('#resultsJSON').text('');
      $('.error-row').hide();
      $('.notification-row').hide();
      $('.hypotheses > ul').empty();
      $('#metadataTableBody').empty();
    });

  });

});
},{"../package.json":1,"./Microphone":2,"./data/models.json":3,"./utils":7,"./views":13}]},{},[20])
//# sourceMappingURL=data:application/json;charset:utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIi4uLy4uLy5ucG0vbGliL25vZGVfbW9kdWxlcy93YXRjaGlmeS9ub2RlX21vZHVsZXMvYnJvd3NlcmlmeS9ub2RlX21vZHVsZXMvYnJvd3Nlci1wYWNrL19wcmVsdWRlLmpzIiwicGFja2FnZS5qc29uIiwic3JjL01pY3JvcGhvbmUuanMiLCJzcmMvZGF0YS9tb2RlbHMuanNvbiIsInNyYy9oYW5kbGVmaWxldXBsb2FkLmpzIiwic3JjL2hhbmRsZW1pY3JvcGhvbmUuanMiLCJzcmMvc29ja2V0LmpzIiwic3JjL3V0aWxzLmpzIiwic3JjL3ZpZXdzL2FuaW1hdGVwYW5lbC5qcyIsInNyYy92aWV3cy9kaXNwbGF5bWV0YWRhdGEuanMiLCJzcmMvdmlld3MvZHJhZ2Ryb3AuanMiLCJzcmMvdmlld3MvZWZmZWN0cy5qcyIsInNyYy92aWV3cy9maWxldXBsb2FkLmpzIiwic3JjL3ZpZXdzL2luZGV4LmpzIiwic3JjL3ZpZXdzL3BsYXlzYW1wbGUuanMiLCJzcmMvdmlld3MvcmVjb3JkYnV0dG9uLmpzIiwic3JjL3ZpZXdzL3NlbGVjdG1vZGVsLmpzIiwic3JjL3ZpZXdzL3Nlc3Npb25wZXJtaXNzaW9ucy5qcyIsInNyYy92aWV3cy9zaG93ZXJyb3IuanMiLCJzcmMvdmlld3Mvc2hvd3RhYi5qcyIsInNyYy9pbmRleC5qcyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTtBQ0FBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQy9EQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUM1YkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUM5Q0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNuRUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNuRUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7O0FDL0hBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOzs7O0FDMUZBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7OztBQ25CQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOzs7O0FDektBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDbENBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDckNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUN0SUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUN0QkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQzVJQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQzFEQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNwQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNiQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUN2Q0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ1JBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0EiLCJmaWxlIjoiZ2VuZXJhdGVkLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXNDb250ZW50IjpbIihmdW5jdGlvbiBlKHQsbixyKXtmdW5jdGlvbiBzKG8sdSl7aWYoIW5bb10pe2lmKCF0W29dKXt2YXIgYT10eXBlb2YgcmVxdWlyZT09XCJmdW5jdGlvblwiJiZyZXF1aXJlO2lmKCF1JiZhKXJldHVybiBhKG8sITApO2lmKGkpcmV0dXJuIGkobywhMCk7dmFyIGY9bmV3IEVycm9yKFwiQ2Fubm90IGZpbmQgbW9kdWxlICdcIitvK1wiJ1wiKTt0aHJvdyBmLmNvZGU9XCJNT0RVTEVfTk9UX0ZPVU5EXCIsZn12YXIgbD1uW29dPXtleHBvcnRzOnt9fTt0W29dWzBdLmNhbGwobC5leHBvcnRzLGZ1bmN0aW9uKGUpe3ZhciBuPXRbb11bMV1bZV07cmV0dXJuIHMobj9uOmUpfSxsLGwuZXhwb3J0cyxlLHQsbixyKX1yZXR1cm4gbltvXS5leHBvcnRzfXZhciBpPXR5cGVvZiByZXF1aXJlPT1cImZ1bmN0aW9uXCImJnJlcXVpcmU7Zm9yKHZhciBvPTA7bzxyLmxlbmd0aDtvKyspcyhyW29dKTtyZXR1cm4gc30pIiwibW9kdWxlLmV4cG9ydHM9e1xuICBcIm5hbWVcIjogXCJTcGVlY2hUb1RleHRCcm93c2VyU3RhcnRlckFwcFwiLFxuICBcInZlcnNpb25cIjogXCIwLjIuMVwiLFxuICBcImRlc2NyaXB0aW9uXCI6IFwiQSBzYW1wbGUgYnJvd3NlciBhcHAgZm9yIEJsdWVtaXggdGhhdCB1c2UgdGhlIHNwZWVjaC10by10ZXh0IHNlcnZpY2UsIGZldGNoaW5nIGEgdG9rZW4gdmlhIE5vZGUuanNcIixcbiAgXCJkZXBlbmRlbmNpZXNcIjoge1xuICAgIFwiYm9keS1wYXJzZXJcIjogXCJ+MS4xMC4yXCIsXG4gICAgXCJjb25uZWN0XCI6IFwiXjMuMy41XCIsXG4gICAgXCJlcnJvcmhhbmRsZXJcIjogXCJ+MS4yLjRcIixcbiAgICBcImV4cHJlc3NcIjogXCJ+NC4xMC44XCIsXG4gICAgXCJoYXJtb25cIjogXCJeMS4zLjFcIixcbiAgICBcImh0dHAtcHJveHlcIjogXCJeMS4xMS4xXCIsXG4gICAgXCJyZXF1ZXN0XCI6IFwifjIuNTMuMFwiLFxuICAgIFwidHJhbnNmb3JtZXItcHJveHlcIjogXCJeMC4zLjFcIlxuICB9LFxuICBcImVuZ2luZXNcIjoge1xuICAgIFwibm9kZVwiOiBcIj49MC4xMFwiXG4gIH0sXG4gIFwicmVwb3NpdG9yeVwiOiB7XG4gICAgXCJ0eXBlXCI6IFwiZ2l0XCIsXG4gICAgXCJ1cmxcIjogXCJodHRwczovL2dpdGh1Yi5jb20vd2F0c29uLWRldmVsb3Blci1jbG91ZC9zcGVlY2gtdG8tdGV4dC1icm93c2VyLmdpdFwiXG4gIH0sXG4gIFwiYXV0aG9yXCI6IFwiSUJNIENvcnAuXCIsXG4gIFwiYnJvd3NlcmlmeS1zaGltXCI6IHtcbiAgICBcImpxdWVyeVwiOiBcImdsb2JhbDpqUXVlcnlcIlxuICB9LFxuICBcImJyb3dzZXJpZnlcIjoge1xuICAgIFwidHJhbnNmb3JtXCI6IFtcbiAgICAgIFwiYnJvd3NlcmlmeS1zaGltXCJcbiAgICBdXG4gIH0sXG4gIFwiY29udHJpYnV0b3JzXCI6IFtcbiAgICB7XG4gICAgICBcIm5hbWVcIjogXCJHZXJtYW4gQXR0YW5hc2lvIFJ1aXpcIixcbiAgICAgIFwiZW1haWxcIjogXCJnZXJtYW5hdHRAdXMuaWJtLmNvbVwiXG4gICAgfSxcbiAgICB7XG4gICAgICBcIm5hbWVcIjogXCJEYW5pZWwgQm9sYW5vXCIsXG4gICAgICBcImVtYWlsXCI6IFwiZGJvbGFub0B1cy5pYm0uY29tXCJcbiAgICB9LFxuICAgIHtcbiAgICAgIFwibmFtZVwiOiBcIkJyaXRhbnkgTC4gUG9udmVsbGVcIixcbiAgICAgIFwiZW1haWxcIjogXCJibHBvbnZlbGxlQHVzLmlibS5jb21cIlxuICAgIH0sXG4gICAge1xuICAgICAgXCJuYW1lXCI6IFwiRXJpYyBTLiBCdWxsaW5ndG9uXCIsXG4gICAgICBcImVtYWlsXCI6IFwiZXNidWxsaW5AdXMuaWJtLmNvbVwiXG4gICAgfVxuICBdLFxuICBcImxpY2Vuc2VcIjogXCJBcGFjaGUtMi4wXCIsXG4gIFwiYnVnc1wiOiB7XG4gICAgXCJ1cmxcIjogXCJodHRwczovL2dpdGh1Yi5jb20vd2F0c29uLWRldmVsb3Blci1jbG91ZC9zcGVlY2gtdG8tdGV4dC1icm93c2VyL2lzc3Vlc1wiXG4gIH0sXG4gIFwic2NyaXB0c1wiOiB7XG4gICAgXCJzdGFydFwiOiBcIm5vZGUgYXBwLmpzXCIsXG4gICAgXCJidWlsZFwiOiBcImJyb3dzZXJpZnkgLW8gcHVibGljL2pzL21haW4uanMgc3JjL2luZGV4LmpzXCIsXG4gICAgXCJ3YXRjaFwiOiBcIndhdGNoaWZ5IC12IC1kIC1vIHB1YmxpYy9qcy9tYWluLmpzIHNyYy9pbmRleC5qc1wiXG4gIH0sXG4gIFwiZGV2RGVwZW5kZW5jaWVzXCI6IHtcbiAgICBcImJyb3dzZXJpZnlcIjogXCJeMTAuMi40XCIsXG4gICAgXCJicm93c2VyaWZ5LXNoaW1cIjogXCJeMy44LjlcIixcbiAgICBcIndhdGNoaWZ5XCI6IFwiXjMuMi4zXCJcbiAgfVxufVxuIiwiLyoqXG4gKiBDb3B5cmlnaHQgMjAxNCBJQk0gQ29ycC4gQWxsIFJpZ2h0cyBSZXNlcnZlZC5cbiAqXG4gKiBMaWNlbnNlZCB1bmRlciB0aGUgQXBhY2hlIExpY2Vuc2UsIFZlcnNpb24gMi4wICh0aGUgJ0xpY2Vuc2UnKTtcbiAqIHlvdSBtYXkgbm90IHVzZSB0aGlzIGZpbGUgZXhjZXB0IGluIGNvbXBsaWFuY2Ugd2l0aCB0aGUgTGljZW5zZS5cbiAqIFlvdSBtYXkgb2J0YWluIGEgY29weSBvZiB0aGUgTGljZW5zZSBhdFxuICpcbiAqICAgICAgaHR0cDovL3d3dy5hcGFjaGUub3JnL2xpY2Vuc2VzL0xJQ0VOU0UtMi4wXG4gKlxuICogVW5sZXNzIHJlcXVpcmVkIGJ5IGFwcGxpY2FibGUgbGF3IG9yIGFncmVlZCB0byBpbiB3cml0aW5nLCBzb2Z0d2FyZVxuICogZGlzdHJpYnV0ZWQgdW5kZXIgdGhlIExpY2Vuc2UgaXMgZGlzdHJpYnV0ZWQgb24gYW4gJ0FTIElTJyBCQVNJUyxcbiAqIFdJVEhPVVQgV0FSUkFOVElFUyBPUiBDT05ESVRJT05TIE9GIEFOWSBLSU5ELCBlaXRoZXIgZXhwcmVzcyBvciBpbXBsaWVkLlxuICogU2VlIHRoZSBMaWNlbnNlIGZvciB0aGUgc3BlY2lmaWMgbGFuZ3VhZ2UgZ292ZXJuaW5nIHBlcm1pc3Npb25zIGFuZFxuICogbGltaXRhdGlvbnMgdW5kZXIgdGhlIExpY2Vuc2UuXG4gKi9cblxuJ3VzZSBzdHJpY3QnO1xuXG52YXIgdXRpbHMgPSByZXF1aXJlKCcuL3V0aWxzJyk7XG4vKipcbiAqIENhcHR1cmVzIG1pY3JvcGhvbmUgaW5wdXQgZnJvbSB0aGUgYnJvd3Nlci5cbiAqIFdvcmtzIGF0IGxlYXN0IG9uIGxhdGVzdCB2ZXJzaW9ucyBvZiBGaXJlZm94IGFuZCBDaHJvbWVcbiAqL1xuZnVuY3Rpb24gTWljcm9waG9uZShfb3B0aW9ucykge1xuICB2YXIgb3B0aW9ucyA9IF9vcHRpb25zIHx8IHt9O1xuXG4gIC8vIHdlIHJlY29yZCBpbiBtb25vIGJlY2F1c2UgdGhlIHNwZWVjaCByZWNvZ25pdGlvbiBzZXJ2aWNlXG4gIC8vIGRvZXMgbm90IHN1cHBvcnQgc3RlcmVvLlxuICB0aGlzLmJ1ZmZlclNpemUgPSBvcHRpb25zLmJ1ZmZlclNpemUgfHwgODE5MjtcbiAgdGhpcy5pbnB1dENoYW5uZWxzID0gb3B0aW9ucy5pbnB1dENoYW5uZWxzIHx8IDE7XG4gIHRoaXMub3V0cHV0Q2hhbm5lbHMgPSBvcHRpb25zLm91dHB1dENoYW5uZWxzIHx8IDE7XG4gIHRoaXMucmVjb3JkaW5nID0gZmFsc2U7XG4gIHRoaXMucmVxdWVzdGVkQWNjZXNzID0gZmFsc2U7XG4gIHRoaXMuc2FtcGxlUmF0ZSA9IDE2MDAwO1xuICAvLyBhdXhpbGlhciBidWZmZXIgdG8ga2VlcCB1bnVzZWQgc2FtcGxlcyAodXNlZCB3aGVuIGRvaW5nIGRvd25zYW1wbGluZylcbiAgdGhpcy51bnVzZWRTYW1wbGVzID0gbmV3IEZsb2F0MzJBcnJheSgwKTtcblxuICAvLyBDaHJvbWUgb3IgRmlyZWZveCBvciBJRSBVc2VyIG1lZGlhXG4gIGlmICghbmF2aWdhdG9yLmdldFVzZXJNZWRpYSkge1xuICAgIG5hdmlnYXRvci5nZXRVc2VyTWVkaWEgPSBuYXZpZ2F0b3Iud2Via2l0R2V0VXNlck1lZGlhIHx8XG4gICAgbmF2aWdhdG9yLm1vekdldFVzZXJNZWRpYSB8fCBuYXZpZ2F0b3IubXNHZXRVc2VyTWVkaWE7XG4gIH1cblxufVxuXG4vKipcbiAqIENhbGxlZCB3aGVuIHRoZSB1c2VyIHJlamVjdCB0aGUgdXNlIG9mIHRoZSBtaWNocm9waG9uZVxuICogQHBhcmFtICBlcnJvciBUaGUgZXJyb3JcbiAqL1xuTWljcm9waG9uZS5wcm90b3R5cGUub25QZXJtaXNzaW9uUmVqZWN0ZWQgPSBmdW5jdGlvbigpIHtcbiAgY29uc29sZS5sb2coJ01pY3JvcGhvbmUub25QZXJtaXNzaW9uUmVqZWN0ZWQoKScpO1xuICB0aGlzLnJlcXVlc3RlZEFjY2VzcyA9IGZhbHNlO1xuICB0aGlzLm9uRXJyb3IoJ1Blcm1pc3Npb24gdG8gYWNjZXNzIHRoZSBtaWNyb3Bob25lIHJlamV0ZWQuJyk7XG59O1xuXG5NaWNyb3Bob25lLnByb3RvdHlwZS5vbkVycm9yID0gZnVuY3Rpb24oZXJyb3IpIHtcbiAgY29uc29sZS5sb2coJ01pY3JvcGhvbmUub25FcnJvcigpOicsIGVycm9yKTtcbn07XG5cblxudmFyIGRvd25zYW1wbGVCdWZmZXIgPSBmdW5jdGlvbiAoYnVmZmVyLCBzYW1wbGVSYXRlLCBvdXRTYW1wbGVSYXRlKSB7XG4gICAgaWYgKG91dFNhbXBsZVJhdGUgPT0gc2FtcGxlUmF0ZSkge1xuICAgICAgICByZXR1cm4gYnVmZmVyO1xuICAgIH1cbiAgICBpZiAob3V0U2FtcGxlUmF0ZSA+IHNhbXBsZVJhdGUpIHtcbiAgICAgICAgdGhyb3cgXCJkb3duc2FtcGxpbmcgcmF0ZSBzaG93IGJlIHNtYWxsZXIgdGhhbiBvcmlnaW5hbCBzYW1wbGUgcmF0ZVwiO1xuICAgIH1cbiAgICB2YXIgc2FtcGxlUmF0ZVJhdGlvID0gc2FtcGxlUmF0ZSAvIG91dFNhbXBsZVJhdGU7XG4gICAgdmFyIG5ld0xlbmd0aCA9IE1hdGgucm91bmQoYnVmZmVyLmxlbmd0aCAvIHNhbXBsZVJhdGVSYXRpbyk7XG4gICAgdmFyIHJlc3VsdCA9IG5ldyBJbnQxNkFycmF5KG5ld0xlbmd0aCk7XG4gICAgdmFyIG9mZnNldFJlc3VsdCA9IDA7XG4gICAgdmFyIG9mZnNldEJ1ZmZlciA9IDA7XG4gICAgd2hpbGUgKG9mZnNldFJlc3VsdCA8IHJlc3VsdC5sZW5ndGgpIHtcbiAgICAgICAgdmFyIG5leHRPZmZzZXRCdWZmZXIgPSBNYXRoLnJvdW5kKChvZmZzZXRSZXN1bHQgKyAxKSAqIHNhbXBsZVJhdGVSYXRpbyk7XG4gICAgICAgIHZhciBhY2N1bSA9IDAsIGNvdW50ID0gMDtcbiAgICAgICAgZm9yICh2YXIgaSA9IG9mZnNldEJ1ZmZlcjsgaSA8IG5leHRPZmZzZXRCdWZmZXIgJiYgaSA8IGJ1ZmZlci5sZW5ndGg7IGkrKykge1xuICAgICAgICAgICAgYWNjdW0gKz0gYnVmZmVyW2ldO1xuICAgICAgICAgICAgY291bnQrKztcbiAgICAgICAgfVxuXG4gICAgICAgIHJlc3VsdFtvZmZzZXRSZXN1bHRdID0gTWF0aC5taW4oMSwgYWNjdW0gLyBjb3VudCkqMHg3RkZGO1xuICAgICAgICBvZmZzZXRSZXN1bHQrKztcbiAgICAgICAgb2Zmc2V0QnVmZmVyID0gbmV4dE9mZnNldEJ1ZmZlcjtcbiAgICB9XG4gICAgcmV0dXJuIHJlc3VsdC5idWZmZXI7XG59XG5cbnZhciBkb3duc2FtcGxlVHdvID0gZnVuY3Rpb24oYnVmZmVyTmV3U2FtcGxlcywgc2FtcGxlUmF0ZSkge1xuICB2YXIgbmV3VG90YWxMZW5ndGggPSB0aGlzLnVudXNlZFNhbXBsZXMubGVuZ3RoICsgYnVmZmVyTmV3U2FtcGxlcy5sZW5ndGg7XG4gIHZhciBuZXdBcnJheUJ1ZmZlciA9IG5ldyBGbG9hdDMyQXJyYXkobmV3VG90YWxMZW5ndGgpO1xuICBmb3IgKHZhciBpID0gMDsgaSA8IHRoaXMudW51c2VkU2FtcGxlcy5sZW5ndGg7IGkrKykge1xuICAgIG5ld0FycmF5QnVmZmVyW2ldID0gdGhpcy51bnVzZWRTYW1wbGVzW2ldO1xuICB9XG4gIGZvciAodmFyIGogPSAwOyBqIDwgYnVmZmVyTmV3U2FtcGxlcy5sZW5ndGg7IGorKykge1xuICAgIG5ld0FycmF5QnVmZmVyW2ogKyB0aGlzLnVudXNlZFNhbXBsZXMubGVuZ3RoXSA9IGJ1ZmZlck5ld1NhbXBsZXNbal07XG4gIH1cbiAgdGhpcy51bnVzZWRTYW1wbGVzID0gbmV3QXJyYXlCdWZmZXI7XG4gIHZhciBidWZmZXIgPSBudWxsLFxuICAgIG5ld1NhbXBsZXMgPSBidWZmZXJOZXdTYW1wbGVzLmxlbmd0aCxcbiAgICAvLyB1bnVzZWRTYW1wbGVzID0gdGhpcy5idWZmZXJVbnVzZWRTYW1wbGVzLmxlbmd0aDtcblxuICAvLyBpZiAodW51c2VkU2FtcGxlcyA+IDApIHtcbiAgLy8gICBidWZmZXIgPSBuZXcgRmxvYXQzMkFycmF5KG5ld1NhbXBsZXMpO1xuICAvLyAgIGZvciAodmFyIGkgPSAwOyBpIDwgdW51c2VkU2FtcGxlczsgKytpKSB7XG4gIC8vICAgICBidWZmZXJbaV0gPSB0aGlzLmJ1ZmZlclVudXNlZFNhbXBsZXNbaV07XG4gIC8vICAgfVxuICAvLyAgIGZvciAoaSA9IDA7IGkgPCBuZXdTYW1wbGVzOyArK2kpIHtcbiAgLy8gICAgIGJ1ZmZlclt1bnVzZWRTYW1wbGVzICsgaV0gPSBidWZmZXJOZXdTYW1wbGVzW2ldO1xuICAvLyAgIH1cbiAgLy8gfSBlbHNlIHtcbiAgLy8gICBidWZmZXIgPSBidWZmZXJOZXdTYW1wbGVzO1xuICAvLyB9XG4gIGJ1ZmZlciA9IGJ1ZmZlck5ld1NhbXBsZXM7XG5cbiAgLy8gZG93bnNhbXBsaW5nIHZhcmlhYmxlc1xuICB2YXIgZmlsdGVyID0gW1xuICAgICAgLTAuMDM3OTM1LCAtMC4wMDA4OTAyNCwgMC4wNDAxNzMsIDAuMDE5OTg5LCAwLjAwNDc3OTIsIC0wLjA1ODY3NSwgLTAuMDU2NDg3LFxuICAgICAgLTAuMDA0MDY1MywgMC4xNDUyNywgMC4yNjkyNywgMC4zMzkxMywgMC4yNjkyNywgMC4xNDUyNywgLTAuMDA0MDY1MywgLTAuMDU2NDg3LFxuICAgICAgLTAuMDU4Njc1LCAwLjAwNDc3OTIsIDAuMDE5OTg5LCAwLjA0MDE3MywgLTAuMDAwODkwMjQsIC0wLjAzNzkzNVxuICAgIF0sXG4gICAgc2FtcGxpbmdSYXRlUmF0aW8gPSBzYW1wbGVSYXRlIC8gMTYwMDAsXG4gICAgbk91dHB1dFNhbXBsZXMgPSBNYXRoLmZsb29yKChidWZmZXIubGVuZ3RoIC0gZmlsdGVyLmxlbmd0aCkgLyAoc2FtcGxpbmdSYXRlUmF0aW8pKSArIDEsXG4gICAgcGNtRW5jb2RlZEJ1ZmZlcjE2ayA9IG5ldyBBcnJheUJ1ZmZlcihuT3V0cHV0U2FtcGxlcyAqIDIpLFxuICAgIGRhdGFWaWV3MTZrID0gbmV3IERhdGFWaWV3KHBjbUVuY29kZWRCdWZmZXIxNmspLFxuICAgIGluZGV4ID0gMCxcbiAgICB2b2x1bWUgPSAweDdGRkYsIC8vcmFuZ2UgZnJvbSAwIHRvIDB4N0ZGRiB0byBjb250cm9sIHRoZSB2b2x1bWVcbiAgICBuT3V0ID0gMDtcblxuICBmb3IgKHZhciBpID0gMDsgaSArIGZpbHRlci5sZW5ndGggLSAxIDwgYnVmZmVyLmxlbmd0aDsgaSA9IE1hdGgucm91bmQoc2FtcGxpbmdSYXRlUmF0aW8gKiBuT3V0KSkge1xuICAgIHZhciBzYW1wbGUgPSAwO1xuICAgIGZvciAodmFyIGogPSAwOyBqIDwgZmlsdGVyLmxlbmd0aDsgKytqKSB7XG4gICAgICBzYW1wbGUgKz0gYnVmZmVyW2kgKyBqXSAqIGZpbHRlcltqXTtcbiAgICB9XG4gICAgc2FtcGxlICo9IHZvbHVtZTtcbiAgICBkYXRhVmlldzE2ay5zZXRJbnQxNihpbmRleCwgc2FtcGxlLCB0cnVlKTsgLy8gJ3RydWUnIC0+IG1lYW5zIGxpdHRsZSBlbmRpYW5cbiAgICBpbmRleCArPSAyO1xuICAgIG5PdXQrKztcbiAgfVxuXG4gIC8vIHZhciBpbmRleFNhbXBsZUFmdGVyTGFzdFVzZWQgPSBNYXRoLnJvdW5kKHNhbXBsaW5nUmF0ZVJhdGlvICogbk91dCk7XG4gIC8vIHZhciByZW1haW5pbmcgPSBidWZmZXIubGVuZ3RoIC0gaW5kZXhTYW1wbGVBZnRlckxhc3RVc2VkO1xuICAvLyBpZiAocmVtYWluaW5nID4gMCkge1xuICAvLyAgIHRoaXMuYnVmZmVyVW51c2VkU2FtcGxlcyA9IG5ldyBGbG9hdDMyQXJyYXkocmVtYWluaW5nKTtcbiAgLy8gICBmb3IgKGkgPSAwOyBpIDwgcmVtYWluaW5nOyArK2kpIHtcbiAgLy8gICAgIHRoaXMuYnVmZmVyVW51c2VkU2FtcGxlc1tpXSA9IGJ1ZmZlcltpbmRleFNhbXBsZUFmdGVyTGFzdFVzZWQgKyBpXTtcbiAgLy8gICB9XG4gIC8vIH0gZWxzZSB7XG4gIC8vICAgdGhpcy5idWZmZXJVbnVzZWRTYW1wbGVzID0gbmV3IEZsb2F0MzJBcnJheSgwKTtcbiAgLy8gfVxuXG4gIHJldHVybiBuZXcgQmxvYihbZGF0YVZpZXcxNmtdLCB7XG4gICAgdHlwZTogJ2F1ZGlvL2wxNidcbiAgfSk7XG59XG5cbi8qKlxuICogQ2FsbGVkIHdoZW4gdGhlIHVzZXIgYXV0aG9yaXplcyB0aGUgdXNlIG9mIHRoZSBtaWNyb3Bob25lLlxuICogQHBhcmFtICB7T2JqZWN0fSBzdHJlYW0gVGhlIFN0cmVhbSB0byBjb25uZWN0IHRvXG4gKlxuICovXG5NaWNyb3Bob25lLnByb3RvdHlwZS5vbk1lZGlhU3RyZWFtID0gIGZ1bmN0aW9uKHN0cmVhbSkge1xuICB2YXIgQXVkaW9DdHggPSB3aW5kb3cuQXVkaW9Db250ZXh0IHx8IHdpbmRvdy53ZWJraXRBdWRpb0NvbnRleHQ7XG5cbiAgaWYgKCFBdWRpb0N0eClcbiAgICB0aHJvdyBuZXcgRXJyb3IoJ0F1ZGlvQ29udGV4dCBub3QgYXZhaWxhYmxlJyk7XG5cbiAgaWYgKCF0aGlzLmF1ZGlvQ29udGV4dClcbiAgICB0aGlzLmF1ZGlvQ29udGV4dCA9IG5ldyBBdWRpb0N0eCgpO1xuXG4gIHZhciBnYWluID0gdGhpcy5hdWRpb0NvbnRleHQuY3JlYXRlR2FpbigpO1xuICB2YXIgYXVkaW9JbnB1dCA9IHRoaXMuYXVkaW9Db250ZXh0LmNyZWF0ZU1lZGlhU3RyZWFtU291cmNlKHN0cmVhbSk7XG5cbiAgYXVkaW9JbnB1dC5jb25uZWN0KGdhaW4pO1xuXG4gIHRoaXMubWljID0gdGhpcy5hdWRpb0NvbnRleHQuY3JlYXRlU2NyaXB0UHJvY2Vzc29yKHRoaXMuYnVmZmVyU2l6ZSxcbiAgICB0aGlzLmlucHV0Q2hhbm5lbHMsIHRoaXMub3V0cHV0Q2hhbm5lbHMpO1xuXG4gIC8vIHVuY29tbWVudCB0aGUgZm9sbG93aW5nIGxpbmUgaWYgeW91IHdhbnQgdG8gdXNlIHlvdXIgbWljcm9waG9uZSBzYW1wbGUgcmF0ZVxuICAvL3RoaXMuc2FtcGxlUmF0ZSA9IHRoaXMuYXVkaW9Db250ZXh0LnNhbXBsZVJhdGU7XG4gIGNvbnNvbGUubG9nKCdNaWNyb3Bob25lLm9uTWVkaWFTdHJlYW0oKTogc2FtcGxpbmcgcmF0ZSBpczonLCB0aGlzLnNhbXBsZVJhdGUpO1xuXG4gIHRoaXMubWljLm9uYXVkaW9wcm9jZXNzID0gdGhpcy5fb25hdWRpb3Byb2Nlc3MuYmluZCh0aGlzKTtcbiAgdGhpcy5zdHJlYW0gPSBzdHJlYW07XG5cbiAgZ2Fpbi5jb25uZWN0KHRoaXMubWljKTtcbiAgdGhpcy5taWMuY29ubmVjdCh0aGlzLmF1ZGlvQ29udGV4dC5kZXN0aW5hdGlvbik7XG4gIHRoaXMucmVjb3JkaW5nID0gdHJ1ZTtcbiAgdGhpcy5yZXF1ZXN0ZWRBY2Nlc3MgPSBmYWxzZTtcbiAgdGhpcy5vblN0YXJ0UmVjb3JkaW5nKCk7XG59O1xuXG4vKipcbiAqIGNhbGxiYWNrIHRoYXQgaXMgYmVpbmcgdXNlZCBieSB0aGUgbWljcm9waG9uZVxuICogdG8gc2VuZCBhdWRpbyBjaHVua3MuXG4gKiBAcGFyYW0gIHtvYmplY3R9IGRhdGEgYXVkaW9cbiAqL1xuTWljcm9waG9uZS5wcm90b3R5cGUuX29uYXVkaW9wcm9jZXNzID0gZnVuY3Rpb24oZGF0YSkge1xuICBpZiAoIXRoaXMucmVjb3JkaW5nKSB7XG4gICAgLy8gV2Ugc3BlYWsgYnV0IHdlIGFyZSBub3QgcmVjb3JkaW5nXG4gICAgcmV0dXJuO1xuICB9XG5cbiAgLy8gU2luZ2xlIGNoYW5uZWxcbiAgdmFyIGNoYW4gPSBkYXRhLmlucHV0QnVmZmVyLmdldENoYW5uZWxEYXRhKDApO1xuXG4gIHRoaXMub25BdWRpbyh0aGlzLl9leHBvcnREYXRhQnVmZmVyVG8xNktoeihuZXcgRmxvYXQzMkFycmF5KGNoYW4pKSk7XG4gIC8vIE90aGVyIGRvd25zYW1wbGluZyBleHBlcmltZW50c1xuICAvLyB2YXIgc2VsZiA9IHRoaXM7XG4gIC8vIHZhciBkb3duU2FtcGxlZCA9IGRvd25zYW1wbGVCdWZmZXIoY2hhbiwgNDQxMDAsIDE2MDAwKTtcbiAgLy8gdmFyIHNhbXBsZVJhdGUgPSB0aGlzLmF1ZGlvQ29udGV4dC5zYW1wbGVSYXRlO1xuICAvLyB2YXIgZG93blNhbXBsZWQgPSBkb3duc2FtcGxlVHdvKG5ldyBGbG9hdDMyQXJyYXkoY2hhbiksIHNhbXBsZVJhdGUpO1xuICAvLyB0aGlzLm9uQXVkaW8oZG93blNhbXBsZWQpO1xuXG59O1xuXG4vKipcbiAqIFN0YXJ0IHRoZSBhdWRpbyByZWNvcmRpbmdcbiAqL1xuTWljcm9waG9uZS5wcm90b3R5cGUucmVjb3JkID0gZnVuY3Rpb24oKSB7XG4gIGlmICghbmF2aWdhdG9yLmdldFVzZXJNZWRpYSl7XG4gICAgdGhpcy5vbkVycm9yKCdCcm93c2VyIGRvZXNuXFwndCBzdXBwb3J0IG1pY3JvcGhvbmUgaW5wdXQnKTtcbiAgICByZXR1cm47XG4gIH1cbiAgaWYgKHRoaXMucmVxdWVzdGVkQWNjZXNzKSB7XG4gICAgcmV0dXJuO1xuICB9XG5cbiAgdGhpcy5yZXF1ZXN0ZWRBY2Nlc3MgPSB0cnVlO1xuICBuYXZpZ2F0b3IuZ2V0VXNlck1lZGlhKHsgYXVkaW86IHRydWUgfSxcbiAgICB0aGlzLm9uTWVkaWFTdHJlYW0uYmluZCh0aGlzKSwgLy8gTWljcm9waG9uZSBwZXJtaXNzaW9uIGdyYW50ZWRcbiAgICB0aGlzLm9uUGVybWlzc2lvblJlamVjdGVkLmJpbmQodGhpcykpOyAvLyBNaWNyb3Bob25lIHBlcm1pc3Npb24gcmVqZWN0ZWRcbn07XG5cbmZ1bmN0aW9uIGZsb2F0VG8xNkJpdFBDTShvdXRwdXQsIG9mZnNldCwgaW5wdXQpe1xuICBmb3IgKHZhciBpID0gMDsgaSA8IGlucHV0Lmxlbmd0aDsgaSsrLCBvZmZzZXQrPTIpe1xuICAgIHZhciBzID0gTWF0aC5tYXgoLTEsIE1hdGgubWluKDEsIGlucHV0W2ldKSk7XG4gICAgb3V0cHV0LnNldEludDE2KG9mZnNldCwgcyA8IDAgPyBzICogMHg4MDAwIDogcyAqIDB4N0ZGRiwgdHJ1ZSk7XG4gIH1cbn1cblxuZnVuY3Rpb24gd3JpdGVTdHJpbmcodmlldywgb2Zmc2V0LCBzdHJpbmcpe1xuICBmb3IgKHZhciBpID0gMDsgaSA8IHN0cmluZy5sZW5ndGg7IGkrKyl7XG4gICAgdmlldy5zZXRVaW50OChvZmZzZXQgKyBpLCBzdHJpbmcuY2hhckNvZGVBdChpKSk7XG4gIH1cbn1cblxuZnVuY3Rpb24gZW5jb2RlV0FWKHNhbXBsZXMpe1xuICB2YXIgbnVtQ2hhbm5lbHMgPSAxO1xuICB2YXIgc2FtcGxlUmF0ZSA9IDQ0MTAwO1xuICB2YXIgYnVmZmVyID0gbmV3IEFycmF5QnVmZmVyKDQ0ICsgc2FtcGxlcy5sZW5ndGggKiAyKTtcbiAgdmFyIHZpZXcgPSBuZXcgRGF0YVZpZXcoYnVmZmVyKTtcblxuICAvKiBSSUZGIGlkZW50aWZpZXIgKi9cbiAgd3JpdGVTdHJpbmcodmlldywgMCwgJ1JJRkYnKTtcbiAgLyogUklGRiBjaHVuayBsZW5ndGggKi9cbiAgdmlldy5zZXRVaW50MzIoNCwgMzYgKyBzYW1wbGVzLmxlbmd0aCAqIDIsIHRydWUpO1xuICAvKiBSSUZGIHR5cGUgKi9cbiAgd3JpdGVTdHJpbmcodmlldywgOCwgJ1dBVkUnKTtcbiAgLyogZm9ybWF0IGNodW5rIGlkZW50aWZpZXIgKi9cbiAgd3JpdGVTdHJpbmcodmlldywgMTIsICdmbXQgJyk7XG4gIC8qIGZvcm1hdCBjaHVuayBsZW5ndGggKi9cbiAgdmlldy5zZXRVaW50MzIoMTYsIDE2LCB0cnVlKTtcbiAgLyogc2FtcGxlIGZvcm1hdCAocmF3KSAqL1xuICB2aWV3LnNldFVpbnQxNigyMCwgMSwgdHJ1ZSk7XG4gIC8qIGNoYW5uZWwgY291bnQgKi9cbiAgdmlldy5zZXRVaW50MTYoMjIsIG51bUNoYW5uZWxzLCB0cnVlKTtcbiAgLyogc2FtcGxlIHJhdGUgKi9cbiAgdmlldy5zZXRVaW50MzIoMjQsIHNhbXBsZVJhdGUsIHRydWUpO1xuICAvKiBieXRlIHJhdGUgKHNhbXBsZSByYXRlICogYmxvY2sgYWxpZ24pICovXG4gIHZpZXcuc2V0VWludDMyKDI4LCBzYW1wbGVSYXRlICogNCwgdHJ1ZSk7XG4gIC8qIGJsb2NrIGFsaWduIChjaGFubmVsIGNvdW50ICogYnl0ZXMgcGVyIHNhbXBsZSkgKi9cbiAgdmlldy5zZXRVaW50MTYoMzIsIG51bUNoYW5uZWxzICogMiwgdHJ1ZSk7XG4gIC8qIGJpdHMgcGVyIHNhbXBsZSAqL1xuICB2aWV3LnNldFVpbnQxNigzNCwgMTYsIHRydWUpO1xuICAvKiBkYXRhIGNodW5rIGlkZW50aWZpZXIgKi9cbiAgd3JpdGVTdHJpbmcodmlldywgMzYsICdkYXRhJyk7XG4gIC8qIGRhdGEgY2h1bmsgbGVuZ3RoICovXG4gIHZpZXcuc2V0VWludDMyKDQwLCBzYW1wbGVzLmxlbmd0aCAqIDIsIHRydWUpO1xuXG4gIGZsb2F0VG8xNkJpdFBDTSh2aWV3LCA0NCwgc2FtcGxlcyk7XG5cbiAgcmV0dXJuIHZpZXc7XG59XG4vKipcbiAqIFN0b3AgdGhlIGF1ZGlvIHJlY29yZGluZ1xuICovXG5NaWNyb3Bob25lLnByb3RvdHlwZS5zdG9wID0gZnVuY3Rpb24oKSB7XG4gIGlmICghdGhpcy5yZWNvcmRpbmcpXG4gICAgcmV0dXJuO1xuICB0aGlzLnJlY29yZGluZyA9IGZhbHNlO1xuICB0aGlzLnN0cmVhbS5zdG9wKCk7XG4gIHRoaXMucmVxdWVzdGVkQWNjZXNzID0gZmFsc2U7XG4gIHRoaXMubWljLmRpc2Nvbm5lY3QoMCk7XG4gIHRoaXMubWljID0gbnVsbDtcbiAgdGhpcy5vblN0b3BSZWNvcmRpbmcoKTtcblxuICB2YXIgdmlldyA9IGVuY29kZVdBVih0aGlzLnVudXNlZFNhbXBsZXMpO1xuXG4gIC8vIG91ciBmaW5hbCBiaW5hcnkgYmxvYiB0aGF0IHdlIGNhbiBoYW5kIG9mZlxuICB2YXIgYmxvYiA9IG5ldyBCbG9iICggWyB2aWV3IF0sIHsgdHlwZSA6ICdhdWRpby93YXYnIH0gKTtcbiAgdmFyIGF1ZGlvID0gbmV3IEF1ZGlvKCk7XG4gIHZhciBvYmplY3RVUkwgPSBVUkwuY3JlYXRlT2JqZWN0VVJMKGJsb2IpO1xuICBhdWRpby5zcmMgPSBvYmplY3RVUkw7XG4gIGF1ZGlvLmFkZEV2ZW50TGlzdGVuZXIoJ2Vycm9yJywgZnVuY3Rpb24gZmFpbGVkKGUpIHtcbiAgICAgICAvLyBhdWRpbyBwbGF5YmFjayBmYWlsZWQgLSBzaG93IGEgbWVzc2FnZSBzYXlpbmcgd2h5XG4gICAgICAgLy8gdG8gZ2V0IHRoZSBzb3VyY2Ugb2YgdGhlIGF1ZGlvIGVsZW1lbnQgdXNlICQodGhpcykuc3JjXG4gICAgICAgc3dpdGNoIChlLnRhcmdldC5lcnJvci5jb2RlKSB7XG4gICAgICAgICBjYXNlIGUudGFyZ2V0LmVycm9yLk1FRElBX0VSUl9BQk9SVEVEOlxuICAgICAgICAgICBjb25zb2xlLmxvZygnWW91IGFib3J0ZWQgdGhlIHZpZGVvIHBsYXliYWNrLicpO1xuICAgICAgICAgICBicmVhaztcbiAgICAgICAgIGNhc2UgZS50YXJnZXQuZXJyb3IuTUVESUFfRVJSX05FVFdPUks6XG4gICAgICAgICAgIGNvbnNvbGUubG9nKCdBIG5ldHdvcmsgZXJyb3IgY2F1c2VkIHRoZSBhdWRpbyBkb3dubG9hZCB0byBmYWlsLicpO1xuICAgICAgICAgICBicmVhaztcbiAgICAgICAgIGNhc2UgZS50YXJnZXQuZXJyb3IuTUVESUFfRVJSX0RFQ09ERTpcbiAgICAgICAgICAgY29uc29sZS5sb2coJ1RoZSBhdWRpbyBwbGF5YmFjayB3YXMgYWJvcnRlZCBkdWUgdG8gYSBjb3JydXB0aW9uIHByb2JsZW0gb3IgYmVjYXVzZSB0aGUgdmlkZW8gdXNlZCBmZWF0dXJlcyB5b3VyIGJyb3dzZXIgZGlkIG5vdCBzdXBwb3J0LicpO1xuICAgICAgICAgICBicmVhaztcbiAgICAgICAgIGNhc2UgZS50YXJnZXQuZXJyb3IuTUVESUFfRVJSX1NSQ19OT1RfU1VQUE9SVEVEOlxuICAgICAgICAgICBjb25zb2xlLmxvZygnVGhlIHZpZGVvIGF1ZGlvIG5vdCBiZSBsb2FkZWQsIGVpdGhlciBiZWNhdXNlIHRoZSBzZXJ2ZXIgb3IgbmV0d29yayBmYWlsZWQgb3IgYmVjYXVzZSB0aGUgZm9ybWF0IGlzIG5vdCBzdXBwb3J0ZWQuJyk7XG4gICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgZGVmYXVsdDpcbiAgICAgICAgICAgY29uc29sZS5sb2coJ0FuIHVua25vd24gZXJyb3Igb2NjdXJyZWQuJyk7XG4gICAgICAgICAgIGJyZWFrO1xuICAgICAgIH1cbiAgICAgfSwgdHJ1ZSk7XG4gIGF1ZGlvLnBsYXkoKTtcbiAgY29uc29sZS5sb2coJ0ZJTkFMIENPVU5UJywgdGhpcy51bnVzZWRTYW1wbGVzLmxlbmd0aCk7XG59O1xuXG4vKipcbiAqIENyZWF0ZXMgYSBCbG9iIHR5cGU6ICdhdWRpby9sMTYnIHdpdGggdGhlIGNodW5rIGFuZCBkb3duc2FtcGxpbmcgdG8gMTYga0h6XG4gKiBjb21pbmcgZnJvbSB0aGUgbWljcm9waG9uZS5cbiAqIEV4cGxhbmF0aW9uIGZvciB0aGUgbWF0aDogVGhlIHJhdyB2YWx1ZXMgY2FwdHVyZWQgZnJvbSB0aGUgV2ViIEF1ZGlvIEFQSSBhcmVcbiAqIGluIDMyLWJpdCBGbG9hdGluZyBQb2ludCwgYmV0d2VlbiAtMSBhbmQgMSAocGVyIHRoZSBzcGVjaWZpY2F0aW9uKS5cbiAqIFRoZSB2YWx1ZXMgZm9yIDE2LWJpdCBQQ00gcmFuZ2UgYmV0d2VlbiAtMzI3NjggYW5kICszMjc2NyAoMTYtYml0IHNpZ25lZCBpbnRlZ2VyKS5cbiAqIE11bHRpcGx5IHRvIGNvbnRyb2wgdGhlIHZvbHVtZSBvZiB0aGUgb3V0cHV0LiBXZSBzdG9yZSBpbiBsaXR0bGUgZW5kaWFuLlxuICogQHBhcmFtICB7T2JqZWN0fSBidWZmZXIgTWljcm9waG9uZSBhdWRpbyBjaHVua1xuICogQHJldHVybiB7QmxvYn0gJ2F1ZGlvL2wxNicgY2h1bmtcbiAqIEBkZXByZWNhdGVkIFRoaXMgbWV0aG9kIGlzIGRlcHJhY2F0ZWRcbiAqL1xuTWljcm9waG9uZS5wcm90b3R5cGUuX2V4cG9ydERhdGFCdWZmZXJUbzE2S2h6ID0gZnVuY3Rpb24oYnVmZmVyTmV3U2FtcGxlcykge1xuICB2YXIgbmV3VG90YWxMZW5ndGggPSB0aGlzLnVudXNlZFNhbXBsZXMubGVuZ3RoICsgYnVmZmVyTmV3U2FtcGxlcy5sZW5ndGg7XG4gIHZhciBuZXdBcnJheUJ1ZmZlciA9IG5ldyBGbG9hdDMyQXJyYXkobmV3VG90YWxMZW5ndGgpO1xuICBmb3IgKHZhciBpID0gMDsgaSA8IHRoaXMudW51c2VkU2FtcGxlcy5sZW5ndGg7IGkrKykge1xuICAgIG5ld0FycmF5QnVmZmVyW2ldID0gdGhpcy51bnVzZWRTYW1wbGVzW2ldO1xuICB9XG4gIGZvciAodmFyIGogPSAwOyBqIDwgYnVmZmVyTmV3U2FtcGxlcy5sZW5ndGg7IGorKykge1xuICAgIG5ld0FycmF5QnVmZmVyW2ogKyB0aGlzLnVudXNlZFNhbXBsZXMubGVuZ3RoXSA9IGJ1ZmZlck5ld1NhbXBsZXNbal07XG4gIH1cbiAgdGhpcy51bnVzZWRTYW1wbGVzID0gbmV3QXJyYXlCdWZmZXI7XG4gIHZhciBidWZmZXIgPSBudWxsLFxuICAgIG5ld1NhbXBsZXMgPSBidWZmZXJOZXdTYW1wbGVzLmxlbmd0aCxcbiAgICAvLyB1bnVzZWRTYW1wbGVzID0gdGhpcy5idWZmZXJVbnVzZWRTYW1wbGVzLmxlbmd0aDtcblxuICAvLyBpZiAodW51c2VkU2FtcGxlcyA+IDApIHtcbiAgLy8gICBidWZmZXIgPSBuZXcgRmxvYXQzMkFycmF5KG5ld1NhbXBsZXMpO1xuICAvLyAgIGZvciAodmFyIGkgPSAwOyBpIDwgdW51c2VkU2FtcGxlczsgKytpKSB7XG4gIC8vICAgICBidWZmZXJbaV0gPSB0aGlzLmJ1ZmZlclVudXNlZFNhbXBsZXNbaV07XG4gIC8vICAgfVxuICAvLyAgIGZvciAoaSA9IDA7IGkgPCBuZXdTYW1wbGVzOyArK2kpIHtcbiAgLy8gICAgIGJ1ZmZlclt1bnVzZWRTYW1wbGVzICsgaV0gPSBidWZmZXJOZXdTYW1wbGVzW2ldO1xuICAvLyAgIH1cbiAgLy8gfSBlbHNlIHtcbiAgLy8gICBidWZmZXIgPSBidWZmZXJOZXdTYW1wbGVzO1xuICAvLyB9XG4gIGJ1ZmZlciA9IGJ1ZmZlck5ld1NhbXBsZXM7XG5cbiAgLy8gZG93bnNhbXBsaW5nIHZhcmlhYmxlc1xuICB2YXIgZmlsdGVyID0gW1xuICAgICAgLTAuMDM3OTM1LCAtMC4wMDA4OTAyNCwgMC4wNDAxNzMsIDAuMDE5OTg5LCAwLjAwNDc3OTIsIC0wLjA1ODY3NSwgLTAuMDU2NDg3LFxuICAgICAgLTAuMDA0MDY1MywgMC4xNDUyNywgMC4yNjkyNywgMC4zMzkxMywgMC4yNjkyNywgMC4xNDUyNywgLTAuMDA0MDY1MywgLTAuMDU2NDg3LFxuICAgICAgLTAuMDU4Njc1LCAwLjAwNDc3OTIsIDAuMDE5OTg5LCAwLjA0MDE3MywgLTAuMDAwODkwMjQsIC0wLjAzNzkzNVxuICAgIF0sXG4gICAgc2FtcGxpbmdSYXRlUmF0aW8gPSB0aGlzLmF1ZGlvQ29udGV4dC5zYW1wbGVSYXRlIC8gMTYwMDAsXG4gICAgbk91dHB1dFNhbXBsZXMgPSBNYXRoLmZsb29yKChidWZmZXIubGVuZ3RoIC0gZmlsdGVyLmxlbmd0aCkgLyAoc2FtcGxpbmdSYXRlUmF0aW8pKSArIDEsXG4gICAgcGNtRW5jb2RlZEJ1ZmZlcjE2ayA9IG5ldyBBcnJheUJ1ZmZlcihuT3V0cHV0U2FtcGxlcyAqIDIpLFxuICAgIGRhdGFWaWV3MTZrID0gbmV3IERhdGFWaWV3KHBjbUVuY29kZWRCdWZmZXIxNmspLFxuICAgIGluZGV4ID0gMCxcbiAgICB2b2x1bWUgPSAweDdGRkYsIC8vcmFuZ2UgZnJvbSAwIHRvIDB4N0ZGRiB0byBjb250cm9sIHRoZSB2b2x1bWVcbiAgICBuT3V0ID0gMDtcblxuICBmb3IgKHZhciBpID0gMDsgaSArIGZpbHRlci5sZW5ndGggLSAxIDwgYnVmZmVyLmxlbmd0aDsgaSA9IE1hdGgucm91bmQoc2FtcGxpbmdSYXRlUmF0aW8gKiBuT3V0KSkge1xuICAgIHZhciBzYW1wbGUgPSAwO1xuICAgIGZvciAodmFyIGogPSAwOyBqIDwgZmlsdGVyLmxlbmd0aDsgKytqKSB7XG4gICAgICBzYW1wbGUgKz0gYnVmZmVyW2kgKyBqXSAqIGZpbHRlcltqXTtcbiAgICB9XG4gICAgc2FtcGxlICo9IHZvbHVtZTtcbiAgICBkYXRhVmlldzE2ay5zZXRJbnQxNihpbmRleCwgc2FtcGxlLCB0cnVlKTsgLy8gJ3RydWUnIC0+IG1lYW5zIGxpdHRsZSBlbmRpYW5cbiAgICBpbmRleCArPSAyO1xuICAgIG5PdXQrKztcbiAgfVxuXG4gIC8vIHZhciBpbmRleFNhbXBsZUFmdGVyTGFzdFVzZWQgPSBNYXRoLnJvdW5kKHNhbXBsaW5nUmF0ZVJhdGlvICogbk91dCk7XG4gIC8vIHZhciByZW1haW5pbmcgPSBidWZmZXIubGVuZ3RoIC0gaW5kZXhTYW1wbGVBZnRlckxhc3RVc2VkO1xuICAvLyBpZiAocmVtYWluaW5nID4gMCkge1xuICAvLyAgIHRoaXMuYnVmZmVyVW51c2VkU2FtcGxlcyA9IG5ldyBGbG9hdDMyQXJyYXkocmVtYWluaW5nKTtcbiAgLy8gICBmb3IgKGkgPSAwOyBpIDwgcmVtYWluaW5nOyArK2kpIHtcbiAgLy8gICAgIHRoaXMuYnVmZmVyVW51c2VkU2FtcGxlc1tpXSA9IGJ1ZmZlcltpbmRleFNhbXBsZUFmdGVyTGFzdFVzZWQgKyBpXTtcbiAgLy8gICB9XG4gIC8vIH0gZWxzZSB7XG4gIC8vICAgdGhpcy5idWZmZXJVbnVzZWRTYW1wbGVzID0gbmV3IEZsb2F0MzJBcnJheSgwKTtcbiAgLy8gfVxuXG4gIHJldHVybiBuZXcgQmxvYihbZGF0YVZpZXcxNmtdLCB7XG4gICAgdHlwZTogJ2F1ZGlvL2wxNidcbiAgfSk7XG4gIH07XG5cbi8qKlxuICogQ3JlYXRlcyBhIEJsb2IgdHlwZTogJ2F1ZGlvL2wxNicgd2l0aCB0aGVcbiAqIGNodW5rIGNvbWluZyBmcm9tIHRoZSBtaWNyb3Bob25lLlxuICovXG52YXIgZXhwb3J0RGF0YUJ1ZmZlciA9IGZ1bmN0aW9uKGJ1ZmZlciwgYnVmZmVyU2l6ZSkge1xuICB2YXIgcGNtRW5jb2RlZEJ1ZmZlciA9IG51bGwsXG4gICAgZGF0YVZpZXcgPSBudWxsLFxuICAgIGluZGV4ID0gMCxcbiAgICB2b2x1bWUgPSAweDdGRkY7IC8vcmFuZ2UgZnJvbSAwIHRvIDB4N0ZGRiB0byBjb250cm9sIHRoZSB2b2x1bWVcblxuICBwY21FbmNvZGVkQnVmZmVyID0gbmV3IEFycmF5QnVmZmVyKGJ1ZmZlclNpemUgKiAyKTtcbiAgZGF0YVZpZXcgPSBuZXcgRGF0YVZpZXcocGNtRW5jb2RlZEJ1ZmZlcik7XG5cbiAgLyogRXhwbGFuYXRpb24gZm9yIHRoZSBtYXRoOiBUaGUgcmF3IHZhbHVlcyBjYXB0dXJlZCBmcm9tIHRoZSBXZWIgQXVkaW8gQVBJIGFyZVxuICAgKiBpbiAzMi1iaXQgRmxvYXRpbmcgUG9pbnQsIGJldHdlZW4gLTEgYW5kIDEgKHBlciB0aGUgc3BlY2lmaWNhdGlvbikuXG4gICAqIFRoZSB2YWx1ZXMgZm9yIDE2LWJpdCBQQ00gcmFuZ2UgYmV0d2VlbiAtMzI3NjggYW5kICszMjc2NyAoMTYtYml0IHNpZ25lZCBpbnRlZ2VyKS5cbiAgICogTXVsdGlwbHkgdG8gY29udHJvbCB0aGUgdm9sdW1lIG9mIHRoZSBvdXRwdXQuIFdlIHN0b3JlIGluIGxpdHRsZSBlbmRpYW4uXG4gICAqL1xuICBmb3IgKHZhciBpID0gMDsgaSA8IGJ1ZmZlci5sZW5ndGg7IGkrKykge1xuICAgIGRhdGFWaWV3LnNldEludDE2KGluZGV4LCBidWZmZXJbaV0gKiB2b2x1bWUsIHRydWUpO1xuICAgIGluZGV4ICs9IDI7XG4gIH1cblxuICAvLyBsMTYgaXMgdGhlIE1JTUUgdHlwZSBmb3IgMTYtYml0IFBDTVxuICByZXR1cm4gbmV3IEJsb2IoW2RhdGFWaWV3XSwgeyB0eXBlOiAnYXVkaW8vbDE2JyB9KTtcbn07XG5cbk1pY3JvcGhvbmUucHJvdG90eXBlLl9leHBvcnREYXRhQnVmZmVyID0gZnVuY3Rpb24oYnVmZmVyKXtcbiAgdXRpbHMuZXhwb3J0RGF0YUJ1ZmZlcihidWZmZXIsIHRoaXMuYnVmZmVyU2l6ZSk7XG59OyBcblxuXG4vLyBGdW5jdGlvbnMgdXNlZCB0byBjb250cm9sIE1pY3JvcGhvbmUgZXZlbnRzIGxpc3RlbmVycy5cbk1pY3JvcGhvbmUucHJvdG90eXBlLm9uU3RhcnRSZWNvcmRpbmcgPSAgZnVuY3Rpb24oKSB7fTtcbk1pY3JvcGhvbmUucHJvdG90eXBlLm9uU3RvcFJlY29yZGluZyA9ICBmdW5jdGlvbigpIHt9O1xuTWljcm9waG9uZS5wcm90b3R5cGUub25BdWRpbyA9ICBmdW5jdGlvbigpIHt9O1xuXG5tb2R1bGUuZXhwb3J0cyA9IE1pY3JvcGhvbmU7IiwibW9kdWxlLmV4cG9ydHM9e1xuICAgXCJtb2RlbHNcIjogW1xuICAgICAge1xuICAgICAgICAgXCJ1cmxcIjogXCJodHRwczovL3N0cmVhbS53YXRzb25wbGF0Zm9ybS5uZXQvc3BlZWNoLXRvLXRleHQvYXBpL3YxL21vZGVscy9lbi1VU19Ccm9hZGJhbmRNb2RlbFwiLCBcbiAgICAgICAgIFwicmF0ZVwiOiAxNjAwMCwgXG4gICAgICAgICBcIm5hbWVcIjogXCJlbi1VU19Ccm9hZGJhbmRNb2RlbFwiLCBcbiAgICAgICAgIFwibGFuZ3VhZ2VcIjogXCJlbi1VU1wiLCBcbiAgICAgICAgIFwiZGVzY3JpcHRpb25cIjogXCJVUyBFbmdsaXNoIGJyb2FkYmFuZCBtb2RlbCAoMTZLSHopXCJcbiAgICAgIH0sIFxuICAgICAge1xuICAgICAgICAgXCJ1cmxcIjogXCJodHRwczovL3N0cmVhbS53YXRzb25wbGF0Zm9ybS5uZXQvc3BlZWNoLXRvLXRleHQvYXBpL3YxL21vZGVscy9lbi1VU19OYXJyb3diYW5kTW9kZWxcIiwgXG4gICAgICAgICBcInJhdGVcIjogODAwMCwgXG4gICAgICAgICBcIm5hbWVcIjogXCJlbi1VU19OYXJyb3diYW5kTW9kZWxcIiwgXG4gICAgICAgICBcImxhbmd1YWdlXCI6IFwiZW4tVVNcIiwgXG4gICAgICAgICBcImRlc2NyaXB0aW9uXCI6IFwiVVMgRW5nbGlzaCBuYXJyb3diYW5kIG1vZGVsICg4S0h6KVwiXG4gICAgICB9LFxuICAgICAge1xuICAgICAgICAgXCJ1cmxcIjogXCJodHRwczovL3N0cmVhbS53YXRzb25wbGF0Zm9ybS5uZXQvc3BlZWNoLXRvLXRleHQvYXBpL3YxL21vZGVscy9lcy1FU19Ccm9hZGJhbmRNb2RlbFwiLCBcbiAgICAgICAgIFwicmF0ZVwiOiAxNjAwMCwgXG4gICAgICAgICBcIm5hbWVcIjogXCJlcy1FU19Ccm9hZGJhbmRNb2RlbFwiLCBcbiAgICAgICAgIFwibGFuZ3VhZ2VcIjogXCJlcy1FU1wiLCBcbiAgICAgICAgIFwiZGVzY3JpcHRpb25cIjogXCJTcGFuaXNoIGJyb2FkYmFuZCBtb2RlbCAoMTZLSHopXCJcbiAgICAgIH0sIFxuICAgICAge1xuICAgICAgICAgXCJ1cmxcIjogXCJodHRwczovL3N0cmVhbS53YXRzb25wbGF0Zm9ybS5uZXQvc3BlZWNoLXRvLXRleHQvYXBpL3YxL21vZGVscy9lcy1FU19OYXJyb3diYW5kTW9kZWxcIiwgXG4gICAgICAgICBcInJhdGVcIjogODAwMCwgXG4gICAgICAgICBcIm5hbWVcIjogXCJlcy1FU19OYXJyb3diYW5kTW9kZWxcIiwgXG4gICAgICAgICBcImxhbmd1YWdlXCI6IFwiZXMtRVNcIiwgXG4gICAgICAgICBcImRlc2NyaXB0aW9uXCI6IFwiU3BhbmlzaCBuYXJyb3diYW5kIG1vZGVsICg4S0h6KVwiXG4gICAgICB9LCBcbiAgICAgIHtcbiAgICAgICAgIFwidXJsXCI6IFwiaHR0cHM6Ly9zdHJlYW0ud2F0c29ucGxhdGZvcm0ubmV0L3NwZWVjaC10by10ZXh0L2FwaS92MS9tb2RlbHMvamEtSlBfQnJvYWRiYW5kTW9kZWxcIiwgXG4gICAgICAgICBcInJhdGVcIjogMTYwMDAsIFxuICAgICAgICAgXCJuYW1lXCI6IFwiamEtSlBfQnJvYWRiYW5kTW9kZWxcIiwgXG4gICAgICAgICBcImxhbmd1YWdlXCI6IFwiamEtSlBcIiwgXG4gICAgICAgICBcImRlc2NyaXB0aW9uXCI6IFwiSmFwYW5lc2UgYnJvYWRiYW5kIG1vZGVsICgxNktIeilcIlxuICAgICAgfSwgXG4gICAgICB7XG4gICAgICAgICBcInVybFwiOiBcImh0dHBzOi8vc3RyZWFtLndhdHNvbnBsYXRmb3JtLm5ldC9zcGVlY2gtdG8tdGV4dC9hcGkvdjEvbW9kZWxzL2phLUpQX05hcnJvd2JhbmRNb2RlbFwiLCBcbiAgICAgICAgIFwicmF0ZVwiOiA4MDAwLCBcbiAgICAgICAgIFwibmFtZVwiOiBcImphLUpQX05hcnJvd2JhbmRNb2RlbFwiLCBcbiAgICAgICAgIFwibGFuZ3VhZ2VcIjogXCJqYS1KUFwiLCBcbiAgICAgICAgIFwiZGVzY3JpcHRpb25cIjogXCJKYXBhbmVzZSBuYXJyb3diYW5kIG1vZGVsICg4S0h6KVwiXG4gICAgICB9XG4gICBdXG59XG4iLCJcbnZhciBlZmZlY3RzID0gcmVxdWlyZSgnLi92aWV3cy9lZmZlY3RzJyk7XG52YXIgZGlzcGxheSA9IHJlcXVpcmUoJy4vdmlld3MvZGlzcGxheW1ldGFkYXRhJyk7XG52YXIgaGlkZUVycm9yID0gcmVxdWlyZSgnLi92aWV3cy9zaG93ZXJyb3InKS5oaWRlRXJyb3I7XG52YXIgaW5pdFNvY2tldCA9IHJlcXVpcmUoJy4vc29ja2V0JykuaW5pdFNvY2tldDtcblxuZXhwb3J0cy5oYW5kbGVGaWxlVXBsb2FkID0gZnVuY3Rpb24odG9rZW4sIG1vZGVsLCBmaWxlLCBjb250ZW50VHlwZSwgY2FsbGJhY2ssIG9uZW5kKSB7XG5cbiAgICAvLyBTZXQgY3VycmVudGx5RGlzcGxheWluZyB0byBwcmV2ZW50IG90aGVyIHNvY2tldHMgZnJvbSBvcGVuaW5nXG4gICAgbG9jYWxTdG9yYWdlLnNldEl0ZW0oJ2N1cnJlbnRseURpc3BsYXlpbmcnLCB0cnVlKTtcblxuICAgIC8vICQoJyNwcm9ncmVzc0luZGljYXRvcicpLmNzcygndmlzaWJpbGl0eScsICd2aXNpYmxlJyk7XG5cbiAgICAkLnN1YnNjcmliZSgncHJvZ3Jlc3MnLCBmdW5jdGlvbihldnQsIGRhdGEpIHtcbiAgICAgIGNvbnNvbGUubG9nKCdwcm9ncmVzczogJywgZGF0YSk7XG4gICAgfSk7XG5cbiAgICBjb25zb2xlLmxvZygnY29udGVudFR5cGUnLCBjb250ZW50VHlwZSk7XG5cbiAgICB2YXIgYmFzZVN0cmluZyA9ICcnO1xuICAgIHZhciBiYXNlSlNPTiA9ICcnO1xuXG4gICAgdmFyIG9wdGlvbnMgPSB7fTtcbiAgICBvcHRpb25zLnRva2VuID0gdG9rZW47XG4gICAgb3B0aW9ucy5tZXNzYWdlID0ge1xuICAgICAgJ2FjdGlvbic6ICdzdGFydCcsXG4gICAgICAnY29udGVudC10eXBlJzogY29udGVudFR5cGUsXG4gICAgICAnaW50ZXJpbV9yZXN1bHRzJzogdHJ1ZSxcbiAgICAgICdjb250aW51b3VzJzogdHJ1ZSxcbiAgICAgICd3b3JkX2NvbmZpZGVuY2UnOiB0cnVlLFxuICAgICAgJ3RpbWVzdGFtcHMnOiB0cnVlLFxuICAgICAgJ21heF9hbHRlcm5hdGl2ZXMnOiAzXG4gICAgfTtcbiAgICBvcHRpb25zLm1vZGVsID0gbW9kZWw7XG5cbiAgICBmdW5jdGlvbiBvbk9wZW4oc29ja2V0KSB7XG4gICAgICBjb25zb2xlLmxvZygnU29ja2V0IG9wZW5lZCcpO1xuICAgIH1cblxuICAgIGZ1bmN0aW9uIG9uTGlzdGVuaW5nKHNvY2tldCkge1xuICAgICAgY29uc29sZS5sb2coJ1NvY2tldCBsaXN0ZW5pbmcnKTtcbiAgICAgIGNhbGxiYWNrKHNvY2tldCk7XG4gICAgfVxuXG4gICAgZnVuY3Rpb24gb25NZXNzYWdlKG1zZykge1xuICAgICAgaWYgKG1zZy5yZXN1bHRzKSB7XG4gICAgICAgIC8vIENvbnZlcnQgdG8gY2xvc3VyZSBhcHByb2FjaFxuICAgICAgICBiYXNlU3RyaW5nID0gZGlzcGxheS5zaG93UmVzdWx0KG1zZywgYmFzZVN0cmluZyk7XG4gICAgICAgIGJhc2VKU09OID0gZGlzcGxheS5zaG93SlNPTihtc2csIGJhc2VKU09OKTtcbiAgICAgIH1cbiAgICB9XG5cbiAgICBmdW5jdGlvbiBvbkVycm9yKGV2dCkge1xuICAgICAgbG9jYWxTdG9yYWdlLnNldEl0ZW0oJ2N1cnJlbnRseURpc3BsYXlpbmcnLCBmYWxzZSk7XG4gICAgICBvbmVuZChldnQpO1xuICAgICAgY29uc29sZS5sb2coJ1NvY2tldCBlcnI6ICcsIGV2dC5jb2RlKTtcbiAgICB9XG5cbiAgICBmdW5jdGlvbiBvbkNsb3NlKGV2dCkge1xuICAgICAgbG9jYWxTdG9yYWdlLnNldEl0ZW0oJ2N1cnJlbnRseURpc3BsYXlpbmcnLCBmYWxzZSk7XG4gICAgICBvbmVuZChldnQpO1xuICAgICAgY29uc29sZS5sb2coJ1NvY2tldCBjbG9zaW5nOiAnLCBldnQpO1xuICAgIH1cblxuICAgIGluaXRTb2NrZXQob3B0aW9ucywgb25PcGVuLCBvbkxpc3RlbmluZywgb25NZXNzYWdlLCBvbkVycm9yLCBvbkNsb3NlKTtcblxuICB9XG4iLCJcbid1c2Ugc3RyaWN0JztcblxudmFyIGluaXRTb2NrZXQgPSByZXF1aXJlKCcuL3NvY2tldCcpLmluaXRTb2NrZXQ7XG52YXIgZGlzcGxheSA9IHJlcXVpcmUoJy4vdmlld3MvZGlzcGxheW1ldGFkYXRhJyk7XG5cbmV4cG9ydHMuaGFuZGxlTWljcm9waG9uZSA9IGZ1bmN0aW9uKHRva2VuLCBtb2RlbCwgbWljLCBjYWxsYmFjaykge1xuXG4gIGlmIChtb2RlbC5pbmRleE9mKCdOYXJyb3diYW5kJykgPiAtMSkge1xuICAgIHZhciBlcnIgPSBuZXcgRXJyb3IoJ01pY3JvcGhvbmUgdHJhbnNjcmlwdGlvbiBjYW5ub3QgYWNjb21vZGF0ZSBuYXJyb3diYW5kIG1vZGVscywgcGxlYXNlIHNlbGVjdCBhbm90aGVyJyk7XG4gICAgY2FsbGJhY2soZXJyLCBudWxsKTtcbiAgICByZXR1cm4gZmFsc2U7XG4gIH1cblxuICAkLnB1Ymxpc2goJ2NsZWFyc2NyZWVuJyk7XG5cbiAgLy8gVGVzdCBvdXQgd2Vic29ja2V0XG4gIHZhciBiYXNlU3RyaW5nID0gJyc7XG4gIHZhciBiYXNlSlNPTiA9ICcnO1xuXG4gIHZhciBvcHRpb25zID0ge307XG4gIG9wdGlvbnMudG9rZW4gPSB0b2tlbjtcbiAgb3B0aW9ucy5tZXNzYWdlID0ge1xuICAgICdhY3Rpb24nOiAnc3RhcnQnLFxuICAgICdjb250ZW50LXR5cGUnOiAnYXVkaW8vbDE2O3JhdGU9MTYwMDAnLFxuICAgICdpbnRlcmltX3Jlc3VsdHMnOiB0cnVlLFxuICAgICdjb250aW51b3VzJzogdHJ1ZSxcbiAgICAnd29yZF9jb25maWRlbmNlJzogdHJ1ZSxcbiAgICAndGltZXN0YW1wcyc6IHRydWUsXG4gICAgJ21heF9hbHRlcm5hdGl2ZXMnOiAzXG4gIH07XG4gIG9wdGlvbnMubW9kZWwgPSBtb2RlbDtcblxuICBmdW5jdGlvbiBvbk9wZW4oc29ja2V0KSB7XG4gICAgY29uc29sZS5sb2coJ01pYyBzb2NrZXQ6IG9wZW5lZCcpO1xuICAgIGNhbGxiYWNrKG51bGwsIHNvY2tldCk7XG4gIH1cblxuICBmdW5jdGlvbiBvbkxpc3RlbmluZyhzb2NrZXQpIHtcblxuICAgIG1pYy5vbkF1ZGlvID0gZnVuY3Rpb24oYmxvYikge1xuICAgICAgaWYgKHNvY2tldC5yZWFkeVN0YXRlIDwgMikge1xuICAgICAgICBzb2NrZXQuc2VuZChibG9iKVxuICAgICAgfVxuICAgIH07XG4gIH1cblxuICBmdW5jdGlvbiBvbk1lc3NhZ2UobXNnLCBzb2NrZXQpIHtcbiAgICBjb25zb2xlLmxvZygnTWljIHNvY2tldCBtc2c6ICcsIG1zZyk7XG4gICAgaWYgKG1zZy5yZXN1bHRzKSB7XG4gICAgICAvLyBDb252ZXJ0IHRvIGNsb3N1cmUgYXBwcm9hY2hcbiAgICAgIGJhc2VTdHJpbmcgPSBkaXNwbGF5LnNob3dSZXN1bHQobXNnLCBiYXNlU3RyaW5nKTtcbiAgICAgIGJhc2VKU09OID0gZGlzcGxheS5zaG93SlNPTihtc2csIGJhc2VKU09OKTtcbiAgICB9XG4gIH1cblxuICBmdW5jdGlvbiBvbkVycm9yKHIsIHNvY2tldCkge1xuICAgIGNvbnNvbGUubG9nKCdNaWMgc29ja2V0IGVycjogJywgZXJyKTtcbiAgfVxuXG4gIGZ1bmN0aW9uIG9uQ2xvc2UoZXZ0KSB7XG4gICAgY29uc29sZS5sb2coJ01pYyBzb2NrZXQgY2xvc2U6ICcsIGV2dCk7XG4gIH1cblxuICBpbml0U29ja2V0KG9wdGlvbnMsIG9uT3Blbiwgb25MaXN0ZW5pbmcsIG9uTWVzc2FnZSwgb25FcnJvciwgb25DbG9zZSk7XG5cbn1cbiIsIi8qKlxuICogQ29weXJpZ2h0IDIwMTQgSUJNIENvcnAuIEFsbCBSaWdodHMgUmVzZXJ2ZWQuXG4gKlxuICogTGljZW5zZWQgdW5kZXIgdGhlIEFwYWNoZSBMaWNlbnNlLCBWZXJzaW9uIDIuMCAodGhlIFwiTGljZW5zZVwiKTtcbiAqIHlvdSBtYXkgbm90IHVzZSB0aGlzIGZpbGUgZXhjZXB0IGluIGNvbXBsaWFuY2Ugd2l0aCB0aGUgTGljZW5zZS5cbiAqIFlvdSBtYXkgb2J0YWluIGEgY29weSBvZiB0aGUgTGljZW5zZSBhdFxuICpcbiAqICAgICAgaHR0cDovL3d3dy5hcGFjaGUub3JnL2xpY2Vuc2VzL0xJQ0VOU0UtMi4wXG4gKlxuICogVW5sZXNzIHJlcXVpcmVkIGJ5IGFwcGxpY2FibGUgbGF3IG9yIGFncmVlZCB0byBpbiB3cml0aW5nLCBzb2Z0d2FyZVxuICogZGlzdHJpYnV0ZWQgdW5kZXIgdGhlIExpY2Vuc2UgaXMgZGlzdHJpYnV0ZWQgb24gYW4gXCJBUyBJU1wiIEJBU0lTLFxuICogV0lUSE9VVCBXQVJSQU5USUVTIE9SIENPTkRJVElPTlMgT0YgQU5ZIEtJTkQsIGVpdGhlciBleHByZXNzIG9yIGltcGxpZWQuXG4gKiBTZWUgdGhlIExpY2Vuc2UgZm9yIHRoZSBzcGVjaWZpYyBsYW5ndWFnZSBnb3Zlcm5pbmcgcGVybWlzc2lvbnMgYW5kXG4gKiBsaW1pdGF0aW9ucyB1bmRlciB0aGUgTGljZW5zZS5cbiAqL1xuLypnbG9iYWwgJDpmYWxzZSAqL1xuXG5cbnZhciB1dGlscyA9IHJlcXVpcmUoJy4vdXRpbHMnKTtcbnZhciBNaWNyb3Bob25lID0gcmVxdWlyZSgnLi9NaWNyb3Bob25lJyk7XG52YXIgc2hvd2Vycm9yID0gcmVxdWlyZSgnLi92aWV3cy9zaG93ZXJyb3InKTtcbnZhciBzaG93RXJyb3IgPSBzaG93ZXJyb3Iuc2hvd0Vycm9yO1xudmFyIGhpZGVFcnJvciA9IHNob3dlcnJvci5oaWRlRXJyb3I7XG5cbi8vIE1pbmkgV1MgY2FsbGJhY2sgQVBJLCBzbyB3ZSBjYW4gaW5pdGlhbGl6ZVxuLy8gd2l0aCBtb2RlbCBhbmQgdG9rZW4gaW4gVVJJLCBwbHVzXG4vLyBzdGFydCBtZXNzYWdlXG5cbi8vIEluaXRpYWxpemUgY2xvc3VyZSwgd2hpY2ggaG9sZHMgbWF4aW11bSBnZXRUb2tlbiBjYWxsIGNvdW50XG52YXIgdG9rZW5HZW5lcmF0b3IgPSB1dGlscy5jcmVhdGVUb2tlbkdlbmVyYXRvcigpO1xuXG52YXIgaW5pdFNvY2tldCA9IGV4cG9ydHMuaW5pdFNvY2tldCA9IGZ1bmN0aW9uKG9wdGlvbnMsIG9ub3Blbiwgb25saXN0ZW5pbmcsIG9ubWVzc2FnZSwgb25lcnJvciwgb25jbG9zZSkge1xuICB2YXIgbGlzdGVuaW5nO1xuICBmdW5jdGlvbiB3aXRoRGVmYXVsdCh2YWwsIGRlZmF1bHRWYWwpIHtcbiAgICByZXR1cm4gdHlwZW9mIHZhbCA9PT0gJ3VuZGVmaW5lZCcgPyBkZWZhdWx0VmFsIDogdmFsO1xuICB9XG4gIHZhciBzb2NrZXQ7XG4gIHZhciB0b2tlbiA9IG9wdGlvbnMudG9rZW47XG4gIHZhciBtb2RlbCA9IG9wdGlvbnMubW9kZWwgfHwgbG9jYWxTdG9yYWdlLmdldEl0ZW0oJ2N1cnJlbnRNb2RlbCcpO1xuICB2YXIgbWVzc2FnZSA9IG9wdGlvbnMubWVzc2FnZSB8fCB7J2FjdGlvbic6ICdzdGFydCd9O1xuICB2YXIgc2Vzc2lvblBlcm1pc3Npb25zID0gd2l0aERlZmF1bHQob3B0aW9ucy5zZXNzaW9uUGVybWlzc2lvbnMsIEpTT04ucGFyc2UobG9jYWxTdG9yYWdlLmdldEl0ZW0oJ3Nlc3Npb25QZXJtaXNzaW9ucycpKSk7XG4gIHZhciBzZXNzaW9uUGVybWlzc2lvbnNRdWVyeVBhcmFtID0gc2Vzc2lvblBlcm1pc3Npb25zID8gJzAnIDogJzEnO1xuICB2YXIgdXJsID0gb3B0aW9ucy5zZXJ2aWNlVVJJIHx8ICd3c3M6Ly9zdHJlYW0ud2F0c29ucGxhdGZvcm0ubmV0L3NwZWVjaC10by10ZXh0L2FwaS92MS9yZWNvZ25pemU/d2F0c29uLXRva2VuPSdcbiAgICArIHRva2VuXG4gICAgKyAnJlgtV0RDLVBMLU9QVC1PVVQ9JyArIHNlc3Npb25QZXJtaXNzaW9uc1F1ZXJ5UGFyYW1cbiAgICArICcmbW9kZWw9JyArIG1vZGVsO1xuICBjb25zb2xlLmxvZygnVVJMIG1vZGVsJywgbW9kZWwpO1xuICB0cnkge1xuICAgIHNvY2tldCA9IG5ldyBXZWJTb2NrZXQodXJsKTtcbiAgfSBjYXRjaChlcnIpIHtcbiAgICBjb25zb2xlLmVycm9yKCdXUyBjb25uZWN0aW9uIGVycm9yOiAnLCBlcnIpO1xuICB9XG4gIHNvY2tldC5vbm9wZW4gPSBmdW5jdGlvbihldnQpIHtcbiAgICBsaXN0ZW5pbmcgPSBmYWxzZTtcbiAgICAkLnN1YnNjcmliZSgnaGFyZHNvY2tldHN0b3AnLCBmdW5jdGlvbihkYXRhKSB7XG4gICAgICBjb25zb2xlLmxvZygnTUlDUk9QSE9ORTogY2xvc2UuJyk7XG4gICAgICBzb2NrZXQuc2VuZChKU09OLnN0cmluZ2lmeSh7YWN0aW9uOidzdG9wJ30pKTtcbiAgICB9KTtcbiAgICAkLnN1YnNjcmliZSgnc29ja2V0c3RvcCcsIGZ1bmN0aW9uKGRhdGEpIHtcbiAgICAgIGNvbnNvbGUubG9nKCdNSUNST1BIT05FOiBjbG9zZS4nKTtcbiAgICAgIHNvY2tldC5jbG9zZSgpO1xuICAgIH0pO1xuICAgIHNvY2tldC5zZW5kKEpTT04uc3RyaW5naWZ5KG1lc3NhZ2UpKTtcbiAgICBvbm9wZW4oc29ja2V0KTtcbiAgfTtcbiAgc29ja2V0Lm9ubWVzc2FnZSA9IGZ1bmN0aW9uKGV2dCkge1xuICAgIHZhciBtc2cgPSBKU09OLnBhcnNlKGV2dC5kYXRhKTtcbiAgICBpZiAobXNnLmVycm9yKSB7XG4gICAgICBzaG93RXJyb3IobXNnLmVycm9yKTtcbiAgICAgICQucHVibGlzaCgnaGFyZHNvY2tldHN0b3AnKTtcbiAgICAgIHJldHVybjtcbiAgICB9XG4gICAgaWYgKG1zZy5zdGF0ZSA9PT0gJ2xpc3RlbmluZycpIHtcbiAgICAgIC8vIEVhcmx5IGN1dCBvZmYsIHdpdGhvdXQgbm90aWZpY2F0aW9uXG4gICAgICBpZiAoIWxpc3RlbmluZykge1xuICAgICAgICBvbmxpc3RlbmluZyhzb2NrZXQpO1xuICAgICAgICBsaXN0ZW5pbmcgPSB0cnVlO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgY29uc29sZS5sb2coJ01JQ1JPUEhPTkU6IENsb3Npbmcgc29ja2V0LicpO1xuICAgICAgICBzb2NrZXQuY2xvc2UoKTtcbiAgICAgIH1cbiAgICB9XG4gICAgb25tZXNzYWdlKG1zZywgc29ja2V0KTtcbiAgfTtcblxuICBzb2NrZXQub25lcnJvciA9IGZ1bmN0aW9uKGV2dCkge1xuICAgIGNvbnNvbGUubG9nKCdXUyBvbmVycm9yOiAnLCBldnQpO1xuICAgIHNob3dFcnJvcignQXBwbGljYXRpb24gZXJyb3IgJyArIGV2dC5jb2RlICsgJzogcGxlYXNlIHJlZnJlc2ggeW91ciBicm93c2VyIGFuZCB0cnkgYWdhaW4nKTtcbiAgICAkLnB1Ymxpc2goJ2NsZWFyc2NyZWVuJyk7XG4gICAgb25lcnJvcihldnQpO1xuICB9O1xuXG4gIHNvY2tldC5vbmNsb3NlID0gZnVuY3Rpb24oZXZ0KSB7XG4gICAgY29uc29sZS5sb2coJ1dTIG9uY2xvc2U6ICcsIGV2dCk7XG4gICAgaWYgKGV2dC5jb2RlID09PSAxMDA2KSB7XG4gICAgICAvLyBBdXRoZW50aWNhdGlvbiBlcnJvciwgdHJ5IHRvIHJlY29ubmVjdFxuICAgICAgY29uc29sZS5sb2coJ2dlbmVyYXRvciBjb3VudCcsIHRva2VuR2VuZXJhdG9yLmdldENvdW50KCkpO1xuICAgICAgaWYgKHRva2VuR2VuZXJhdG9yLmdldENvdW50KCkgPiAxKSB7XG4gICAgICAgICQucHVibGlzaCgnaGFyZHNvY2tldHN0b3AnKTtcbiAgICAgICAgdGhyb3cgbmV3IEVycm9yKFwiTm8gYXV0aG9yaXphdGlvbiB0b2tlbiBpcyBjdXJyZW50bHkgYXZhaWxhYmxlXCIpO1xuICAgICAgfVxuICAgICAgdG9rZW5HZW5lcmF0b3IuZ2V0VG9rZW4oZnVuY3Rpb24odG9rZW4sIGVycikge1xuICAgICAgICBpZiAoZXJyKSB7XG4gICAgICAgICAgJC5wdWJsaXNoKCdoYXJkc29ja2V0c3RvcCcpO1xuICAgICAgICAgIHJldHVybiBmYWxzZTtcbiAgICAgICAgfVxuICAgICAgICBjb25zb2xlLmxvZygnRmV0Y2hpbmcgYWRkaXRpb25hbCB0b2tlbi4uLicpO1xuICAgICAgICBvcHRpb25zLnRva2VuID0gdG9rZW47XG4gICAgICAgIGluaXRTb2NrZXQob3B0aW9ucywgb25vcGVuLCBvbmxpc3RlbmluZywgb25tZXNzYWdlLCBvbmVycm9yLCBvbmNsb3NlKTtcbiAgICAgIH0pO1xuICAgICAgcmV0dXJuIGZhbHNlO1xuICAgIH1cbiAgICBpZiAoZXZ0LmNvZGUgPT09IDEwMTEpIHtcbiAgICAgIGNvbnNvbGUuZXJyb3IoJ1NlcnZlciBlcnJvciAnICsgZXZ0LmNvZGUgKyAnOiBwbGVhc2UgcmVmcmVzaCB5b3VyIGJyb3dzZXIgYW5kIHRyeSBhZ2FpbicpO1xuICAgICAgcmV0dXJuIGZhbHNlO1xuICAgIH1cbiAgICBpZiAoZXZ0LmNvZGUgPiAxMDAwKSB7XG4gICAgICBjb25zb2xlLmVycm9yKCdTZXJ2ZXIgZXJyb3IgJyArIGV2dC5jb2RlICsgJzogcGxlYXNlIHJlZnJlc2ggeW91ciBicm93c2VyIGFuZCB0cnkgYWdhaW4nKTtcbiAgICAgIC8vIHNob3dFcnJvcignU2VydmVyIGVycm9yICcgKyBldnQuY29kZSArICc6IHBsZWFzZSByZWZyZXNoIHlvdXIgYnJvd3NlciBhbmQgdHJ5IGFnYWluJyk7XG4gICAgICByZXR1cm4gZmFsc2U7XG4gICAgfVxuICAgIC8vIE1hZGUgaXQgdGhyb3VnaCwgbm9ybWFsIGNsb3NlXG4gICAgJC51bnN1YnNjcmliZSgnaGFyZHNvY2tldHN0b3AnKTtcbiAgICAkLnVuc3Vic2NyaWJlKCdzb2NrZXRzdG9wJyk7XG4gICAgb25jbG9zZShldnQpO1xuICB9O1xuXG59IiwiXG4vLyBGb3Igbm9uLXZpZXcgbG9naWNcbnZhciAkID0gKHR5cGVvZiB3aW5kb3cgIT09IFwidW5kZWZpbmVkXCIgPyB3aW5kb3cualF1ZXJ5IDogdHlwZW9mIGdsb2JhbCAhPT0gXCJ1bmRlZmluZWRcIiA/IGdsb2JhbC5qUXVlcnkgOiBudWxsKTtcblxudmFyIGZpbGVCbG9jayA9IGZ1bmN0aW9uKF9vZmZzZXQsIGxlbmd0aCwgX2ZpbGUsIHJlYWRDaHVuaykge1xuICB2YXIgciA9IG5ldyBGaWxlUmVhZGVyKCk7XG4gIHZhciBibG9iID0gX2ZpbGUuc2xpY2UoX29mZnNldCwgbGVuZ3RoICsgX29mZnNldCk7XG4gIHIub25sb2FkID0gcmVhZENodW5rO1xuICByLnJlYWRBc0FycmF5QnVmZmVyKGJsb2IpO1xufVxuXG4vLyBCYXNlZCBvbiBhbGVkaWFmZXJpYSdzIFNPIHJlc3BvbnNlXG4vLyBodHRwOi8vc3RhY2tvdmVyZmxvdy5jb20vcXVlc3Rpb25zLzE0NDM4MTg3L2phdmFzY3JpcHQtZmlsZXJlYWRlci1wYXJzaW5nLWxvbmctZmlsZS1pbi1jaHVua3NcbmV4cG9ydHMub25GaWxlUHJvZ3Jlc3MgPSBmdW5jdGlvbihvcHRpb25zLCBvbmRhdGEsIG9uZXJyb3IsIG9uZW5kKSB7XG4gIHZhciBmaWxlICAgICAgID0gb3B0aW9ucy5maWxlO1xuICB2YXIgZmlsZVNpemUgICA9IGZpbGUuc2l6ZTtcbiAgdmFyIGNodW5rU2l6ZSAgPSBvcHRpb25zLmJ1ZmZlclNpemUgfHwgODE5MjtcbiAgdmFyIG9mZnNldCAgICAgPSAwO1xuICB2YXIgcmVhZENodW5rID0gZnVuY3Rpb24oZXZ0KSB7XG4gICAgaWYgKG9mZnNldCA+PSBmaWxlU2l6ZSkge1xuICAgICAgY29uc29sZS5sb2coXCJEb25lIHJlYWRpbmcgZmlsZVwiKTtcbiAgICAgIG9uZW5kKCk7XG4gICAgICByZXR1cm47XG4gICAgfVxuICAgIGlmIChldnQudGFyZ2V0LmVycm9yID09IG51bGwpIHtcbiAgICAgIHZhciBidWZmZXIgPSBldnQudGFyZ2V0LnJlc3VsdDtcbiAgICAgIHZhciBsZW4gPSBidWZmZXIuYnl0ZUxlbmd0aDtcbiAgICAgIG9mZnNldCArPSBsZW47XG4gICAgICBvbmRhdGEoYnVmZmVyKTsgLy8gY2FsbGJhY2sgZm9yIGhhbmRsaW5nIHJlYWQgY2h1bmtcbiAgICB9IGVsc2Uge1xuICAgICAgdmFyIGVycm9yTWVzc2FnZSA9IGV2dC50YXJnZXQuZXJyb3I7XG4gICAgICBjb25zb2xlLmxvZyhcIlJlYWQgZXJyb3I6IFwiICsgZXJyb3JNZXNzYWdlKTtcbiAgICAgIG9uZXJyb3IoZXJyb3JNZXNzYWdlKTtcbiAgICAgIHJldHVybjtcbiAgICB9XG4gICAgZmlsZUJsb2NrKG9mZnNldCwgY2h1bmtTaXplLCBmaWxlLCByZWFkQ2h1bmspO1xuICB9XG4gIGZpbGVCbG9jayhvZmZzZXQsIGNodW5rU2l6ZSwgZmlsZSwgcmVhZENodW5rKTtcbn1cblxuZXhwb3J0cy5jcmVhdGVUb2tlbkdlbmVyYXRvciA9IGZ1bmN0aW9uKCkge1xuICAvLyBNYWtlIGNhbGwgdG8gQVBJIHRvIHRyeSBhbmQgZ2V0IHRva2VuXG4gIHZhciBoYXNCZWVuUnVuVGltZXMgPSAwO1xuICByZXR1cm4ge1xuICAgIGdldFRva2VuOiBmdW5jdGlvbihjYWxsYmFjaykge1xuICAgICsraGFzQmVlblJ1blRpbWVzO1xuICAgIGlmIChoYXNCZWVuUnVuVGltZXMgPiA1KSB7XG4gICAgICB2YXIgZXJyID0gbmV3IEVycm9yKCdDYW5ub3QgcmVhY2ggc2VydmVyJyk7XG4gICAgICBjYWxsYmFjayhudWxsLCBlcnIpO1xuICAgICAgcmV0dXJuO1xuICAgIH1cbiAgICB2YXIgdXJsID0gJy90b2tlbic7XG4gICAgdmFyIHRva2VuUmVxdWVzdCA9IG5ldyBYTUxIdHRwUmVxdWVzdCgpO1xuICAgIHRva2VuUmVxdWVzdC5vcGVuKFwiR0VUXCIsIHVybCwgdHJ1ZSk7XG4gICAgdG9rZW5SZXF1ZXN0Lm9ubG9hZCA9IGZ1bmN0aW9uKGV2dCkge1xuICAgICAgdmFyIHRva2VuID0gdG9rZW5SZXF1ZXN0LnJlc3BvbnNlVGV4dDtcbiAgICAgIGNhbGxiYWNrKHRva2VuKTtcbiAgICB9O1xuICAgIHRva2VuUmVxdWVzdC5zZW5kKCk7XG4gICAgfSxcbiAgICBnZXRDb3VudDogZnVuY3Rpb24oKSB7IHJldHVybiBoYXNCZWVuUnVuVGltZXM7IH1cbiAgfVxufTtcblxuZXhwb3J0cy5nZXRUb2tlbiA9IChmdW5jdGlvbigpIHtcbiAgLy8gTWFrZSBjYWxsIHRvIEFQSSB0byB0cnkgYW5kIGdldCB0b2tlblxuICB2YXIgaGFzQmVlblJ1blRpbWVzID0gMDtcbiAgcmV0dXJuIGZ1bmN0aW9uKGNhbGxiYWNrKSB7XG4gICAgaGFzQmVlblJ1blRpbWVzKytcbiAgICBpZiAoaGFzQmVlblJ1blRpbWVzID4gNSkge1xuICAgICAgdmFyIGVyciA9IG5ldyBFcnJvcignQ2Fubm90IHJlYWNoIHNlcnZlcicpO1xuICAgICAgY2FsbGJhY2sobnVsbCwgZXJyKTtcbiAgICAgIHJldHVybjtcbiAgICB9XG4gICAgdmFyIHVybCA9ICcvdG9rZW4nO1xuICAgIHZhciB0b2tlblJlcXVlc3QgPSBuZXcgWE1MSHR0cFJlcXVlc3QoKTtcbiAgICB0b2tlblJlcXVlc3Qub3BlbihcIkdFVFwiLCB1cmwsIHRydWUpO1xuICAgIHRva2VuUmVxdWVzdC5vbmxvYWQgPSBmdW5jdGlvbihldnQpIHtcbiAgICAgIHZhciB0b2tlbiA9IHRva2VuUmVxdWVzdC5yZXNwb25zZVRleHQ7XG4gICAgICBjYWxsYmFjayh0b2tlbik7XG4gICAgfTtcbiAgICB0b2tlblJlcXVlc3Quc2VuZCgpO1xuICB9XG59KSgpO1xuXG5leHBvcnRzLmluaXRQdWJTdWIgPSBmdW5jdGlvbigpIHtcbiAgdmFyIG8gICAgICAgICA9ICQoe30pO1xuICAkLnN1YnNjcmliZSAgID0gby5vbi5iaW5kKG8pO1xuICAkLnVuc3Vic2NyaWJlID0gby5vZmYuYmluZChvKTtcbiAgJC5wdWJsaXNoICAgICA9IG8udHJpZ2dlci5iaW5kKG8pO1xufSIsIlxuXG5leHBvcnRzLmluaXRBbmltYXRlUGFuZWwgPSBmdW5jdGlvbigpIHtcbiAgJCgnLnBhbmVsLWhlYWRpbmcgc3Bhbi5jbGlja2FibGUnKS5vbihcImNsaWNrXCIsIGZ1bmN0aW9uIChlKSB7XG4gICAgaWYgKCQodGhpcykuaGFzQ2xhc3MoJ3BhbmVsLWNvbGxhcHNlZCcpKSB7XG4gICAgICAvLyBleHBhbmQgdGhlIHBhbmVsXG4gICAgICAkKHRoaXMpLnBhcmVudHMoJy5wYW5lbCcpLmZpbmQoJy5wYW5lbC1ib2R5Jykuc2xpZGVEb3duKCk7XG4gICAgICAkKHRoaXMpLnJlbW92ZUNsYXNzKCdwYW5lbC1jb2xsYXBzZWQnKTtcbiAgICAgICQodGhpcykuZmluZCgnaScpLnJlbW92ZUNsYXNzKCdjYXJldC1kb3duJykuYWRkQ2xhc3MoJ2NhcmV0LXVwJyk7XG4gICAgfVxuICAgIGVsc2Uge1xuICAgICAgLy8gY29sbGFwc2UgdGhlIHBhbmVsXG4gICAgICAkKHRoaXMpLnBhcmVudHMoJy5wYW5lbCcpLmZpbmQoJy5wYW5lbC1ib2R5Jykuc2xpZGVVcCgpO1xuICAgICAgJCh0aGlzKS5hZGRDbGFzcygncGFuZWwtY29sbGFwc2VkJyk7XG4gICAgICAkKHRoaXMpLmZpbmQoJ2knKS5yZW1vdmVDbGFzcygnY2FyZXQtdXAnKS5hZGRDbGFzcygnY2FyZXQtZG93bicpO1xuICAgIH1cbiAgfSk7XG59XG5cbiIsIid1c2Ugc3RyaWN0JztcblxudmFyICQgPSAodHlwZW9mIHdpbmRvdyAhPT0gXCJ1bmRlZmluZWRcIiA/IHdpbmRvdy5qUXVlcnkgOiB0eXBlb2YgZ2xvYmFsICE9PSBcInVuZGVmaW5lZFwiID8gZ2xvYmFsLmpRdWVyeSA6IG51bGwpO1xudmFyIHNjcm9sbGVkID0gZmFsc2U7XG5cbnZhciBzaG93VGltZXN0YW1wID0gZnVuY3Rpb24odGltZXN0YW1wcywgY29uZmlkZW5jZXMpIHtcbiAgdmFyIHdvcmQgPSB0aW1lc3RhbXBzWzBdLFxuICAgICAgdDAgPSB0aW1lc3RhbXBzWzFdLFxuICAgICAgdDEgPSB0aW1lc3RhbXBzWzJdO1xuICB2YXIgdGltZWxlbmd0aCA9IHQxIC0gdDA7XG4gIC8vIFNob3cgY29uZmlkZW5jZSBpZiBkZWZpbmVkLCBlbHNlICduL2EnXG4gIHZhciBkaXNwbGF5Q29uZmlkZW5jZSA9IGNvbmZpZGVuY2VzID8gY29uZmlkZW5jZXNbMV0udG9TdHJpbmcoKS5zdWJzdHJpbmcoMCwgMykgOiAnbi9hJztcbiAgJCgnI21ldGFkYXRhVGFibGUgPiB0Ym9keTpsYXN0LWNoaWxkJykuYXBwZW5kKFxuICAgICAgJzx0cj4nXG4gICAgICArICc8dGQ+JyArIHdvcmQgKyAnPC90ZD4nXG4gICAgICArICc8dGQ+JyArIHQwICsgJzwvdGQ+J1xuICAgICAgKyAnPHRkPicgKyB0MSArICc8L3RkPidcbiAgICAgICsgJzx0ZD4nICsgZGlzcGxheUNvbmZpZGVuY2UgKyAnPC90ZD4nXG4gICAgICArICc8L3RyPidcbiAgICAgICk7XG59XG5cblxudmFyIHNob3dNZXRhRGF0YSA9IGZ1bmN0aW9uKGFsdGVybmF0aXZlKSB7XG4gIHZhciBjb25maWRlbmNlTmVzdGVkQXJyYXkgPSBhbHRlcm5hdGl2ZS53b3JkX2NvbmZpZGVuY2U7O1xuICB2YXIgdGltZXN0YW1wTmVzdGVkQXJyYXkgPSBhbHRlcm5hdGl2ZS50aW1lc3RhbXBzO1xuICBpZiAoY29uZmlkZW5jZU5lc3RlZEFycmF5ICYmIGNvbmZpZGVuY2VOZXN0ZWRBcnJheS5sZW5ndGggPiAwKSB7XG4gICAgZm9yICh2YXIgaSA9IDA7IGkgPCBjb25maWRlbmNlTmVzdGVkQXJyYXkubGVuZ3RoOyBpKyspIHtcbiAgICAgIHZhciB0aW1lc3RhbXBzID0gdGltZXN0YW1wTmVzdGVkQXJyYXlbaV07XG4gICAgICB2YXIgY29uZmlkZW5jZXMgPSBjb25maWRlbmNlTmVzdGVkQXJyYXlbaV07XG4gICAgICBzaG93VGltZXN0YW1wKHRpbWVzdGFtcHMsIGNvbmZpZGVuY2VzKTtcbiAgICB9XG4gICAgcmV0dXJuO1xuICB9IGVsc2Uge1xuICAgIGlmICh0aW1lc3RhbXBOZXN0ZWRBcnJheSAmJiB0aW1lc3RhbXBOZXN0ZWRBcnJheS5sZW5ndGggPiAwKSB7XG4gICAgICB0aW1lc3RhbXBOZXN0ZWRBcnJheS5mb3JFYWNoKGZ1bmN0aW9uKHRpbWVzdGFtcCkge1xuICAgICAgICBzaG93VGltZXN0YW1wKHRpbWVzdGFtcCk7XG4gICAgICB9KTtcbiAgICB9XG4gIH1cbn1cblxudmFyIEFsdGVybmF0aXZlcyA9IGZ1bmN0aW9uKCl7XG5cbiAgdmFyIHN0cmluZ09uZSA9ICcnLFxuICAgIHN0cmluZ1R3byA9ICcnLFxuICAgIHN0cmluZ1RocmVlID0gJyc7XG5cbiAgdGhpcy5jbGVhclN0cmluZyA9IGZ1bmN0aW9uKCkge1xuICAgIHN0cmluZ09uZSA9ICcnO1xuICAgIHN0cmluZ1R3byA9ICcnO1xuICAgIHN0cmluZ1RocmVlID0gJyc7XG4gIH07XG5cbiAgdGhpcy5zaG93QWx0ZXJuYXRpdmVzID0gZnVuY3Rpb24oYWx0ZXJuYXRpdmVzLCBpc0ZpbmFsLCB0ZXN0aW5nKSB7XG4gICAgdmFyICRoeXBvdGhlc2VzID0gJCgnLmh5cG90aGVzZXMgb2wnKTtcbiAgICAkaHlwb3RoZXNlcy5lbXB0eSgpO1xuICAgIC8vICRoeXBvdGhlc2VzLmFwcGVuZCgkKCc8L2JyPicpKTtcbiAgICBhbHRlcm5hdGl2ZXMuZm9yRWFjaChmdW5jdGlvbihhbHRlcm5hdGl2ZSwgaWR4KSB7XG4gICAgICB2YXIgJGFsdGVybmF0aXZlO1xuICAgICAgaWYgKGFsdGVybmF0aXZlLnRyYW5zY3JpcHQpIHtcbiAgICAgICAgY29uc29sZS5sb2coJ0FMVEVSTkFUSVZFUyBJTkRFWCcsIGlkeCk7XG4gICAgICAgIHZhciB0cmFuc2NyaXB0ID0gYWx0ZXJuYXRpdmUudHJhbnNjcmlwdC5yZXBsYWNlKC8lSEVTSVRBVElPTlxccy9nLCAnJyk7XG4gICAgICAgIHRyYW5zY3JpcHQgPSB0cmFuc2NyaXB0LnJlcGxhY2UoLyguKVxcMXsyLH0vZywgJycpO1xuICAgICAgICBzd2l0Y2ggKGlkeCkge1xuICAgICAgICAgIGNhc2UgMDpcbiAgICAgICAgICAgIHN0cmluZ09uZSA9IHN0cmluZ09uZSArIHRyYW5zY3JpcHQ7XG4gICAgICAgICAgICAkYWx0ZXJuYXRpdmUgPSAkKCc8bGkgZGF0YS1oeXBvdGhlc2lzLWluZGV4PScgKyBpZHggKyAnID4nICsgc3RyaW5nT25lICsgJzwvbGk+Jyk7XG4gICAgICAgICAgICBicmVhaztcbiAgICAgICAgICBjYXNlIDE6XG4gICAgICAgICAgICBzdHJpbmdUd28gPSBzdHJpbmdUd28gKyB0cmFuc2NyaXB0O1xuICAgICAgICAgICAgJGFsdGVybmF0aXZlID0gJCgnPGxpIGRhdGEtaHlwb3RoZXNpcy1pbmRleD0nICsgaWR4ICsgJyA+JyArIHN0cmluZ1R3byArICc8L2xpPicpO1xuICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgY2FzZSAyOlxuICAgICAgICAgICAgc3RyaW5nVGhyZWUgPSBzdHJpbmdUaHJlZSArIHRyYW5zY3JpcHQ7XG4gICAgICAgICAgICAkYWx0ZXJuYXRpdmUgPSAkKCc8bGkgZGF0YS1oeXBvdGhlc2lzLWluZGV4PScgKyBpZHggKyAnID4nICsgc3RyaW5nVGhyZWUgKyAnPC9saT4nKTtcbiAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICB9XG4gICAgICAgICRoeXBvdGhlc2VzLmFwcGVuZCgkYWx0ZXJuYXRpdmUpO1xuICAgICAgfVxuICAgIH0pO1xuICB9O1xufVxuXG52YXIgYWx0ZXJuYXRpdmVQcm90b3R5cGUgPSBuZXcgQWx0ZXJuYXRpdmVzKCk7XG5cbi8vIFRPRE86IENvbnZlcnQgdG8gY2xvc3VyZSBhcHByb2FjaFxudmFyIHByb2Nlc3NTdHJpbmcgPSBmdW5jdGlvbihiYXNlU3RyaW5nLCBpc0ZpbmlzaGVkKSB7XG5cbiAgaWYgKGlzRmluaXNoZWQpIHtcbiAgICB2YXIgZm9ybWF0dGVkU3RyaW5nID0gYmFzZVN0cmluZy5zbGljZSgwLCAtMSk7XG4gICAgZm9ybWF0dGVkU3RyaW5nID0gZm9ybWF0dGVkU3RyaW5nLmNoYXJBdCgwKS50b1VwcGVyQ2FzZSgpICsgZm9ybWF0dGVkU3RyaW5nLnN1YnN0cmluZygxKTtcbiAgICBmb3JtYXR0ZWRTdHJpbmcgPSBmb3JtYXR0ZWRTdHJpbmcudHJpbSgpICsgJy4nO1xuICAgICQoJyNyZXN1bHRzVGV4dCcpLnZhbChmb3JtYXR0ZWRTdHJpbmcpO1xuICB9IGVsc2Uge1xuICAgICQoJyNyZXN1bHRzVGV4dCcpLnZhbChiYXNlU3RyaW5nKTtcbiAgfVxuXG59XG5cbmV4cG9ydHMuc2hvd0pTT04gPSBmdW5jdGlvbihtc2csIGJhc2VKU09OKSB7XG4gIHZhciBqc29uID0gSlNPTi5zdHJpbmdpZnkobXNnLCBudWxsLCAyKTtcbiAgYmFzZUpTT04gKz0ganNvbjtcbiAgYmFzZUpTT04gKz0gJ1xcbic7XG4gICQoJyNyZXN1bHRzSlNPTicpLnZhbChiYXNlSlNPTik7XG4gIHJldHVybiBiYXNlSlNPTjtcbn1cblxuZnVuY3Rpb24gdXBkYXRlU2Nyb2xsKCl7XG4gICAgaWYoIXNjcm9sbGVkKXtcbiAgICAgICAgdmFyIGVsZW1lbnQgPSAkKCcudGFibGUtc2Nyb2xsJykuZ2V0KDApO1xuICAgICAgICBlbGVtZW50LnNjcm9sbFRvcCA9IGVsZW1lbnQuc2Nyb2xsSGVpZ2h0O1xuICAgIH1cbn1cblxudmFyIGluaXRTY3JvbGwgPSBmdW5jdGlvbigpIHtcbiAgJCgnLnRhYmxlLXNjcm9sbCcpLm9uKCdzY3JvbGwnLCBmdW5jdGlvbigpe1xuICAgICAgc2Nyb2xsZWQ9dHJ1ZTtcbiAgfSk7XG59XG5cblxuZXhwb3J0cy5zaG93UmVzdWx0ID0gZnVuY3Rpb24obXNnLCBiYXNlU3RyaW5nLCBjYWxsYmFjaykge1xuXG4gIHZhciBpZHggPSArbXNnLnJlc3VsdF9pbmRleDtcblxuICBpZiAobXNnLnJlc3VsdHMgJiYgbXNnLnJlc3VsdHMubGVuZ3RoID4gMCkge1xuXG4gICAgdmFyIGFsdGVybmF0aXZlcyA9IG1zZy5yZXN1bHRzWzBdLmFsdGVybmF0aXZlcztcbiAgICB2YXIgdGV4dCA9IG1zZy5yZXN1bHRzWzBdLmFsdGVybmF0aXZlc1swXS50cmFuc2NyaXB0IHx8ICcnO1xuXG4gICAgLy9DYXBpdGFsaXplIGZpcnN0IHdvcmRcbiAgICAvLyBpZiBmaW5hbCByZXN1bHRzLCBhcHBlbmQgYSBuZXcgcGFyYWdyYXBoXG4gICAgaWYgKG1zZy5yZXN1bHRzICYmIG1zZy5yZXN1bHRzWzBdICYmIG1zZy5yZXN1bHRzWzBdLmZpbmFsKSB7XG4gICAgICBiYXNlU3RyaW5nICs9IHRleHQ7XG4gICAgICB2YXIgZGlzcGxheUZpbmFsU3RyaW5nID0gYmFzZVN0cmluZztcbiAgICAgIGRpc3BsYXlGaW5hbFN0cmluZyA9IGRpc3BsYXlGaW5hbFN0cmluZy5yZXBsYWNlKC8lSEVTSVRBVElPTlxccy9nLCAnJyk7XG4gICAgICBkaXNwbGF5RmluYWxTdHJpbmcgPSBkaXNwbGF5RmluYWxTdHJpbmcucmVwbGFjZSgvKC4pXFwxezIsfS9nLCAnJyk7XG4gICAgICBwcm9jZXNzU3RyaW5nKGRpc3BsYXlGaW5hbFN0cmluZywgdHJ1ZSk7XG4gICAgICAvLyBJZiB3ZSdyZSBub3QgdXNpbmcgdGhlIG1pYywgd2Ugc2hvdyBleHRlbnNpdmUgbWV0YWRhdGFcbiAgICAgIC8vIEJ1dCwgc2hvd2luZyBtZXRhZGF0YSBpcyBjb21wdXRhdGlvbmFsbHkgZXhwZW5zaXZlIGJlY2F1c2VcbiAgICAgIC8vIG9mIERPTSBtYW5pcHVsYXRpb25zLCBhbmQgY2F1c2VzIHNvbWUgYXVkaW8gZGlzdG9ydGlvbnNcbiAgICAgIC8vIGV2ZW4gdGhvdWdoIHRoZSBET00gY2hhbmdlcyBkb24ndCB0YWtlIHBsYWNlIGluIHRoZSBnZXRVc2VyTWVkaWFcbiAgICAgIC8vIG9uIGRhdGEgY2FsbGJhY2tcbiAgICAgIHZhciBtaWNSdW5uaW5nID0gSlNPTi5wYXJzZShsb2NhbFN0b3JhZ2UuZ2V0SXRlbSgnbWljUnVubmluZycpKTtcbiAgICAgIGlmICghbWljUnVubmluZykge1xuICAgICAgICBzaG93TWV0YURhdGEoYWx0ZXJuYXRpdmVzWzBdKTtcbiAgICAgICAgLy8gT25seSBzaG93IGFsdGVybmF0aXZlcyBpZiB3ZSdyZSBmaW5hbFxuICAgICAgICBhbHRlcm5hdGl2ZVByb3RvdHlwZS5zaG93QWx0ZXJuYXRpdmVzKGFsdGVybmF0aXZlcyk7XG4gICAgICB9XG4gICAgfSBlbHNlIHtcbiAgICAgIHZhciB0ZW1wU3RyaW5nID0gYmFzZVN0cmluZyArIHRleHQ7XG4gICAgICB0ZW1wU3RyaW5nID0gdGVtcFN0cmluZy5yZXBsYWNlKC8lSEVTSVRBVElPTlxccy9nLCAnJyk7XG4gICAgICB0ZW1wU3RyaW5nID0gdGVtcFN0cmluZy5yZXBsYWNlKC8oLilcXDF7Mix9L2csICcnKTtcbiAgICAgIHByb2Nlc3NTdHJpbmcodGVtcFN0cmluZywgZmFsc2UpO1xuICAgIH1cbiAgfVxuXG4gIHVwZGF0ZVNjcm9sbCgpO1xuXG4gIHJldHVybiBiYXNlU3RyaW5nO1xuXG59O1xuXG4kLnN1YnNjcmliZSgnY2xlYXJzY3JlZW4nLCBmdW5jdGlvbigpIHtcbiAgdmFyICRoeXBvdGhlc2VzID0gJCgnLmh5cG90aGVzZXMgdWwnKTtcbiAgc2Nyb2xsZWQgPSBmYWxzZTtcbiAgJGh5cG90aGVzZXMuZW1wdHkoKTtcbiAgYWx0ZXJuYXRpdmVQcm90b3R5cGUuY2xlYXJTdHJpbmcoKTtcbn0pOyIsIlxuJ3VzZSBzdHJpY3QnO1xuXG52YXIgaGFuZGxlU2VsZWN0ZWRGaWxlID0gcmVxdWlyZSgnLi9maWxldXBsb2FkJykuaGFuZGxlU2VsZWN0ZWRGaWxlO1xuXG5leHBvcnRzLmluaXREcmFnRHJvcCA9IGZ1bmN0aW9uKGN0eCkge1xuXG4gIHZhciBkcmFnQW5kRHJvcFRhcmdldCA9ICQoZG9jdW1lbnQpO1xuXG4gIGRyYWdBbmREcm9wVGFyZ2V0Lm9uKCdkcmFnZW50ZXInLCBmdW5jdGlvbiAoZSkge1xuICAgIGUuc3RvcFByb3BhZ2F0aW9uKCk7XG4gICAgZS5wcmV2ZW50RGVmYXVsdCgpO1xuICB9KTtcblxuICBkcmFnQW5kRHJvcFRhcmdldC5vbignZHJhZ292ZXInLCBmdW5jdGlvbiAoZSkge1xuICAgIGUuc3RvcFByb3BhZ2F0aW9uKCk7XG4gICAgZS5wcmV2ZW50RGVmYXVsdCgpO1xuICB9KTtcblxuICBkcmFnQW5kRHJvcFRhcmdldC5vbignZHJvcCcsIGZ1bmN0aW9uIChlKSB7XG4gICAgY29uc29sZS5sb2coJ0ZpbGUgZHJvcHBlZCcpO1xuICAgIGUucHJldmVudERlZmF1bHQoKTtcbiAgICB2YXIgZXZ0ID0gZS5vcmlnaW5hbEV2ZW50O1xuICAgIC8vIEhhbmRsZSBkcmFnZ2VkIGZpbGUgZXZlbnRcbiAgICBoYW5kbGVGaWxlVXBsb2FkRXZlbnQoZXZ0KTtcbiAgfSk7XG5cbiAgZnVuY3Rpb24gaGFuZGxlRmlsZVVwbG9hZEV2ZW50KGV2dCkge1xuICAgIC8vIEluaXQgZmlsZSB1cGxvYWQgd2l0aCBkZWZhdWx0IG1vZGVsXG4gICAgdmFyIGZpbGUgPSBldnQuZGF0YVRyYW5zZmVyLmZpbGVzWzBdO1xuICAgIGhhbmRsZVNlbGVjdGVkRmlsZShjdHgudG9rZW4sIGZpbGUpO1xuICB9XG5cbn1cbiIsIlxuXG5cbmV4cG9ydHMuZmxhc2hTVkcgPSBmdW5jdGlvbihlbCkge1xuICBlbC5jc3MoeyBmaWxsOiAnI0E1MzcyNScgfSk7XG4gIGZ1bmN0aW9uIGxvb3AoKSB7XG4gICAgZWwuYW5pbWF0ZSh7IGZpbGw6ICcjQTUzNzI1JyB9LFxuICAgICAgICAxMDAwLCAnbGluZWFyJylcbiAgICAgIC5hbmltYXRlKHsgZmlsbDogJ3doaXRlJyB9LFxuICAgICAgICAgIDEwMDAsICdsaW5lYXInKTtcbiAgfVxuICAvLyByZXR1cm4gdGltZXJcbiAgdmFyIHRpbWVyID0gc2V0VGltZW91dChsb29wLCAyMDAwKTtcbiAgcmV0dXJuIHRpbWVyO1xufTtcblxuZXhwb3J0cy5zdG9wRmxhc2hTVkcgPSBmdW5jdGlvbih0aW1lcikge1xuICBlbC5jc3MoeyBmaWxsOiAnd2hpdGUnIH0gKTtcbiAgY2xlYXJJbnRlcnZhbCh0aW1lcik7XG59XG5cbmV4cG9ydHMudG9nZ2xlSW1hZ2UgPSBmdW5jdGlvbihlbCwgbmFtZSkge1xuICBpZihlbC5hdHRyKCdzcmMnKSA9PT0gJ2ltYWdlcy8nICsgbmFtZSArICcuc3ZnJykge1xuICAgIGVsLmF0dHIoXCJzcmNcIiwgJ2ltYWdlcy9zdG9wLXJlZC5zdmcnKTtcbiAgfSBlbHNlIHtcbiAgICBlbC5hdHRyKCdzcmMnLCAnaW1hZ2VzL3N0b3Auc3ZnJyk7XG4gIH1cbn1cblxudmFyIHJlc3RvcmVJbWFnZSA9IGV4cG9ydHMucmVzdG9yZUltYWdlID0gZnVuY3Rpb24oZWwsIG5hbWUpIHtcbiAgZWwuYXR0cignc3JjJywgJ2ltYWdlcy8nICsgbmFtZSArICcuc3ZnJyk7XG59XG5cbmV4cG9ydHMuc3RvcFRvZ2dsZUltYWdlID0gZnVuY3Rpb24odGltZXIsIGVsLCBuYW1lKSB7XG4gIGNsZWFySW50ZXJ2YWwodGltZXIpO1xuICByZXN0b3JlSW1hZ2UoZWwsIG5hbWUpO1xufVxuIiwiXG4ndXNlIHN0cmljdCc7XG5cbnZhciBzaG93RXJyb3IgPSByZXF1aXJlKCcuL3Nob3dlcnJvcicpLnNob3dFcnJvcjtcbnZhciBzaG93Tm90aWNlID0gcmVxdWlyZSgnLi9zaG93ZXJyb3InKS5zaG93Tm90aWNlO1xudmFyIGhhbmRsZUZpbGVVcGxvYWQgPSByZXF1aXJlKCcuLi9oYW5kbGVmaWxldXBsb2FkJykuaGFuZGxlRmlsZVVwbG9hZDtcbnZhciBlZmZlY3RzID0gcmVxdWlyZSgnLi9lZmZlY3RzJyk7XG52YXIgdXRpbHMgPSByZXF1aXJlKCcuLi91dGlscycpO1xuXG4vLyBOZWVkIHRvIHJlbW92ZSB0aGUgdmlldyBsb2dpYyBoZXJlIGFuZCBtb3ZlIHRoaXMgb3V0IHRvIHRoZSBoYW5kbGVmaWxldXBsb2FkIGNvbnRyb2xsZXJcbnZhciBoYW5kbGVTZWxlY3RlZEZpbGUgPSBleHBvcnRzLmhhbmRsZVNlbGVjdGVkRmlsZSA9IChmdW5jdGlvbigpIHtcblxuICAgIHZhciBydW5uaW5nID0gZmFsc2U7XG4gICAgbG9jYWxTdG9yYWdlLnNldEl0ZW0oJ2N1cnJlbnRseURpc3BsYXlpbmcnLCBmYWxzZSk7XG5cbiAgICByZXR1cm4gZnVuY3Rpb24odG9rZW4sIGZpbGUpIHtcblxuICAgIHZhciBjdXJyZW50bHlEaXNwbGF5aW5nID0gSlNPTi5wYXJzZShsb2NhbFN0b3JhZ2UuZ2V0SXRlbSgnY3VycmVudGx5RGlzcGxheWluZycpKTtcblxuICAgIC8vIGlmIChjdXJyZW50bHlEaXNwbGF5aW5nKSB7XG4gICAgLy8gICBzaG93RXJyb3IoJ0N1cnJlbnRseSBhbm90aGVyIGZpbGUgaXMgcGxheWluZywgcGxlYXNlIHN0b3AgdGhlIGZpbGUgb3Igd2FpdCB1bnRpbCBpdCBmaW5pc2hlcycpO1xuICAgIC8vICAgcmV0dXJuO1xuICAgIC8vIH1cblxuICAgICQucHVibGlzaCgnY2xlYXJzY3JlZW4nKTtcblxuICAgIGxvY2FsU3RvcmFnZS5zZXRJdGVtKCdjdXJyZW50bHlEaXNwbGF5aW5nJywgdHJ1ZSk7XG4gICAgcnVubmluZyA9IHRydWU7XG5cbiAgICAvLyBWaXN1YWwgZWZmZWN0c1xuICAgIHZhciB1cGxvYWRJbWFnZVRhZyA9ICQoJyNmaWxlVXBsb2FkVGFyZ2V0ID4gaW1nJyk7XG4gICAgdmFyIHRpbWVyID0gc2V0SW50ZXJ2YWwoZWZmZWN0cy50b2dnbGVJbWFnZSwgNzUwLCB1cGxvYWRJbWFnZVRhZywgJ3N0b3AnKTtcbiAgICB2YXIgdXBsb2FkVGV4dCA9ICQoJyNmaWxlVXBsb2FkVGFyZ2V0ID4gc3BhbicpO1xuICAgIHVwbG9hZFRleHQudGV4dCgnU3RvcCBUcmFuc2NyaWJpbmcnKTtcblxuICAgIGZ1bmN0aW9uIHJlc3RvcmVVcGxvYWRUYWIoKSB7XG4gICAgICBjbGVhckludGVydmFsKHRpbWVyKTtcbiAgICAgIGVmZmVjdHMucmVzdG9yZUltYWdlKHVwbG9hZEltYWdlVGFnLCAndXBsb2FkJyk7XG4gICAgICB1cGxvYWRUZXh0LnRleHQoJ1NlbGVjdCBGaWxlJyk7XG4gICAgfVxuXG4gICAgLy8gQ2xlYXIgZmxhc2hpbmcgaWYgc29ja2V0IHVwbG9hZCBpcyBzdG9wcGVkXG4gICAgJC5zdWJzY3JpYmUoJ2hhcmRzb2NrZXRzdG9wJywgZnVuY3Rpb24oZGF0YSkge1xuICAgICAgcmVzdG9yZVVwbG9hZFRhYigpO1xuICAgIH0pO1xuXG5cbiAgICAvLyBHZXQgY3VycmVudCBtb2RlbFxuICAgIHZhciBjdXJyZW50TW9kZWwgPSBsb2NhbFN0b3JhZ2UuZ2V0SXRlbSgnY3VycmVudE1vZGVsJyk7XG4gICAgY29uc29sZS5sb2coJ2N1cnJlbnRNb2RlbCcsIGN1cnJlbnRNb2RlbCk7XG5cbiAgICAvLyBSZWFkIGZpcnN0IDQgYnl0ZXMgdG8gZGV0ZXJtaW5lIGhlYWRlclxuICAgIHZhciBibG9iVG9UZXh0ID0gbmV3IEJsb2IoW2ZpbGVdKS5zbGljZSgwLCA0KTtcbiAgICB2YXIgciA9IG5ldyBGaWxlUmVhZGVyKCk7XG4gICAgci5yZWFkQXNUZXh0KGJsb2JUb1RleHQpO1xuICAgIHIub25sb2FkID0gZnVuY3Rpb24oKSB7XG4gICAgICB2YXIgY29udGVudFR5cGU7XG4gICAgICBpZiAoci5yZXN1bHQgPT09ICdmTGFDJykge1xuICAgICAgICBjb250ZW50VHlwZSA9ICdhdWRpby9mbGFjJztcbiAgICAgICAgc2hvd05vdGljZSgnTm90aWNlOiBicm93c2VycyBkbyBub3Qgc3VwcG9ydCBwbGF5aW5nIEZMQUMgYXVkaW8sIHNvIG5vIGF1ZGlvIHdpbGwgYWNjb21wYW55IHRoZSB0cmFuc2NyaXB0aW9uJyk7XG4gICAgICB9IGVsc2UgaWYgKHIucmVzdWx0ID09PSAnUklGRicpIHtcbiAgICAgICAgY29udGVudFR5cGUgPSAnYXVkaW8vd2F2JztcbiAgICAgICAgdmFyIGF1ZGlvID0gbmV3IEF1ZGlvKCk7XG4gICAgICAgIHZhciB3YXZCbG9iID0gbmV3IEJsb2IoW2ZpbGVdLCB7dHlwZTogJ2F1ZGlvL3dhdid9KTtcbiAgICAgICAgdmFyIHdhdlVSTCA9IFVSTC5jcmVhdGVPYmplY3RVUkwod2F2QmxvYik7XG4gICAgICAgIGF1ZGlvLnNyYyA9IHdhdlVSTDtcbiAgICAgICAgYXVkaW8ucGxheSgpO1xuICAgICAgICAkLnN1YnNjcmliZSgnaGFyZHNvY2tldHN0b3AnLCBmdW5jdGlvbigpIHtcbiAgICAgICAgICBhdWRpby5wYXVzZSgpO1xuICAgICAgICAgIGF1ZGlvLmN1cnJlbnRUaW1lID0gMDtcbiAgICAgICAgfSk7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICByZXN0b3JlVXBsb2FkVGFiKCk7XG4gICAgICAgIHNob3dFcnJvcignT25seSBXQVYgb3IgRkxBQyBmaWxlcyBjYW4gYmUgdHJhbnNjcmliZWQsIHBsZWFzZSB0cnkgYW5vdGhlciBmaWxlIGZvcm1hdCcpO1xuICAgICAgICByZXR1cm47XG4gICAgICB9XG4gICAgICBoYW5kbGVGaWxlVXBsb2FkKHRva2VuLCBjdXJyZW50TW9kZWwsIGZpbGUsIGNvbnRlbnRUeXBlLCBmdW5jdGlvbihzb2NrZXQpIHtcbiAgICAgICAgdmFyIGJsb2IgPSBuZXcgQmxvYihbZmlsZV0pO1xuICAgICAgICB2YXIgcGFyc2VPcHRpb25zID0ge1xuICAgICAgICAgIGZpbGU6IGJsb2JcbiAgICAgICAgfTtcbiAgICAgICAgdXRpbHMub25GaWxlUHJvZ3Jlc3MocGFyc2VPcHRpb25zLFxuICAgICAgICAgIC8vIE9uIGRhdGEgY2h1bmtcbiAgICAgICAgICBmdW5jdGlvbihjaHVuaykge1xuICAgICAgICAgICAgc29ja2V0LnNlbmQoY2h1bmspO1xuICAgICAgICAgIH0sXG4gICAgICAgICAgLy8gT24gZmlsZSByZWFkIGVycm9yXG4gICAgICAgICAgZnVuY3Rpb24oZXZ0KSB7XG4gICAgICAgICAgICBjb25zb2xlLmxvZygnRXJyb3IgcmVhZGluZyBmaWxlOiAnLCBldnQubWVzc2FnZSk7XG4gICAgICAgICAgICBzaG93RXJyb3IoJ0Vycm9yOiAnICsgZXZ0Lm1lc3NhZ2UpO1xuICAgICAgICAgIH0sXG4gICAgICAgICAgLy8gT24gbG9hZCBlbmRcbiAgICAgICAgICBmdW5jdGlvbigpIHtcbiAgICAgICAgICAgIHNvY2tldC5zZW5kKEpTT04uc3RyaW5naWZ5KHsnYWN0aW9uJzogJ3N0b3AnfSkpO1xuICAgICAgICAgIH0pO1xuICAgICAgfSwgXG4gICAgICAgIGZ1bmN0aW9uKGV2dCkge1xuICAgICAgICAgIGVmZmVjdHMuc3RvcFRvZ2dsZUltYWdlKHRpbWVyLCB1cGxvYWRJbWFnZVRhZywgJ3VwbG9hZCcpO1xuICAgICAgICAgIHVwbG9hZFRleHQudGV4dCgnU2VsZWN0IEZpbGUnKTtcbiAgICAgICAgICBsb2NhbFN0b3JhZ2Uuc2V0SXRlbSgnY3VycmVudGx5RGlzcGxheWluZycsIGZhbHNlKTtcbiAgICAgICAgfVxuICAgICAgKTtcbiAgICB9O1xuICB9XG59KSgpO1xuXG5cbmV4cG9ydHMuaW5pdEZpbGVVcGxvYWQgPSBmdW5jdGlvbihjdHgpIHtcblxuICB2YXIgZmlsZVVwbG9hZERpYWxvZyA9ICQoXCIjZmlsZVVwbG9hZERpYWxvZ1wiKTtcblxuICBmaWxlVXBsb2FkRGlhbG9nLmNoYW5nZShmdW5jdGlvbihldnQpIHtcbiAgICB2YXIgZmlsZSA9IGZpbGVVcGxvYWREaWFsb2cuZ2V0KDApLmZpbGVzWzBdO1xuICAgIGhhbmRsZVNlbGVjdGVkRmlsZShjdHgudG9rZW4sIGZpbGUpO1xuICB9KTtcblxuICAkKFwiI2ZpbGVVcGxvYWRUYXJnZXRcIikuY2xpY2soZnVuY3Rpb24oZXZ0KSB7XG5cbiAgICB2YXIgY3VycmVudGx5RGlzcGxheWluZyA9IEpTT04ucGFyc2UobG9jYWxTdG9yYWdlLmdldEl0ZW0oJ2N1cnJlbnRseURpc3BsYXlpbmcnKSk7XG5cbiAgICBpZiAoY3VycmVudGx5RGlzcGxheWluZykge1xuICAgICAgY29uc29sZS5sb2coJ0hBUkQgU09DS0VUIFNUT1AnKTtcbiAgICAgICQucHVibGlzaCgnaGFyZHNvY2tldHN0b3AnKTtcbiAgICAgIGxvY2FsU3RvcmFnZS5zZXRJdGVtKCdjdXJyZW50bHlEaXNwbGF5aW5nJywgZmFsc2UpO1xuICAgICAgcmV0dXJuO1xuICAgIH1cblxuICAgIGZpbGVVcGxvYWREaWFsb2cudmFsKG51bGwpO1xuXG4gICAgZmlsZVVwbG9hZERpYWxvZ1xuICAgIC50cmlnZ2VyKCdjbGljaycpO1xuXG4gIH0pO1xuXG59IiwiXG52YXIgaW5pdFNlc3Npb25QZXJtaXNzaW9ucyA9IHJlcXVpcmUoJy4vc2Vzc2lvbnBlcm1pc3Npb25zJykuaW5pdFNlc3Npb25QZXJtaXNzaW9ucztcbnZhciBpbml0U2VsZWN0TW9kZWwgPSByZXF1aXJlKCcuL3NlbGVjdG1vZGVsJykuaW5pdFNlbGVjdE1vZGVsO1xudmFyIGluaXRBbmltYXRlUGFuZWwgPSByZXF1aXJlKCcuL2FuaW1hdGVwYW5lbCcpLmluaXRBbmltYXRlUGFuZWw7XG52YXIgaW5pdFNob3dUYWIgPSByZXF1aXJlKCcuL3Nob3d0YWInKS5pbml0U2hvd1RhYjtcbnZhciBpbml0RHJhZ0Ryb3AgPSByZXF1aXJlKCcuL2RyYWdkcm9wJykuaW5pdERyYWdEcm9wO1xudmFyIGluaXRQbGF5U2FtcGxlID0gcmVxdWlyZSgnLi9wbGF5c2FtcGxlJykuaW5pdFBsYXlTYW1wbGU7XG52YXIgaW5pdFJlY29yZEJ1dHRvbiA9IHJlcXVpcmUoJy4vcmVjb3JkYnV0dG9uJykuaW5pdFJlY29yZEJ1dHRvbjtcbnZhciBpbml0RmlsZVVwbG9hZCA9IHJlcXVpcmUoJy4vZmlsZXVwbG9hZCcpLmluaXRGaWxlVXBsb2FkO1xuXG5cbmV4cG9ydHMuaW5pdFZpZXdzID0gZnVuY3Rpb24oY3R4KSB7XG4gIGNvbnNvbGUubG9nKCdJbml0aWFsaXppbmcgdmlld3MuLi4nKTtcbiAgaW5pdFNlbGVjdE1vZGVsKGN0eCk7XG4gIGluaXRQbGF5U2FtcGxlKGN0eCk7XG4gIGluaXREcmFnRHJvcChjdHgpO1xuICBpbml0UmVjb3JkQnV0dG9uKGN0eCk7XG4gIGluaXRGaWxlVXBsb2FkKGN0eCk7XG4gIGluaXRTZXNzaW9uUGVybWlzc2lvbnMoKTtcbiAgaW5pdFNob3dUYWIoKTtcbiAgaW5pdEFuaW1hdGVQYW5lbCgpO1xuICBpbml0U2hvd1RhYigpO1xufSIsIlxuJ3VzZSBzdHJpY3QnO1xuXG52YXIgdXRpbHMgPSByZXF1aXJlKCcuLi91dGlscycpO1xudmFyIG9uRmlsZVByb2dyZXNzID0gdXRpbHMub25GaWxlUHJvZ3Jlc3M7XG52YXIgaGFuZGxlRmlsZVVwbG9hZCA9IHJlcXVpcmUoJy4uL2hhbmRsZWZpbGV1cGxvYWQnKS5oYW5kbGVGaWxlVXBsb2FkO1xudmFyIGluaXRTb2NrZXQgPSByZXF1aXJlKCcuLi9zb2NrZXQnKS5pbml0U29ja2V0O1xudmFyIHNob3dFcnJvciA9IHJlcXVpcmUoJy4vc2hvd2Vycm9yJykuc2hvd0Vycm9yO1xudmFyIGVmZmVjdHMgPSByZXF1aXJlKCcuL2VmZmVjdHMnKTtcblxuXG52YXIgTE9PS1VQX1RBQkxFID0ge1xuICAnZW4tVVNfQnJvYWRiYW5kTW9kZWwnOiBbJ1VzX0VuZ2xpc2hfQnJvYWRiYW5kX1NhbXBsZV8xLndhdicsICdVc19FbmdsaXNoX0Jyb2FkYmFuZF9TYW1wbGVfMi53YXYnXSxcbiAgJ2VuLVVTX05hcnJvd2JhbmRNb2RlbCc6IFsnVXNfRW5nbGlzaF9OYXJyb3diYW5kX1NhbXBsZV8xLndhdicsICdVc19FbmdsaXNoX05hcnJvd2JhbmRfU2FtcGxlXzIud2F2J10sXG4gICdlcy1FU19Ccm9hZGJhbmRNb2RlbCc6IFsnRXNfRVNfc3BrMjRfMTZraHoud2F2JywgJ0VzX0VTX3NwazE5XzE2a2h6LndhdiddLFxuICAnZXMtRVNfTmFycm93YmFuZE1vZGVsJzogWydFc19FU19zcGsyNF84a2h6LndhdicsICdFc19FU19zcGsxOV84a2h6LndhdiddLFxuICAnamEtSlBfQnJvYWRiYW5kTW9kZWwnOiBbJ3NhbXBsZS1KYV9KUC13aWRlMS53YXYnLCAnc2FtcGxlLUphX0pQLXdpZGUyLndhdiddLFxuICAnamEtSlBfTmFycm93YmFuZE1vZGVsJzogWydzYW1wbGUtSmFfSlAtbmFycm93My53YXYnLCAnc2FtcGxlLUphX0pQLW5hcnJvdzQud2F2J11cbn07XG5cbnZhciBwbGF5U2FtcGxlID0gKGZ1bmN0aW9uKCkge1xuXG4gIHZhciBydW5uaW5nID0gZmFsc2U7XG4gIGxvY2FsU3RvcmFnZS5zZXRJdGVtKCdjdXJyZW50bHlEaXNwbGF5aW5nJywgZmFsc2UpO1xuXG4gIHJldHVybiBmdW5jdGlvbih0b2tlbiwgaW1hZ2VUYWcsIGljb25OYW1lLCB1cmwsIGNhbGxiYWNrKSB7XG5cbiAgICAkLnB1Ymxpc2goJ2NsZWFyc2NyZWVuJyk7XG5cbiAgICB2YXIgY3VycmVudGx5RGlzcGxheWluZyA9IEpTT04ucGFyc2UobG9jYWxTdG9yYWdlLmdldEl0ZW0oJ2N1cnJlbnRseURpc3BsYXlpbmcnKSk7XG5cbiAgICBjb25zb2xlLmxvZygnQ1VSUkVOVExZIERJU1BMQVlJTkcnLCBjdXJyZW50bHlEaXNwbGF5aW5nKTtcblxuICAgIC8vIFRoaXMgZXJyb3IgaGFuZGxpbmcgbmVlZHMgdG8gYmUgZXhwYW5kZWQgdG8gYWNjb21vZGF0ZVxuICAgIC8vIHRoZSB0d28gZGlmZmVyZW50IHBsYXkgc2FtcGxlcyBmaWxlc1xuICAgIGlmIChjdXJyZW50bHlEaXNwbGF5aW5nKSB7XG4gICAgICBjb25zb2xlLmxvZygnSEFSRCBTT0NLRVQgU1RPUCcpO1xuICAgICAgJC5wdWJsaXNoKCdzb2NrZXRzdG9wJyk7XG4gICAgICBsb2NhbFN0b3JhZ2Uuc2V0SXRlbSgnY3VycmVudGx5RGlzcGxheWluZycsIGZhbHNlKTtcbiAgICAgIGVmZmVjdHMuc3RvcFRvZ2dsZUltYWdlKHRpbWVyLCBpbWFnZVRhZywgaWNvbk5hbWUpO1xuICAgICAgZWZmZWN0cy5yZXN0b3JlSW1hZ2UoaW1hZ2VUYWcsIGljb25OYW1lKTtcbiAgICAgIHJ1bm5pbmcgPSBmYWxzZTtcbiAgICAgIHJldHVybjtcbiAgICB9XG5cbiAgICBpZiAoY3VycmVudGx5RGlzcGxheWluZyAmJiBydW5uaW5nKSB7XG4gICAgICBzaG93RXJyb3IoJ0N1cnJlbnRseSBhbm90aGVyIGZpbGUgaXMgcGxheWluZywgcGxlYXNlIHN0b3AgdGhlIGZpbGUgb3Igd2FpdCB1bnRpbCBpdCBmaW5pc2hlcycpO1xuICAgICAgcmV0dXJuO1xuICAgIH1cblxuICAgIGxvY2FsU3RvcmFnZS5zZXRJdGVtKCdjdXJyZW50bHlEaXNwbGF5aW5nJywgdHJ1ZSk7XG4gICAgcnVubmluZyA9IHRydWU7XG5cbiAgICB2YXIgdGltZXIgPSBzZXRJbnRlcnZhbChlZmZlY3RzLnRvZ2dsZUltYWdlLCA3NTAsIGltYWdlVGFnLCBpY29uTmFtZSk7XG5cbiAgICB2YXIgeGhyID0gbmV3IFhNTEh0dHBSZXF1ZXN0KCk7XG4gICAgeGhyLm9wZW4oJ0dFVCcsIHVybCwgdHJ1ZSk7XG4gICAgeGhyLnJlc3BvbnNlVHlwZSA9ICdibG9iJztcbiAgICB4aHIub25sb2FkID0gZnVuY3Rpb24oZSkge1xuICAgICAgdmFyIGJsb2IgPSB4aHIucmVzcG9uc2U7XG4gICAgICB2YXIgY3VycmVudE1vZGVsID0gbG9jYWxTdG9yYWdlLmdldEl0ZW0oJ2N1cnJlbnRNb2RlbCcpIHx8ICdlbi1VU19Ccm9hZGJhbmRNb2RlbCc7XG4gICAgICB2YXIgcmVhZGVyID0gbmV3IEZpbGVSZWFkZXIoKTtcbiAgICAgIHZhciBibG9iVG9UZXh0ID0gbmV3IEJsb2IoW2Jsb2JdKS5zbGljZSgwLCA0KTtcbiAgICAgIHJlYWRlci5yZWFkQXNUZXh0KGJsb2JUb1RleHQpO1xuICAgICAgcmVhZGVyLm9ubG9hZCA9IGZ1bmN0aW9uKCkge1xuICAgICAgICB2YXIgY29udGVudFR5cGUgPSByZWFkZXIucmVzdWx0ID09PSAnZkxhQycgPyAnYXVkaW8vZmxhYycgOiAnYXVkaW8vd2F2JztcbiAgICAgICAgY29uc29sZS5sb2coJ1VwbG9hZGluZyBmaWxlJywgcmVhZGVyLnJlc3VsdCk7XG4gICAgICAgIHZhciBtZWRpYVNvdXJjZVVSTCA9IFVSTC5jcmVhdGVPYmplY3RVUkwoYmxvYik7XG4gICAgICAgIHZhciBhdWRpbyA9IG5ldyBBdWRpbygpO1xuICAgICAgICBhdWRpby5zcmMgPSBtZWRpYVNvdXJjZVVSTDtcbiAgICAgICAgYXVkaW8ucGxheSgpO1xuICAgICAgICAkLnN1YnNjcmliZSgnaGFyZHNvY2tldHN0b3AnLCBmdW5jdGlvbigpIHtcbiAgICAgICAgICBhdWRpby5wYXVzZSgpO1xuICAgICAgICAgIGF1ZGlvLmN1cnJlbnRUaW1lID0gMDtcbiAgICAgICAgfSk7XG4gICAgICAgICQuc3Vic2NyaWJlKCdzb2NrZXRzdG9wJywgZnVuY3Rpb24oKSB7XG4gICAgICAgICAgYXVkaW8ucGF1c2UoKTtcbiAgICAgICAgICBhdWRpby5jdXJyZW50VGltZSA9IDA7XG4gICAgICAgIH0pO1xuICAgICAgICBoYW5kbGVGaWxlVXBsb2FkKHRva2VuLCBjdXJyZW50TW9kZWwsIGJsb2IsIGNvbnRlbnRUeXBlLCBmdW5jdGlvbihzb2NrZXQpIHtcbiAgICAgICAgICB2YXIgcGFyc2VPcHRpb25zID0ge1xuICAgICAgICAgICAgZmlsZTogYmxvYlxuICAgICAgICAgIH07XG4gICAgICAgICAgb25GaWxlUHJvZ3Jlc3MocGFyc2VPcHRpb25zLFxuICAgICAgICAgICAgLy8gT24gZGF0YSBjaHVua1xuICAgICAgICAgICAgZnVuY3Rpb24oY2h1bmspIHtcbiAgICAgICAgICAgICAgc29ja2V0LnNlbmQoY2h1bmspO1xuICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIC8vIE9uIGZpbGUgcmVhZCBlcnJvclxuICAgICAgICAgICAgZnVuY3Rpb24oZXZ0KSB7XG4gICAgICAgICAgICAgIGNvbnNvbGUubG9nKCdFcnJvciByZWFkaW5nIGZpbGU6ICcsIGV2dC5tZXNzYWdlKTtcbiAgICAgICAgICAgICAgLy8gc2hvd0Vycm9yKGV2dC5tZXNzYWdlKTtcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgICAvLyBPbiBsb2FkIGVuZFxuICAgICAgICAgICAgZnVuY3Rpb24oKSB7XG4gICAgICAgICAgICAgIHNvY2tldC5zZW5kKEpTT04uc3RyaW5naWZ5KHsnYWN0aW9uJzogJ3N0b3AnfSkpO1xuICAgICAgICAgICAgfSk7XG4gICAgICAgIH0sIFxuICAgICAgICAvLyBPbiBjb25uZWN0aW9uIGVuZFxuICAgICAgICAgIGZ1bmN0aW9uKGV2dCkge1xuICAgICAgICAgICAgZWZmZWN0cy5zdG9wVG9nZ2xlSW1hZ2UodGltZXIsIGltYWdlVGFnLCBpY29uTmFtZSk7XG4gICAgICAgICAgICBlZmZlY3RzLnJlc3RvcmVJbWFnZShpbWFnZVRhZywgaWNvbk5hbWUpO1xuICAgICAgICAgICAgbG9jYWxTdG9yYWdlLmdldEl0ZW0oJ2N1cnJlbnRseURpc3BsYXlpbmcnLCBmYWxzZSk7XG4gICAgICAgICAgfVxuICAgICAgICApO1xuICAgICAgfTtcbiAgICB9O1xuICAgIHhoci5zZW5kKCk7XG4gIH07XG59KSgpO1xuXG5cbmV4cG9ydHMuaW5pdFBsYXlTYW1wbGUgPSBmdW5jdGlvbihjdHgpIHtcblxuICAoZnVuY3Rpb24oKSB7XG4gICAgdmFyIGZpbGVOYW1lID0gJ2F1ZGlvLycgKyBMT09LVVBfVEFCTEVbY3R4LmN1cnJlbnRNb2RlbF1bMF07XG4gICAgdmFyIGVsID0gJCgnLnBsYXktc2FtcGxlLTEnKTtcbiAgICBlbC5vZmYoJ2NsaWNrJyk7XG4gICAgdmFyIGljb25OYW1lID0gJ3BsYXknO1xuICAgIHZhciBpbWFnZVRhZyA9IGVsLmZpbmQoJ2ltZycpO1xuICAgIGVsLmNsaWNrKCBmdW5jdGlvbihldnQpIHtcbiAgICAgIHBsYXlTYW1wbGUoY3R4LnRva2VuLCBpbWFnZVRhZywgaWNvbk5hbWUsIGZpbGVOYW1lLCBmdW5jdGlvbihyZXN1bHQpIHtcbiAgICAgICAgY29uc29sZS5sb2coJ1BsYXkgc2FtcGxlIHJlc3VsdCcsIHJlc3VsdCk7XG4gICAgICB9KTtcbiAgICB9KTtcbiAgfSkoY3R4LCBMT09LVVBfVEFCTEUpO1xuXG4gIChmdW5jdGlvbigpIHtcbiAgICB2YXIgZmlsZU5hbWUgPSAnYXVkaW8vJyArIExPT0tVUF9UQUJMRVtjdHguY3VycmVudE1vZGVsXVsxXTtcbiAgICB2YXIgZWwgPSAkKCcucGxheS1zYW1wbGUtMicpO1xuICAgIGVsLm9mZignY2xpY2snKTtcbiAgICB2YXIgaWNvbk5hbWUgPSAncGxheSc7XG4gICAgdmFyIGltYWdlVGFnID0gZWwuZmluZCgnaW1nJyk7XG4gICAgZWwuY2xpY2soIGZ1bmN0aW9uKGV2dCkge1xuICAgICAgcGxheVNhbXBsZShjdHgudG9rZW4sIGltYWdlVGFnLCBpY29uTmFtZSwgZmlsZU5hbWUsIGZ1bmN0aW9uKHJlc3VsdCkge1xuICAgICAgICBjb25zb2xlLmxvZygnUGxheSBzYW1wbGUgcmVzdWx0JywgcmVzdWx0KTtcbiAgICAgIH0pO1xuICAgIH0pO1xuICB9KShjdHgsIExPT0tVUF9UQUJMRSk7XG5cbn07IiwiXG4ndXNlIHN0cmljdCc7XG5cbnZhciBNaWNyb3Bob25lID0gcmVxdWlyZSgnLi4vTWljcm9waG9uZScpO1xudmFyIGhhbmRsZU1pY3JvcGhvbmUgPSByZXF1aXJlKCcuLi9oYW5kbGVtaWNyb3Bob25lJykuaGFuZGxlTWljcm9waG9uZTtcbnZhciBzaG93RXJyb3IgPSByZXF1aXJlKCcuL3Nob3dlcnJvcicpLnNob3dFcnJvcjtcblxuZXhwb3J0cy5pbml0UmVjb3JkQnV0dG9uID0gZnVuY3Rpb24oY3R4KSB7XG5cbiAgdmFyIHJlY29yZEJ1dHRvbiA9ICQoJyNyZWNvcmRCdXR0b24nKTtcblxuICByZWNvcmRCdXR0b24uY2xpY2soKGZ1bmN0aW9uKCkge1xuXG4gICAgdmFyIHJ1bm5pbmcgPSBmYWxzZTtcbiAgICB2YXIgdG9rZW4gPSBjdHgudG9rZW47XG4gICAgdmFyIG1pY09wdGlvbnMgPSB7XG4gICAgICBidWZmZXJTaXplOiBjdHguYnVmZmVyc2l6ZVxuICAgIH07XG4gICAgdmFyIG1pYyA9IG5ldyBNaWNyb3Bob25lKG1pY09wdGlvbnMpO1xuXG4gICAgcmV0dXJuIGZ1bmN0aW9uKGV2dCkge1xuICAgICAgLy8gUHJldmVudCBkZWZhdWx0IGFuY2hvciBiZWhhdmlvclxuICAgICAgZXZ0LnByZXZlbnREZWZhdWx0KCk7XG5cbiAgICAgIHZhciBjdXJyZW50TW9kZWwgPSBsb2NhbFN0b3JhZ2UuZ2V0SXRlbSgnY3VycmVudE1vZGVsJyk7XG4gICAgICB2YXIgY3VycmVudGx5RGlzcGxheWluZyA9IEpTT04ucGFyc2UobG9jYWxTdG9yYWdlLmdldEl0ZW0oJ2N1cnJlbnRseURpc3BsYXlpbmcnKSk7XG5cbiAgICAgIGlmIChjdXJyZW50bHlEaXNwbGF5aW5nKSB7XG4gICAgICAgIHNob3dFcnJvcignQ3VycmVudGx5IGFub3RoZXIgZmlsZSBpcyBwbGF5aW5nLCBwbGVhc2Ugc3RvcCB0aGUgZmlsZSBvciB3YWl0IHVudGlsIGl0IGZpbmlzaGVzJyk7XG4gICAgICAgIHJldHVybjtcbiAgICAgIH1cblxuICAgICAgaWYgKCFydW5uaW5nKSB7XG4gICAgICAgIGNvbnNvbGUubG9nKCdOb3QgcnVubmluZywgaGFuZGxlTWljcm9waG9uZSgpJyk7XG4gICAgICAgIGhhbmRsZU1pY3JvcGhvbmUodG9rZW4sIGN1cnJlbnRNb2RlbCwgbWljLCBmdW5jdGlvbihlcnIsIHNvY2tldCkge1xuICAgICAgICAgIGlmIChlcnIpIHtcbiAgICAgICAgICAgIHZhciBtc2cgPSAnRXJyb3I6ICcgKyBlcnIubWVzc2FnZTtcbiAgICAgICAgICAgIGNvbnNvbGUubG9nKG1zZyk7XG4gICAgICAgICAgICBzaG93RXJyb3IobXNnKTtcbiAgICAgICAgICAgIHJ1bm5pbmcgPSBmYWxzZTtcbiAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgcmVjb3JkQnV0dG9uLmNzcygnYmFja2dyb3VuZC1jb2xvcicsICcjZDc0MTA4Jyk7XG4gICAgICAgICAgICByZWNvcmRCdXR0b24uZmluZCgnaW1nJykuYXR0cignc3JjJywgJ2ltYWdlcy9zdG9wLnN2ZycpO1xuICAgICAgICAgICAgY29uc29sZS5sb2coJ3N0YXJ0aW5nIG1pYycpO1xuICAgICAgICAgICAgbWljLnJlY29yZCgpO1xuICAgICAgICAgICAgcnVubmluZyA9IHRydWU7XG4gICAgICAgICAgfVxuICAgICAgICB9KTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIGNvbnNvbGUubG9nKCdTdG9wcGluZyBtaWNyb3Bob25lLCBzZW5kaW5nIHN0b3AgYWN0aW9uIG1lc3NhZ2UnKTtcbiAgICAgICAgcmVjb3JkQnV0dG9uLnJlbW92ZUF0dHIoJ3N0eWxlJyk7XG4gICAgICAgIHJlY29yZEJ1dHRvbi5maW5kKCdpbWcnKS5hdHRyKCdzcmMnLCAnaW1hZ2VzL21pY3JvcGhvbmUuc3ZnJyk7XG4gICAgICAgICQucHVibGlzaCgnaGFyZHNvY2tldHN0b3AnKTtcbiAgICAgICAgbWljLnN0b3AoKTtcbiAgICAgICAgcnVubmluZyA9IGZhbHNlO1xuICAgICAgfVxuICAgIH1cbiAgfSkoKSk7XG59IiwiXG52YXIgaW5pdFBsYXlTYW1wbGUgPSByZXF1aXJlKCcuL3BsYXlzYW1wbGUnKS5pbml0UGxheVNhbXBsZTtcblxuZXhwb3J0cy5pbml0U2VsZWN0TW9kZWwgPSBmdW5jdGlvbihjdHgpIHtcblxuICBmdW5jdGlvbiBpc0RlZmF1bHQobW9kZWwpIHtcbiAgICByZXR1cm4gbW9kZWwgPT09ICdlbi1VU19Ccm9hZGJhbmRNb2RlbCc7XG4gIH1cblxuICBjdHgubW9kZWxzLmZvckVhY2goZnVuY3Rpb24obW9kZWwpIHtcbiAgICAkKFwiI2Ryb3Bkb3duTWVudUxpc3RcIikuYXBwZW5kKFxuICAgICAgJChcIjxsaT5cIilcbiAgICAgICAgLmF0dHIoJ3JvbGUnLCAncHJlc2VudGF0aW9uJylcbiAgICAgICAgLmFwcGVuZChcbiAgICAgICAgICAkKCc8YT4nKS5hdHRyKCdyb2xlJywgJ21lbnUtaXRlbScpXG4gICAgICAgICAgICAuYXR0cignaHJlZicsICcvJylcbiAgICAgICAgICAgIC5hdHRyKCdkYXRhLW1vZGVsJywgbW9kZWwubmFtZSlcbiAgICAgICAgICAgIC5hcHBlbmQobW9kZWwuZGVzY3JpcHRpb24pXG4gICAgICAgICAgKVxuICAgICAgKVxuICB9KTtcblxuICAkKFwiI2Ryb3Bkb3duTWVudUxpc3RcIikuY2xpY2soZnVuY3Rpb24oZXZ0KSB7XG4gICAgZXZ0LnByZXZlbnREZWZhdWx0KCk7XG4gICAgZXZ0LnN0b3BQcm9wYWdhdGlvbigpO1xuICAgIGNvbnNvbGUubG9nKCdDaGFuZ2UgdmlldycsICQoZXZ0LnRhcmdldCkudGV4dCgpKTtcbiAgICB2YXIgbmV3TW9kZWxEZXNjcmlwdGlvbiA9ICQoZXZ0LnRhcmdldCkudGV4dCgpO1xuICAgIHZhciBuZXdNb2RlbCA9ICQoZXZ0LnRhcmdldCkuZGF0YSgnbW9kZWwnKTtcbiAgICAkKCcjZHJvcGRvd25NZW51RGVmYXVsdCcpLmVtcHR5KCkudGV4dChuZXdNb2RlbERlc2NyaXB0aW9uKTtcbiAgICAkKCcjZHJvcGRvd25NZW51MScpLmRyb3Bkb3duKCd0b2dnbGUnKTtcbiAgICBsb2NhbFN0b3JhZ2Uuc2V0SXRlbSgnY3VycmVudE1vZGVsJywgbmV3TW9kZWwpO1xuICAgIGN0eC5jdXJyZW50TW9kZWwgPSBuZXdNb2RlbDtcbiAgICBpbml0UGxheVNhbXBsZShjdHgpO1xuICAgICQucHVibGlzaCgnY2xlYXJzY3JlZW4nKTtcbiAgfSk7XG5cbn0iLCJcbid1c2Ugc3RyaWN0JztcblxuZXhwb3J0cy5pbml0U2Vzc2lvblBlcm1pc3Npb25zID0gZnVuY3Rpb24oKSB7XG4gIGNvbnNvbGUubG9nKCdJbml0aWFsaXppbmcgc2Vzc2lvbiBwZXJtaXNzaW9ucyBoYW5kbGVyJyk7XG4gIC8vIFJhZGlvIGJ1dHRvbnNcbiAgdmFyIHNlc3Npb25QZXJtaXNzaW9uc1JhZGlvID0gJChcIiNzZXNzaW9uUGVybWlzc2lvbnNSYWRpb0dyb3VwIGlucHV0W3R5cGU9J3JhZGlvJ11cIik7XG4gIHNlc3Npb25QZXJtaXNzaW9uc1JhZGlvLmNsaWNrKGZ1bmN0aW9uKGV2dCkge1xuICAgIHZhciBjaGVja2VkVmFsdWUgPSBzZXNzaW9uUGVybWlzc2lvbnNSYWRpby5maWx0ZXIoJzpjaGVja2VkJykudmFsKCk7XG4gICAgY29uc29sZS5sb2coJ2NoZWNrZWRWYWx1ZScsIGNoZWNrZWRWYWx1ZSk7XG4gICAgbG9jYWxTdG9yYWdlLnNldEl0ZW0oJ3Nlc3Npb25QZXJtaXNzaW9ucycsIGNoZWNrZWRWYWx1ZSk7XG4gIH0pO1xufVxuIiwiXG4ndXNlIHN0cmljdCc7XG5cbmV4cG9ydHMuc2hvd0Vycm9yID0gZnVuY3Rpb24obXNnKSB7XG4gIGNvbnNvbGUubG9nKCdFcnJvcjogJywgbXNnKTtcbiAgdmFyIGVycm9yQWxlcnQgPSAkKCcuZXJyb3Itcm93Jyk7XG4gIGVycm9yQWxlcnQuaGlkZSgpO1xuICBlcnJvckFsZXJ0LmNzcygnYmFja2dyb3VuZC1jb2xvcicsICcjZDc0MTA4Jyk7XG4gIGVycm9yQWxlcnQuY3NzKCdjb2xvcicsICd3aGl0ZScpO1xuICB2YXIgZXJyb3JNZXNzYWdlID0gJCgnI2Vycm9yTWVzc2FnZScpO1xuICBlcnJvck1lc3NhZ2UudGV4dChtc2cpO1xuICBlcnJvckFsZXJ0LnNob3coKTtcbiAgJCgnI2Vycm9yQ2xvc2UnKS5jbGljayhmdW5jdGlvbihlKSB7XG4gICAgZS5wcmV2ZW50RGVmYXVsdCgpO1xuICAgIGVycm9yQWxlcnQuaGlkZSgpO1xuICAgIHJldHVybiBmYWxzZTtcbiAgfSk7XG59XG5cbmV4cG9ydHMuc2hvd05vdGljZSA9IGZ1bmN0aW9uKG1zZykge1xuICBjb25zb2xlLmxvZygnTm90aWNlOiAnLCBtc2cpO1xuICB2YXIgbm90aWNlQWxlcnQgPSAkKCcubm90aWZpY2F0aW9uLXJvdycpO1xuICBub3RpY2VBbGVydC5oaWRlKCk7XG4gIG5vdGljZUFsZXJ0LmNzcygnYm9yZGVyJywgJzJweCBzb2xpZCAjZWNlY2VjJyk7XG4gIG5vdGljZUFsZXJ0LmNzcygnYmFja2dyb3VuZC1jb2xvcicsICcjZjRmNGY0Jyk7XG4gIG5vdGljZUFsZXJ0LmNzcygnY29sb3InLCAnYmxhY2snKTtcbiAgdmFyIG5vdGljZU1lc3NhZ2UgPSAkKCcjbm90aWZpY2F0aW9uTWVzc2FnZScpO1xuICBub3RpY2VNZXNzYWdlLnRleHQobXNnKTtcbiAgbm90aWNlQWxlcnQuc2hvdygpO1xuICAkKCcjbm90aWZpY2F0aW9uQ2xvc2UnKS5jbGljayhmdW5jdGlvbihlKSB7XG4gICAgZS5wcmV2ZW50RGVmYXVsdCgpO1xuICAgIG5vdGljZUFsZXJ0LmhpZGUoKTtcbiAgICByZXR1cm4gZmFsc2U7XG4gIH0pO1xufVxuXG5leHBvcnRzLmhpZGVFcnJvciA9IGZ1bmN0aW9uKCkge1xuICB2YXIgZXJyb3JBbGVydCA9ICQoJy5lcnJvci1yb3cnKTtcbiAgZXJyb3JBbGVydC5oaWRlKCk7XG59IiwiXG5cbmV4cG9ydHMuaW5pdFNob3dUYWIgPSBmdW5jdGlvbigpIHtcbiAgJCgnI25hdi10YWJzIGEnKS5vbihcImNsaWNrXCIsIGZ1bmN0aW9uIChlKSB7XG4gICAgZS5wcmV2ZW50RGVmYXVsdCgpXG4gICAgJCh0aGlzKS50YWIoJ3Nob3cnKVxuICB9KTtcbn1cbiIsIi8qKlxuICogQ29weXJpZ2h0IDIwMTQgSUJNIENvcnAuIEFsbCBSaWdodHMgUmVzZXJ2ZWQuXG4gKlxuICogTGljZW5zZWQgdW5kZXIgdGhlIEFwYWNoZSBMaWNlbnNlLCBWZXJzaW9uIDIuMCAodGhlIFwiTGljZW5zZVwiKTtcbiAqIHlvdSBtYXkgbm90IHVzZSB0aGlzIGZpbGUgZXhjZXB0IGluIGNvbXBsaWFuY2Ugd2l0aCB0aGUgTGljZW5zZS5cbiAqIFlvdSBtYXkgb2J0YWluIGEgY29weSBvZiB0aGUgTGljZW5zZSBhdFxuICpcbiAqICAgICAgaHR0cDovL3d3dy5hcGFjaGUub3JnL2xpY2Vuc2VzL0xJQ0VOU0UtMi4wXG4gKlxuICogVW5sZXNzIHJlcXVpcmVkIGJ5IGFwcGxpY2FibGUgbGF3IG9yIGFncmVlZCB0byBpbiB3cml0aW5nLCBzb2Z0d2FyZVxuICogZGlzdHJpYnV0ZWQgdW5kZXIgdGhlIExpY2Vuc2UgaXMgZGlzdHJpYnV0ZWQgb24gYW4gXCJBUyBJU1wiIEJBU0lTLFxuICogV0lUSE9VVCBXQVJSQU5USUVTIE9SIENPTkRJVElPTlMgT0YgQU5ZIEtJTkQsIGVpdGhlciBleHByZXNzIG9yIGltcGxpZWQuXG4gKiBTZWUgdGhlIExpY2Vuc2UgZm9yIHRoZSBzcGVjaWZpYyBsYW5ndWFnZSBnb3Zlcm5pbmcgcGVybWlzc2lvbnMgYW5kXG4gKiBsaW1pdGF0aW9ucyB1bmRlciB0aGUgTGljZW5zZS5cbiAqL1xuLypnbG9iYWwgJDpmYWxzZSAqL1xuXG4ndXNlIHN0cmljdCc7XG5cbnZhciBNaWNyb3Bob25lID0gcmVxdWlyZSgnLi9NaWNyb3Bob25lJyk7XG52YXIgbW9kZWxzID0gcmVxdWlyZSgnLi9kYXRhL21vZGVscy5qc29uJykubW9kZWxzO1xudmFyIHV0aWxzID0gcmVxdWlyZSgnLi91dGlscycpO1xudXRpbHMuaW5pdFB1YlN1YigpO1xudmFyIGluaXRWaWV3cyA9IHJlcXVpcmUoJy4vdmlld3MnKS5pbml0Vmlld3M7XG52YXIgcGtnID0gcmVxdWlyZSgnLi4vcGFja2FnZS5qc29uJyk7XG5cbndpbmRvdy5CVUZGRVJTSVpFID0gODE5MjtcblxuJChkb2N1bWVudCkucmVhZHkoZnVuY3Rpb24oKSB7XG5cbiAgLy8gVGVtcG9yYXJ5IGFwcCBkYXRhXG4gICQoJyNhcHBTZXR0aW5ncycpXG4gICAgLmh0bWwoXG4gICAgICAnPHA+VmVyc2lvbjogJyArIHBrZy52ZXJzaW9uICsgJzwvcD4nXG4gICAgICArICc8cD5CdWZmZXIgU2l6ZTogJyArIEJVRkZFUlNJWkUgKyAnPC9wPidcbiAgICApO1xuXG5cbiAgLy8gTWFrZSBjYWxsIHRvIEFQSSB0byB0cnkgYW5kIGdldCB0b2tlblxuICB1dGlscy5nZXRUb2tlbihmdW5jdGlvbih0b2tlbikge1xuXG4gICAgd2luZG93Lm9uYmVmb3JldW5sb2FkID0gZnVuY3Rpb24oZSkge1xuICAgICAgbG9jYWxTdG9yYWdlLmNsZWFyKCk7XG4gICAgfTtcblxuICAgIGlmICghdG9rZW4pIHtcbiAgICAgIGNvbnNvbGUuZXJyb3IoJ05vIGF1dGhvcml6YXRpb24gdG9rZW4gYXZhaWxhYmxlJyk7XG4gICAgICBjb25zb2xlLmVycm9yKCdBdHRlbXB0aW5nIHRvIHJlY29ubmVjdC4uLicpO1xuICAgIH1cblxuICAgIHZhciB2aWV3Q29udGV4dCA9IHtcbiAgICAgIGN1cnJlbnRNb2RlbDogJ2VuLVVTX0Jyb2FkYmFuZE1vZGVsJyxcbiAgICAgIG1vZGVsczogbW9kZWxzLFxuICAgICAgdG9rZW46IHRva2VuLFxuICAgICAgYnVmZmVyU2l6ZTogQlVGRkVSU0laRVxuICAgIH07XG5cbiAgICBpbml0Vmlld3Modmlld0NvbnRleHQpO1xuXG4gICAgLy8gU2F2ZSBtb2RlbHMgdG8gbG9jYWxzdG9yYWdlXG4gICAgbG9jYWxTdG9yYWdlLnNldEl0ZW0oJ21vZGVscycsIEpTT04uc3RyaW5naWZ5KG1vZGVscykpO1xuXG4gICAgLy8gU2V0IGRlZmF1bHQgY3VycmVudCBtb2RlbFxuICAgIGxvY2FsU3RvcmFnZS5zZXRJdGVtKCdjdXJyZW50TW9kZWwnLCAnZW4tVVNfQnJvYWRiYW5kTW9kZWwnKTtcbiAgICBsb2NhbFN0b3JhZ2Uuc2V0SXRlbSgnc2Vzc2lvblBlcm1pc3Npb25zJywgJ3RydWUnKTtcbiAgICBsb2NhbFN0b3JhZ2Uuc2V0SXRlbSgnbWljUnVubmluZycsICdmYWxzZScpO1xuXG5cbiAgICAkLnN1YnNjcmliZSgnY2xlYXJzY3JlZW4nLCBmdW5jdGlvbigpIHtcbiAgICAgICQoJyNyZXN1bHRzVGV4dCcpLnRleHQoJycpO1xuICAgICAgJCgnI3Jlc3VsdHNKU09OJykudGV4dCgnJyk7XG4gICAgICAkKCcuZXJyb3Itcm93JykuaGlkZSgpO1xuICAgICAgJCgnLm5vdGlmaWNhdGlvbi1yb3cnKS5oaWRlKCk7XG4gICAgICAkKCcuaHlwb3RoZXNlcyA+IHVsJykuZW1wdHkoKTtcbiAgICAgICQoJyNtZXRhZGF0YVRhYmxlQm9keScpLmVtcHR5KCk7XG4gICAgfSk7XG5cbiAgfSk7XG5cbn0pOyJdfQ==
