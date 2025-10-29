/* eslint-disable object-curly-spacing */
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

/**
 * @param {RTCPeerConnection} pc Peer connection to retrieve transceiver from
 */
function forceH264Preferences(pc) {
  /** @type {RTCRtpCodec[]} */
  const codecs = RTCRtpReceiver.getCapabilities('video')?.codecs ?? [];
  const h264Codecs = codecs.filter(c => c.mimeType === 'video/H264');

  if (h264Codecs.length === 0) {
    console.warn('&&& Browser does not support H264 skipping codec force', codecs);
    return;
  }

  /** @type {RTCRtpTransceiver[]} */
  const transceiver = pc.getTransceivers().find((tx) => tx.receiver.track.kind === 'video');

  if (!transceiver) {
    console.error('No transceiver');
    return;
  }

  transceiver.setCodecPreferences(h264Codecs);
  console.log('&&& Forcing h264: ', h264Codecs);
}

/**
 * @param {RTCPeerConnection} pc
 * @param {RTCRtpEncodingParameters[]} encodings
 */
async function updateEncodings(pc, encodings = []) {
  /** @type {RTCRtpTransceiver[]} */
  const transceivers = pc.getTransceivers();
  const videoTransceiver = transceivers.find((ts) => ts.mid === '1');

  if (!videoTransceiver) {
    console.error('No video Transceiver found');
    return;
  }

  const params = videoTransceiver?.sender.getParameters();
  params.encodings = params.encodings.map((encoding) => {
    const rid = encoding.rid ?? 'none';

    const encodingOverride = encodings.find(enc => enc.rid === rid) ?? encodings[0] ?? {};
    return { ...encoding, ...encodingOverride };
  });

  await videoTransceiver.sender.setParameters(params);
  console.log('&&& Current Encodings: ', params);
}

async function start() {
  console.log('Requesting local stream');
  startButton.disabled = true;
  try {
    // Use same constraints as SFU sample for consistency
    const stream = await navigator.mediaDevices.getUserMedia({
      video: {
        width: { ideal: 1920 },
        height: { ideal: 1080 },
        aspectRatio: { ideal: 16 / 9 },
        facingMode: { ideal: 'user' }
      },
      audio: true
    });
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
  // pc2 = new RTCPeerConnection({
  //   iceTransportPolicy: 'relay',
  //   iceServers: [{
  //     urls: 'turn:<ADD_FROM_TOOL>?transport=udp',
  //     username: '<ADD_FROM_TOOL>',
  //     credential: '<ADD_FROM_TOOL>',
  //   }]
  // });
  console.log('Created remote peer connection object pc2');

  pc2.addEventListener('icecandidate', e => onIceCandidate(pc2, e));
  pc1.addEventListener('iceconnectionstatechange', e => onIceStateChange(pc1, e));

  pc1.addEventListener('connectionstatechange', async e => {
    console.log('&&& State changed: ', pc1.connectionState);
    if (pc1.connectionState === 'connected') {
      await updateEncodings(pc1, [{
        maxBitrate: 2500000,
      }]);
    }
  });

  pc2.addEventListener('iceconnectionstatechange', e => onIceStateChange(pc2, e));
  pc2.addEventListener('track', gotRemoteStream);

  localStream.getTracks().forEach(track => pc1.addTrack(track, localStream));
  console.log('Added local stream to pc1');

  pollOutboundStats(pc1.getSenders());

  try {
    console.log('pc1 createOffer start');
    // forceH264Preferences(pc1);
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
