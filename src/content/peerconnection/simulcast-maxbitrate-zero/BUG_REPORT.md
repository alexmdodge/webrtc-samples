# What steps will reproduce the problem?

1. Call `RTCPeerConnection.addTransceiver()` with `sendEncodings` containing a simulcast layer with and `maxBitrate: 0`

2. Reproduction page: https://alexmdodge.github.io/webrtc-samples/src/content/peerconnection/simulcast-maxbitrate-zero/index.html

3. Click "Trigger Range Error (maxBitrate: 0)"

# What is the expected result?

`addTransceiver()` accepts `maxBitrate: 0` on a disabled encoding (`active: false`). Currently our implementation is setting `maxBitrate: 0` on inactive simulcast layers as an intentional pattern to indicate no bandwidth budget should be allocated. Understandably this has no meaningful representation when `active: true`, and given how `setParameters` can be updated, it makes sense enforcement is independent of encoding `active` state.

That said, there does appear to be some discrepancies in the spec:
* MDN (https://developer.mozilla.org/en-US/docs/Web/API/RTCRtpSender/setParameters#encodings) documents `maxBitrate` as "a positive integer,"
* The W3C WebRTC spec (https://w3c.github.io/webrtc-pc/#ref-for-dom-rtcrtpencodingparameters-maxbitrate-4) does not constrain valid values for `maxBitrate`.
* The RFC 3890 §6.2.2 (https://datatracker.ietf.org/doc/html/rfc3890#section-6.2.2) for computing Transport Independent Application Specific Maximum (TIAS) indicates the overall value can be "an integer bit-rate value in bits per second" representing "the maximum needed by the application."
* The spec and MDN also does specify `(a bitrate of zero might allow just one frame to be sent)`

In this case because zero is being set on an `active: false` encoding, the hope is that the transceiver could fail more gracefully, or at minimum warn of an invalid range case instead of a fatal error. It also appears that `maxFramerate` has not been changed, and zero is still valid.

# What do you see instead?

* Transceiver configuration fails with a fatal error:
```
RangeError: Failed to execute 'addTransceiver' on 'RTCPeerConnection': maxBitrate must be greater than 0
```
* PeerConnection setup fails for outbound Simulcast media, users unable to proceed with session establishment

# What version of the product are you using?

- Chrome Beta 152.0.7977.30-1 (first affected version tested)
- Chrome Beta 153.0.8002.0 (verified most recent beta)
- Not reproducible on Chrome Beta 151.0.7922.47-1

# On what operating system?

- OS: Linux (Ubuntu), also reproducible on Windows and macOS
- Version: Ubuntu 22.04 / macOS 15
