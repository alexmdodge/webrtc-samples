/* global TimelineDataSeries, TimelineGraphView */

let outboundReportsTimerId;
let inboundReportsTimerId;

let remoteInboundVideoLossSeriesNoRid;
let remoteInboundVideoLossGraph;
let remoteInboundVideoLossSamples = [];

let inboundVideoLossSeriesNoRid;
let inboundVideoLossGraph;
let inboundVideoLossSamples = [];

let remoteInboundAudioLossSeriesNoRid;
let remoteInboundAudioLossGraph;
let remoteInboundAudioLossSamples = [];

let inboundAudioLossSeriesNoRid;
let inboundAudioLossGraph;
let inboundAudioLossSamples = [];

function setupOutboundStatsGraphs() {
  remoteInboundVideoLossSamples = [];
  remoteInboundVideoLossSeriesNoRid = new TimelineDataSeries();
  remoteInboundVideoLossGraph = new TimelineGraphView('remote-inbound-video-loss', 'remote-inbound-video-loss-canvas');
  remoteInboundVideoLossGraph.updateEndDate();

  remoteInboundAudioLossSamples = [];
  remoteInboundAudioLossSeriesNoRid = new TimelineDataSeries();
  remoteInboundAudioLossGraph = new TimelineGraphView('remote-inbound-audio-loss', 'remote-inbound-audio-loss-canvas');
  remoteInboundAudioLossGraph.updateEndDate();
}

function setupInboundStatsGraphs() {
  inboundVideoLossSamples = [];
  inboundVideoLossSeriesNoRid = new TimelineDataSeries();
  inboundVideoLossGraph = new TimelineGraphView('inbound-video-loss', 'inbound-video-loss-canvas');
  inboundVideoLossGraph.updateEndDate();

  inboundAudioLossSamples = [];
  inboundAudioLossSeriesNoRid = new TimelineDataSeries();
  inboundAudioLossGraph = new TimelineGraphView('inbound-audio-loss', 'inbound-audio-loss-canvas');
  inboundAudioLossGraph.updateEndDate();
}

export function clearStatsPolling() {
  clearInterval(outboundReportsTimerId);
  clearInterval(inboundReportsTimerId);
  outboundReportsTimerId = undefined;
  inboundReportsTimerId = undefined;
}

async function convertReportsToArray(statsReporter) {
  const rtcReports = await statsReporter.getStats();
  const reports = Array.from(rtcReports.values());
  return reports;
}

/**
 * @param {RTCRtpSender[]} senders
 * @param {number} interval
 */
export function pollOutboundStats(senders, interval = 1000) {
  if (outboundReportsTimerId) return;
  setupOutboundStatsGraphs();

  const videoSender = senders.find(sender => sender.track.kind === 'video');
  const audioSender = senders.find(sender => sender.track.kind === 'audio');

  outboundReportsTimerId = setInterval(async () => {
    const videoReports = await convertReportsToArray(videoSender);
    const audioReports = await convertReportsToArray(audioSender);
    const outboundVideo = await sampleOutboundVideoStats(videoReports);
    const outboundAudio = await sampleOutboundAudioStats(audioReports);
    updateOutboundVideoGraphs(outboundVideo);
    updateOutboundAudioGraphs(outboundAudio);
  }, interval);
}

export function pollInboundStats(receivers, interval = 1000) {
  if (inboundReportsTimerId) return;
  setupInboundStatsGraphs();

  const videoReceiver = receivers.find(sender => sender.track.kind === 'video');
  const audioReceiver = receivers.find(sender => sender.track.kind === 'audio');

  inboundReportsTimerId = setInterval(async () => {
    const videoReports = await convertReportsToArray(videoReceiver);
    const audioReports = await convertReportsToArray(audioReceiver);
    const inboundVideo = await sampleInboundVideoStats(videoReports);
    const inboundAudio = await sampleInboundAudioStats(audioReports);
    updateInboundVideoGraphs(inboundVideo);
    updateInboundAudioGraphs(inboundAudio);
  }, interval);
}

function updateOutboundVideoGraphs(outbound) {
  if (!outbound) return;

  for (const report of outbound) {
    remoteInboundVideoLossSeriesNoRid.addPoint(report.timestamp, report.fractionLost);
    remoteInboundVideoLossGraph.setDataSeries([remoteInboundVideoLossSeriesNoRid]);
    remoteInboundVideoLossGraph.updateEndDate();
    remoteInboundVideoLossSamples.push(report.fractionLost);
    setMinMaxAvg(remoteInboundVideoLossSamples, 'remote-inbound-video-loss-minmax');
  }
}

function updateOutboundAudioGraphs(outbound) {
  if (!outbound) return;

  for (const report of outbound) {
    remoteInboundAudioLossSeriesNoRid.addPoint(report.timestamp, report.fractionLost);
    remoteInboundAudioLossGraph.setDataSeries([remoteInboundAudioLossSeriesNoRid]);
    remoteInboundAudioLossGraph.updateEndDate();
    remoteInboundAudioLossSamples.push(report.fractionLost);
    setMinMaxAvg(remoteInboundAudioLossSamples, 'remote-inbound-audio-loss-minmax');
  }
}

