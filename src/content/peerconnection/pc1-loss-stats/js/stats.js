/* global TimelineDataSeries, TimelineGraphView */

let outboundReportsTimerId;
let inboundReportsTimerId;

let remoteInboundVideoLossSeriesNoRid;
let remoteInboundVideoLossGraph;
let remoteInboundVideoLossSamples = [];

let inboundVideoLossSeriesNoRid;
let inboundVideoLossGraph;
let inboundVideoLossSamples = [];

function setupOutboundStatsGraphs() {
  remoteInboundVideoLossSamples = [];
  remoteInboundVideoLossSeriesNoRid = new TimelineDataSeries();
  remoteInboundVideoLossGraph = new TimelineGraphView('remote-inbound-video-loss', 'remote-inbound-video-loss-canvas');
  remoteInboundVideoLossGraph.updateEndDate();
}

function setupInboundStatsGraphs() {
  inboundVideoLossSamples = [];
  inboundVideoLossSeriesNoRid = new TimelineDataSeries();
  inboundVideoLossGraph = new TimelineGraphView('inbound-video-loss', 'inbound-video-loss-canvas');
  inboundVideoLossGraph.updateEndDate();
}

export function clearStatsPolling() {
  clearInterval(outboundReportsTimerId);
  clearInterval(inboundReportsTimerId);
  outboundReportsTimerId = undefined;
  inboundReportsTimerId = undefined;
}

export function pollOutboundStats(sender, interval = 1000) {
  if (outboundReportsTimerId) return;
  setupOutboundStatsGraphs();

  outboundReportsTimerId = setInterval(async () => {
    const outbound = await sampleOutboundVideoStats(sender);
    updateOutboundGraphs(outbound);
  }, interval);
}

export function pollInboundStats(receiver, interval = 1000) {
  if (inboundReportsTimerId) return;
  setupInboundStatsGraphs();

  inboundReportsTimerId = setInterval(async () => {
    const inbound = await sampleInboundVideoStats(receiver);
    updateInboundGraphs(inbound);
  }, interval);
}

function updateOutboundGraphs(outbound) {
  if (!outbound) return;

  for (const report of outbound) {
    remoteInboundVideoLossSeriesNoRid.addPoint(report.timestamp, report.fractionLost);
    remoteInboundVideoLossGraph.setDataSeries([remoteInboundVideoLossSeriesNoRid]);
    remoteInboundVideoLossGraph.updateEndDate();
    remoteInboundVideoLossSamples.push(report.fractionLost);
    setMinMaxAvg(remoteInboundVideoLossSamples, 'remote-inbound-video-loss-minmax');
  }
}

function updateInboundGraphs(inbound) {
  if (!inbound) return;

  for (const report of inbound) {
    inboundVideoLossSeriesNoRid.addPoint(report.timestamp, report.fractionLost);
    inboundVideoLossGraph.setDataSeries([inboundVideoLossSeriesNoRid]);
    inboundVideoLossGraph.updateEndDate();
    inboundVideoLossSamples.push(report.fractionLost);
    setMinMaxAvg(inboundVideoLossSamples, 'inbound-video-loss-minmax');
  }
}

/**
 * Outbound Stats
 * https://www.w3.org/TR/webrtc-stats/#outboundrtpstats-dict*
 */
const prevOutboundVideoReports = new Map();

/**
 * @param {RTCRtpSender} sender - RTC Sender Object
 */
async function sampleOutboundVideoStats(sender) {
  const rtcReports = await sender.getStats();
  const reports = Array.from(rtcReports.values());
  const videoReports = parseOutboundVideoReports(reports);

  const prevReports = videoReports.map((report) => {
    const prev = prevOutboundVideoReports.get(report.rid);
    prevOutboundVideoReports.set(report.rid, report);
    return prev;
  });

  return calculateWindowedVideoReports(videoReports, prevReports);
}

const prevInboundVideoReports = new Map();

/**
 * @param {RTCRtpReceiver} receiver - RTC Sender Object
 */
async function sampleInboundVideoStats(receiver) {
  const rtcReports = await receiver.getStats();
  const reports = Array.from(rtcReports.values());
  const videoReports = parseInboundVideoReports(reports);

  const prevReports = videoReports.map((report) => {
    const prev = prevInboundVideoReports.get(report.rid);
    prevInboundVideoReports.set(report.rid, report);
    return prev;
  });

  return calculateWindowedInboundVideoReports(videoReports, prevReports);
}

