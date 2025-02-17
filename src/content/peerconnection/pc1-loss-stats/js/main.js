/*
 *  Copyright (c) 2015 The WebRTC project authors. All Rights Reserved.
 *
 *  Use of this source code is governed by a BSD-style license
 *  that can be found in the LICENSE file in the root of the source
 *  tree.
 */

import {pollOutboundStats, pollInboundStats, clearStatsPolling} from './stats.js';

const startButton = document.getElementById('startButton');
const callButton = document.getElementById('callButton');
const hangupButton = document.getElementById('hangupButton');
callButton.disabled = true;
hangupButton.disabled = true;
startButton.addEventListener('click', start);
callButton.addEventListener('click', call);
hangupButton.addEventListener('click', hangup);

let startTime;
const localVideo = document.getElementById('localVideo');
const remoteVideo = document.getElementById('remoteVideo');

localVideo.addEventListener('loadedmetadata', function() {
  console.log(`Local video videoWidth: ${this.videoWidth}px,  videoHeight: ${this.videoHeight}px`);
});

remoteVideo.addEventListener('loadedmetadata', function() {
  console.log(`Remote video videoWidth: ${this.videoWidth}px,  videoHeight: ${this.videoHeight}px`);
});

remoteVideo.addEventListener('resize', () => {
  console.log(`Remote video size changed to ${remoteVideo.videoWidth}x${remoteVideo.videoHeight} - Time since pageload ${performance.now().toFixed(0)}ms`);
  // We'll use the first onsize callback as an indication that video has started
  // playing out.
  if (startTime) {
    const elapsedTime = window.performance.now() - startTime;
    console.log('Setup time: ' + elapsedTime.toFixed(3) + 'ms');
    startTime = null;
  }
});

let localStream;
let pc1;
let pc2;
const offerOptions = {
  offerToReceiveAudio: 1,
  offerToReceiveVideo: 1
};

function getName(pc) {
  return (pc === pc1) ? 'pc1' : 'pc2';
}

function getOtherPc(pc) {
  return (pc === pc1) ? pc2 : pc1;
}

async function start() {
  console.log('Requesting local stream');
  startButton.disabled = true;
  try {
    // const stream = await navigator.mediaDevices.getUserMedia({audio: true, video: true});
    const stream = syntheticVideoStream();
    console.log('Received local stream');
    localVideo.srcObject = stream;
    localStream = stream;
    callButton.disabled = false;
  } catch (e) {
    alert(`getUserMedia() error: ${e.name}`);
  }
}

async function call() {
  callButton.disabled = true;
  hangupButton.disabled = false;
  console.log('Starting call');
  startTime = window.performance.now();

  const videoTracks = localStream.getVideoTracks();
  const audioTracks = localStream.getAudioTracks();

  if (videoTracks.length > 0) {
    console.log(`Using video device: ${videoTracks[0].label}`);
  }
  if (audioTracks.length > 0) {
    console.log(`Using audio device: ${audioTracks[0].label}`);
  }

  const configuration = {};
  console.log('RTCPeerConnection configuration:', configuration);
  pc1 = new RTCPeerConnection(configuration);
  console.log('Created local peer connection object pc1');

  pc1.addEventListener('icecandidate', e => onIceCandidate(pc1, e));
  pc2 = new RTCPeerConnection(configuration);
  console.log('Created remote peer connection object pc2');

  pc2.addEventListener('icecandidate', e => onIceCandidate(pc2, e));
  pc1.addEventListener('iceconnectionstatechange', e => onIceStateChange(pc1, e));
  pc2.addEventListener('iceconnectionstatechange', e => onIceStateChange(pc2, e));
  pc2.addEventListener('track', gotRemoteStream);

  localStream.getTracks().forEach(track => pc1.addTrack(track, localStream));
  console.log('Added local stream to pc1');

  pollOutboundStats(pc1.getSenders());

  try {
    console.log('pc1 createOffer start');
    const offer = await pc1.createOffer(offerOptions);
    await onCreateOfferSuccess(offer);
  } catch (e) {
    onCreateSessionDescriptionError(e);
  }
}

function onCreateSessionDescriptionError(error) {
  console.log(`Failed to create session description: ${error.toString()}`);
}

async function onCreateOfferSuccess(desc) {
  console.log(`Offer from pc1\n${desc.sdp}`);
  console.log('pc1 setLocalDescription start');
  try {
    await pc1.setLocalDescription(desc);
    onSetLocalSuccess(pc1);
  } catch (e) {
    onSetSessionDescriptionError();
  }

  console.log('pc2 setRemoteDescription start');
  try {
    await pc2.setRemoteDescription(desc);
    onSetRemoteSuccess(pc2);
  } catch (e) {
    onSetSessionDescriptionError();
  }

  console.log('pc2 createAnswer start');
  // Since the 'remote' side has no media stream we need
  // to pass in the right constraints in order for it to
  // accept the incoming offer of audio and video.
  try {
    const answer = await pc2.createAnswer();
    await onCreateAnswerSuccess(answer);
  } catch (e) {
    onCreateSessionDescriptionError(e);
  }
}

function onSetLocalSuccess(pc) {
  console.log(`${getName(pc)} setLocalDescription complete`);
}

function onSetRemoteSuccess(pc) {
  console.log(`${getName(pc)} setRemoteDescription complete`);
}