function updateInboundVideoGraphs(inbound) {
  if (!inbound) return;

  for (const report of inbound) {
    inboundVideoLossSeriesNoRid.addPoint(report.timestamp, report.fractionLost);
    inboundVideoLossGraph.setDataSeries([inboundVideoLossSeriesNoRid]);
    inboundVideoLossGraph.updateEndDate();
    inboundVideoLossSamples.push(report.fractionLost);
    setMinMaxAvg(inboundVideoLossSamples, 'inbound-video-loss-minmax');
  }
}

function updateInboundAudioGraphs(inbound) {
  if (!inbound) return;

  for (const report of inbound) {
    inboundAudioLossSeriesNoRid.addPoint(report.timestamp, report.fractionLost);
    inboundAudioLossGraph.setDataSeries([inboundAudioLossSeriesNoRid]);
    inboundAudioLossGraph.updateEndDate();
    inboundAudioLossSamples.push(report.fractionLost);
    setMinMaxAvg(inboundAudioLossSamples, 'inbound-audio-loss-minmax');
  }
}

/**
 * Outbound Stats
 * https://www.w3.org/TR/webrtc-stats/#outboundrtpstats-dict*
 */
const prevOutboundVideoReports = new Map();
const prevOutboundAudioReports = new Map();

async function sampleOutboundVideoStats(reports) {
  const videoReports = parseOutboundReports(reports, 'video');

  const prevReports = videoReports.map((report) => {
    const prev = prevOutboundVideoReports.get(report.rid);
    prevOutboundVideoReports.set(report.rid, report);
    return prev;
  });

  return calculateWindowedOutboundReports(videoReports, prevReports, 'video');
}

async function sampleOutboundAudioStats(reports) {
  const audioReports = parseOutboundReports(reports, 'audio');

  const prevReports = audioReports.map((report) => {
    const prev = prevOutboundAudioReports.get(report.rid);
    prevOutboundAudioReports.set(report.rid, report);
    return prev;
  });

  return calculateWindowedOutboundReports(audioReports, prevReports, 'audio');
}

const prevInboundVideoReports = new Map();
const prevInboundAudioReports = new Map();

async function sampleInboundVideoStats(reports) {
  const videoReports = parseInboundReports(reports, 'video');

  const prevReports = videoReports.map((report) => {
    const prev = prevInboundVideoReports.get(report.rid);
    prevInboundVideoReports.set(report.rid, report);
    return prev;
  });

  return calculateWindowedInboundReports(videoReports, prevReports, 'video');
}

async function sampleInboundAudioStats(reports) {
  const audioReports = parseInboundReports(reports, 'audio');

  const prevReports = audioReports.map((report) => {
    const prev = prevInboundAudioReports.get(report.rid);
    prevInboundAudioReports.set(report.rid, report);
    return prev;
  });

  return calculateWindowedInboundReports(audioReports, prevReports, 'audio');
}

function parseOutboundReports(reports, type = 'video') {
  const outboundRtp = reports
      .filter((report) => {
        const isRemote = report.isRemote ?? false;
        const kind = report.kind ?? null ? report.kind : 'none';
        const isDesiredType = kind === type;
        return report.type === 'outbound-rtp' && !isRemote && isDesiredType;
      })
      .reduce((result, untypedReport) => {
        /** @type {RTCOutboundRtpStreamStats} */
        const report = untypedReport;
        const encodeBitrateKbps = (8 * (report.bytesSent ?? 0)) / 1000;

        result[`${report.ssrc}`] = {
          local: true,
          type,
          timestamp: report.timestamp,
          sampleDurationMs: report.timestamp,
          rid: report.rid ?? 'no-rid',
          targetBitrateKbps: (report.targetBitrate ?? 0) / 1000,
          encodeBitrateKbps,
          encodeDurationMs: (report.totalEncodeTime ?? 0) * 1000,
          nackCount: report.nackCount,
          roundTripTime: 0,
          fractionLost: 0,
        };
        return result;
      }, {});

  const remoteInboundRtp = reports
      .filter((report) => {
        const isRemote = report.isRemote ?? false;
        const kind = report.kind ?? null ? report.kind : 'none';
        const isDesiredType = kind === type;
        return report.type === 'remote-inbound-rtp' && !isRemote && isDesiredType;
      })
      .reduce((result, report) => {
        result[`${report.ssrc}`] = {
          roundTripTime: report.roundTripTime,
          fractionLost: report.fractionLost,
        };
        return result;
      }, {});

  const outboundReports = [];
  for (const ssrc of Object.keys(outboundRtp)) {
    outboundReports.push({
      ...outboundRtp[ssrc],
      ...remoteInboundRtp[ssrc],
    });
  }

  return outboundReports;
}

function parseInboundReports(reports, type = 'video') {
  const inboundRtp = reports
      .filter((report) => {
        const isRemote = report.isRemote ?? false;
        const kind = report.kind ?? null ? report.kind : 'none';
        const isDesiredType = kind === type;
        return report.type === 'inbound-rtp' && !isRemote && isDesiredType;
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
 * @param {string} type
 * @return {any}
 */
function calculateWindowedOutboundReports(nextReports, prevReports = [], type = 'video') {
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
      nackCount: nextReport.nackCount - prevReport.nackCount,
    };
  });

  return windowedSamples;
}

function calculateWindowedInboundReports(nextReports, prevReports = [], type = 'video') {
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