function parseOutboundVideoReports(reports) {
  const outboundRtp = reports
      .filter((report) => {
        const isRemote = report.isRemote ?? false;
        const kind = report.kind ?? null ? report.kind : 'none';
        const isVideo = kind === 'video';
        return report.type === 'outbound-rtp' && !isRemote && isVideo;
      })
      .reduce((result, untypedReport) => {
        /** @type {RTCOutboundRtpStreamStats} */
        const report = untypedReport;
        const encodeBitrateKbps = (8 * (report.bytesSent ?? 0)) / 1000;
        const retransmittedKbps = (8 * (report.retransmittedBytesSent ?? 0)) / 1000;

        result[`${report.ssrc}`] = {
          local: true,
          type: 'video',
          timestamp: report.timestamp,
          sampleDurationMs: report.timestamp,
          rid: report.rid ?? 'no-rid',
          targetBitrateKbps: (report.targetBitrate ?? 0) / 1000,
          encodeBitrateKbps,
          encodeDurationMs: (report.totalEncodeTime ?? 0) * 1000,
          hugeFramesSent: report.hugeFramesSent,
          keyframesEncoded: report.keyFramesEncoded,
          framesPerSecond: report.framesPerSecond,
          width: report.frameWidth,
          height: report.frameHeight,
          percentBitrateRetransmitted: (retransmittedKbps / encodeBitrateKbps) * 100,
          nackCount: report.nackCount,
        };
        return result;
      }, {});

  const remoteInboundRtp = reports
      .filter((report) => {
        const isRemote = report.isRemote ?? false;
        const kind = report.kind ?? null ? report.kind : 'none';
        const isVideo = kind === 'video';
        return report.type === 'remote-inbound-rtp' && !isRemote && isVideo;
      })
      .reduce((result, report) => {
        result[`${report.ssrc}`] = {
          roundTripTime: report.roundTripTime,
          fractionLost: report.fractionLost,
        };
        return result;
      }, {});

  const outboundVideoReports = [];
  for (const ssrc of Object.keys(outboundRtp)) {
    outboundVideoReports.push({
      ...outboundRtp[ssrc],
      ...remoteInboundRtp[ssrc],
    });
  }

  return outboundVideoReports;
}

function parseInboundVideoReports(reports) {
  const inboundRtp = reports
      .filter((report) => {
        const isRemote = report.isRemote ?? false;
        const kind = report.kind ?? null ? report.kind : 'none';
        const isVideo = kind === 'video';
        return report.type === 'inbound-rtp' && !isRemote && isVideo;
      })
      .reduce((result, untypedReport) => {
        /** @type {RTCInboundRtpStreamStats} */
        const report = untypedReport;
        const decodeBitrateKbps = (8 * (report.bytesReceived ?? 0)) / 1000;

        result[`${report.ssrc}`] = {
          local: true,
          type: 'video',
          timestamp: report.timestamp,
          sampleDurationMs: report.timestamp,
          rid: report.rid ?? 'no-rid',
          decodeBitrateKbps,
          nackCount: report.nackCount,
          packetsReceived: report.packetsReceived ?? 0,
          packetsLost: report.packetsLost ?? 0,
          fractionLost: 0,
        };
        return result;
      }, {});

  const inboundVideoReports = [];
  for (const ssrc of Object.keys(inboundRtp)) {
    inboundVideoReports.push({
      ...inboundRtp[ssrc],
    });
  }

  return inboundVideoReports;
}

/**
 * Calculates windowed samples for all properties that are currently
 * cumulative over each report.
 *
 * @param {any[]} nextReports
 * @param {any[]} prevReports
 * @return {any}
 */
function calculateWindowedVideoReports(nextReports, prevReports = []) {
  // Map and match next with previous report
  const windowedSamples = nextReports.map((nextReport) => {
    const prevReport = prevReports.find((prevReport) => prevReport?.rid === nextReport.rid);

    if (!prevReport) {
      return {...nextReport};
    }

    const sampleDurationMs = nextReport.sampleDurationMs - prevReport.sampleDurationMs;
    const sampleDurationSec = sampleDurationMs / 1000;
    const encodeBitrateKbps = (nextReport.encodeBitrateKbps - prevReport.encodeBitrateKbps) / sampleDurationSec;

    // Only need to calculate windows for values that are not sampled already
    return {
      ...nextReport,
      sampleDurationMs,
      encodeBitrateKbps,
      encodeDurationMs: nextReport.encodeDurationMs - prevReport.encodeDurationMs,
      hugeFramesSent: nextReport.hugeFramesSent - prevReport.hugeFramesSent,
      keyframesEncoded: nextReport.keyframesEncoded - prevReport.keyframesEncoded,
      nackCount: nextReport.nackCount - prevReport.nackCount,
      pictureLossCount: nextReport.pictureLossCount - prevReport.pictureLossCount,
    };
  });

  return windowedSamples;
}

function calculateWindowedInboundVideoReports(nextReports, prevReports = []) {
  // Map and match next with previous report
  const windowedSamples = nextReports.map((nextReport) => {
    const prevReport = prevReports.find((prevReport) => prevReport?.rid === nextReport.rid);

    if (!prevReport) {
      return {...nextReport};
    }

    const sampleDurationMs = nextReport.sampleDurationMs - prevReport.sampleDurationMs;
    const packetsLost = nextReport.packetsLost - prevReport.packetsLost;
    const packetsReceived = nextReport.packetsReceived - prevReport.packetsReceived;
    const fractionLost = (packetsLost / (packetsLost + packetsReceived)) ?? 0;

    // Only need to calculate windows for values that are not sampled already
    return {
      ...nextReport,
      sampleDurationMs,
      fractionLost
    };
  });

  return windowedSamples;
}

function setMinMaxAvg(samples, id) {
  if (!Array.isArray(samples) || samples.length === 0) {
    return;
  }

  const sorted = samples.sort();
  const min = sorted[0];
  const max = sorted[sorted.length - 1];

  let sum = 0;
  for (const sample of sorted) {
    sum += sample;
  }
  const average = sum / sorted.length;

  const trunc = (num) => Math.trunc(num * 1000) / 1000;

  const targetEl = document.getElementById(id);
  if (targetEl) {
    targetEl.innerHTML = `
      <small>[Avg: ${trunc(average)}]</small>
      <small>[Min: ${trunc(min)}]</small>
      <small>[Max: ${trunc(max)}]</small>
    `;
  }
};