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