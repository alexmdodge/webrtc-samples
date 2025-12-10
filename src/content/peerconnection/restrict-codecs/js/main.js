'use strict';

const startButton = document.getElementById('startButton');
const callButton = document.getElementById('callButton');
const hangupButton = document.getElementById('hangupButton');
const codecPreferences = document.getElementById('codecPreferences');
const activeCodecDiv = document.getElementById('activeCodec');

callButton.disabled = true;
hangupButton.disabled = true;

startButton.addEventListener('click', start);
callButton.addEventListener('click', call);
hangupButton.addEventListener('click', hangup);

let startTime;
let localVideo = document.getElementById('localVideo');
let remoteVideo = document.getElementById('remoteVideo');

let localStream;
let pc1;
let pc2;

const CODEC_GROUPS = {
  'H.264': 'video/H264',
  'H.265': 'video/H265',
  'AV1': 'video/AV01',
  'VP9': 'video/VP9',
  'VP8': 'video/VP8'
};

const supportsSetCodecPreferences = window.RTCRtpTransceiver &&
  'setCodecPreferences' in window.RTCRtpTransceiver.prototype;

function populateCodecDropdown() {
  if (!supportsSetCodecPreferences) return;
  
  const {codecs} = RTCRtpReceiver.getCapabilities('video');
  
  Object.entries(CODEC_GROUPS).forEach(([groupName, mimeType]) => {
    const groupCodecs = codecs.filter(c => c.mimeType === mimeType);
    if (groupCodecs.length > 0) {
      const option = document.createElement('option');
      option.value = mimeType;
      option.innerText = groupName;
      codecPreferences.appendChild(option);
    }
  });
  codecPreferences.disabled = false;
}

async function start() {
  console.log('Requesting local stream');
  startButton.disabled = true;
  try {
    const stream = await navigator.mediaDevices.getUserMedia({audio: true, video: true});
    console.log('Received local stream');
    localVideo.srcObject = stream;
    localStream = stream;
    callButton.disabled = false;
    populateCodecDropdown();
  } catch (e) {
    alert(`getUserMedia() error: ${e.name}`);
  }
}

async function call() {
  callButton.disabled = true;
  hangupButton.disabled = false;
  console.log('Starting call');
  startTime = window.performance.now();
  
  const configuration = {};
  console.log('RTCPeerConnection configuration:', configuration);
  pc1 = new RTCPeerConnection(configuration);
  console.log('Created local peer connection object pc1');
  pc1.addEventListener('icecandidate', e => onIceCandidate(pc1, e));
  
  pc2 = new RTCPeerConnection(configuration);
  console.log('Created remote peer connection object pc2');
  pc2.addEventListener('icecandidate', e => onIceCandidate(pc2, e));
  pc2.addEventListener('track', gotRemoteStream);

  localStream.getTracks().forEach(track => {
    pc1.addTrack(track, localStream);
  });
  console.log('Added local stream to pc1');

  try {
    console.log('pc1 createOffer start');
    const offer = await pc1.createOffer();
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
  if (remoteVideo.srcObject !== e.streams[0]) {
    remoteVideo.srcObject = e.streams[0];
    console.log('pc2 received remote stream');
  }

  if (e.track.kind === 'video' && supportsSetCodecPreferences) {
    const preferredGroup = codecPreferences.options[codecPreferences.selectedIndex];
    if (preferredGroup.value !== '') {
      const {codecs} = RTCRtpReceiver.getCapabilities('video');
      const filteredCodecs = codecs.filter(codec => {
        if (['video/red', 'video/ulpfec', 'video/rtx', 'video/flexfec-03'].includes(codec.mimeType)) {
          return false;
        }
        return codec.mimeType === preferredGroup.value;
      });
      
      if (filteredCodecs.length > 0) {
        e.transceiver.setCodecPreferences(filteredCodecs);
        console.log(`Restricted to codec group: ${preferredGroup.innerText}`);
      }
    }
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

function getName(pc) {
  return (pc === pc1) ? 'pc1' : 'pc2';
}

function getOtherPc(pc) {
  return (pc === pc1) ? pc2 : pc1;
}

function hangup() {
  console.log('Ending call');
  pc1.close();
  pc2.close();
  pc1 = null;
  pc2 = null;
  hangupButton.disabled = true;
  callButton.disabled = false;
  activeCodecDiv.textContent = '';
}

// Monitor active codec
setInterval(async () => {
  if (pc2 && pc2.connectionState === 'connected') {
    const stats = await pc2.getStats();
    stats.forEach(report => {
      if (report.type === 'inbound-rtp' && report.kind === 'video') {
        const codecStats = [...stats.values()].find(s => s.type === 'codec' && s.id === report.codecId);
        if (codecStats) {
          activeCodecDiv.textContent = `Active codec: ${codecStats.mimeType}`;
        }
      }
    });
  }
}, 1000);
