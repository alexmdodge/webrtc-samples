# WebRTC PC1 Loss Stats Example Updates

## Summary

Updated the `src/content/peerconnection/pc1-loss-stats/` example to include bandwidth estimation and target bitrate dashboards below the existing loss dashboards.

## Changes Made

### HTML (`index.html`)
- Added two new graph containers:
  - `available-outgoing-bitrate`: Displays `availableOutgoingBitrate` from `RTCIceCandidatePairStats`
  - `target-bitrate`: Displays `targetBitrate` from `RTCOutboundRtpStreamStats` (video)

### JavaScript (`js/stats.js`)
- Added new graph series and samples tracking for bandwidth metrics
- Added `sampleCandidatePairStats()` function to extract ICE candidate pair stats with `stat.nominated` check
- Added `updateBandwidthGraphs()` function to handle `availableOutgoingBitrate` visualization
- Added `updateTargetBitrateGraphs()` function to handle target bitrate from outbound RTP stats
- Updated `setupOutboundStatsGraphs()` to initialize new graph components
- Updated polling interval to collect and display the new metrics

## Key Technical Details

- Bandwidth estimation uses `RTCIceCandidatePairStats.availableOutgoingBitrate` (not video-specific)
- Target bitrate uses `RTCOutboundRtpStreamStats.targetBitrate` for video streams
- ICE candidate pair filtering uses `stat.nominated` instead of `stat.state === 'succeeded'`
- Values converted from bps to kbps for display