function onSetSessionDescriptionError(error) {
  console.log(`Failed to set session description: ${error.toString()}`);
}

function gotRemoteStream(e) {
  pollInboundStats(pc2.getReceivers());

  if (remoteVideo.srcObject !== e.streams[0]) {
    remoteVideo.srcObject = e.streams[0];
    console.log('pc2 received remote stream');
  }
}

async function onCreateAnswerSuccess(desc) {
  console.log(`Answer from pc2:\n${desc.sdp}`);
  console.log('pc2 setLocalDescription start');
  try {
    await pc2.setLocalDescription(desc);
    onSetLocalSuccess(pc2);
  } catch (e) {
    onSetSessionDescriptionError(e);
  }
  console.log('pc1 setRemoteDescription start');
  try {
    await pc1.setRemoteDescription(desc);
    onSetRemoteSuccess(pc1);
  } catch (e) {
    onSetSessionDescriptionError(e);
  }
}

async function onIceCandidate(pc, event) {
  try {
    await (getOtherPc(pc).addIceCandidate(event.candidate));
    onAddIceCandidateSuccess(pc);
  } catch (e) {
    onAddIceCandidateError(pc, e);
  }
  console.log(`${getName(pc)} ICE candidate:\n${event.candidate ? event.candidate.candidate : '(null)'}`);
}

function onAddIceCandidateSuccess(pc) {
  console.log(`${getName(pc)} addIceCandidate success`);
}

function onAddIceCandidateError(pc, error) {
  console.log(`${getName(pc)} failed to add ICE Candidate: ${error.toString()}`);
}

function onIceStateChange(pc, event) {
  if (pc) {
    console.log(`${getName(pc)} ICE state: ${pc.iceConnectionState}`);
    console.log('ICE state change event: ', event);
  }
}

function hangup() {
  clearStatsPolling();
  console.log('Ending call');
  pc1.close();
  pc2.close();
  pc1 = null;
  pc2 = null;
  hangupButton.disabled = true;
  callButton.disabled = false;
}

// Return a number between 0 and maxValue based on the input number,
// so that the output changes smoothly up and down.
function triangle(number, maxValue) {
  const modulus = (maxValue + 1) * 2;
  return Math.abs(number % modulus - maxValue);
}

function syntheticVideoStream({width = 1280, height = 720, signal} = {}) {
  const canvas = Object.assign(
      document.createElement('canvas'), {width, height}
  );
  const ctx = canvas.getContext('2d');
  const stream = canvas.captureStream();

  // **Audio Context and Oscillator Setup**
  const audioCtx = new AudioContext();
  const oscillator = audioCtx.createOscillator();
  const gainNode = audioCtx.createGain(); // Use a gain node to control volume

  oscillator.type = 'sine'; // You can change the waveform type
  oscillator.frequency.value = 220; // Base frequency

  // Connect oscillator to gain node, and gain node to audio context destination
  oscillator.connect(gainNode);
  gainNode.connect(audioCtx.destination);

  // Start the oscillator
  oscillator.start();

  // Vibrato effect (pitch oscillation) using a modulator oscillator
  const modulator = audioCtx.createOscillator();
  const modulatorGain = audioCtx.createGain();

  modulator.frequency.value = 5; // Oscillation speed (Hz)
  modulatorGain.gain.value = 10; // Oscillation depth (in Hz)

  modulator.connect(modulatorGain);
  modulatorGain.connect(oscillator.frequency); // Connect to oscillator's frequency

  modulator.start();

  // Create a MediaStreamAudioDestinationNode
  const destination = audioCtx.createMediaStreamDestination();
  gainNode.connect(destination); // Connect gain node to the destination

  const audioStream = destination.stream; // Get the audio stream

  // Combine the video and audio streams
  const combinedStream = new MediaStream([...stream.getVideoTracks(), ...audioStream.getAudioTracks()]);

  let count = 0;
  setInterval(() => {
    // Use relatively-prime multipliers to get a color roll
    const r = triangle(count*2, 255);
    const g = triangle(count*3, 255);
    const b = triangle(count*5, 255);
    ctx.fillStyle = `rgb(${r}, ${g}, ${b})`;
    count += 1;
    const boxSize=80;
    ctx.fillRect(0, 0, width, height);
    // Add some bouncing boxes in contrast color to add a little more noise.
    const rContrast = (r + 128)%256;
    const gContrast = (g + 128)%256;
    const bContrast = (b + 128)%256;
    ctx.fillStyle = `rgb(${rContrast}, ${gContrast}, ${bContrast})`;
    const xpos = triangle(count*5, width - boxSize);
    const ypos = triangle(count*7, height - boxSize);
    ctx.fillRect(xpos, ypos, boxSize, boxSize);
    const xpos2 = triangle(count*11, width - boxSize);
    const ypos2 = triangle(count*13, height - boxSize);
    ctx.fillRect(xpos2, ypos2, boxSize, boxSize);
    // If signal is set (0-255), add a constant-color box of that luminance to
    // the video frame at coordinates 20 to 60 in both X and Y direction.
    // (big enough to avoid color bleed from surrounding video in some codecs,
    // for more stable tests).
    if (signal != undefined) {
      ctx.fillStyle = `rgb(${signal}, ${signal}, ${signal})`;
      ctx.fillRect(20, 20, 40, 40);
    }
  }, 10);

  return combinedStream;
}
