/* global RTCRtpTransceiver */
'use strict';

var flatMap = require('./util').flatMap;
var guessBrowser = require('./util').guessBrowser;

var guess = guessBrowser();
var isChrome = guess === 'chrome';
var isFirefox = guess === 'firefox';
var isSafari = guess === 'safari';

/**
 * Get the standardized {@link RTCPeerConnection} statistics.
 * @param {RTCPeerConnection} peerConnection
 * @param {object} [options] - Used for testing
 * @returns {Promise.<StandardizedStatsResponse>}
 */
function getStats(peerConnection, options) {
  if (!(peerConnection && typeof peerConnection.getStats === 'function')) {
    return Promise.reject(new Error('Given PeerConnection does not support getStats'));
  }
  return _getStats(peerConnection, options);
}

/**
 * getStats() implementation.
 * @param {RTCPeerConnection} peerConnection
 * @param {object} [options] - Used for testing
 * @returns {Promise.<StandardizedStatsResponse>}
 */
function _getStats(peerConnection, options) {
  var localAudioTracks = getTracks(peerConnection, 'audio', 'local');
  var localVideoTracks = getTracks(peerConnection, 'video', 'local');
  var remoteAudioTracks = getTracks(peerConnection, 'audio');
  var remoteVideoTracks = getTracks(peerConnection, 'video');

  var statsResponse = {
    activeIceCandidatePair: null,
    localAudioTrackStats: [],
    localVideoTrackStats: [],
    remoteAudioTrackStats: [],
    remoteVideoTrackStats: []
  };

  var trackStatsPromises = flatMap([
    [localAudioTracks, 'localAudioTrackStats', false],
    [localVideoTracks, 'localVideoTrackStats', false],
    [remoteAudioTracks, 'remoteAudioTrackStats', true],
    [remoteVideoTracks, 'remoteVideoTrackStats', true]
  ], function(triple) {
    var tracks = triple[0];
    var statsArrayName = triple[1];
    var isRemote = triple[2];
    return tracks.map(function(track) {
      return getTrackStats(peerConnection, track, Object.assign({
        isRemote: isRemote
      }, options)).then(function(stats) {
        stats.trackId = track.id;
        statsResponse[statsArrayName].push(stats);
      });
    });
  });

  return Promise.all(trackStatsPromises).then(function() {
    return getActiveIceCandidatePairStats(peerConnection, options);
  }).then(function(activeIceCandidatePairStatsReport) {
    statsResponse.activeIceCandidatePair = activeIceCandidatePairStatsReport;
    return statsResponse;
  });
}

/**
 * Generate the {@link StandardizedActiveIceCandidatePairStatsReport} for the
 * {@link RTCPeerConnection}.
 * @param {RTCPeerConnection} peerConnection
 * @param {object} [options]
 * @returns {Promise<StandardizedActiveIceCandidatePairStatsReport>}
 */
function getActiveIceCandidatePairStats(peerConnection, options) {
  options = options || {};

  if (typeof options.testForChrome !== 'undefined' || isChrome
    || typeof options.testForSafari  !== 'undefined' || isSafari) {
    return peerConnection.getStats().then(
      standardizeChromeOrSafariActiveIceCandidatePairStats);
  }
  if (typeof options.testForFirefox !== 'undefined' || isFirefox) {
    return peerConnection.getStats().then(standardizeFirefoxActiveIceCandidatePairStats);
  }
  return Promise.reject(new Error('RTCPeerConnection#getStats() not supported'));
}

/**
 * Standardize the active RTCIceCandidate pair's statistics in Chrome or Safari.
 * @param {RTCStatsReport} stats
 * @returns {?StandardizedActiveIceCandidatePairStatsReport}
 */
function standardizeChromeOrSafariActiveIceCandidatePairStats(stats) {
  var activeCandidatePairStats = Array.from(stats.values()).find(function(stat) {
    return stat.type === 'candidate-pair' && stat.nominated;
  });

  if (!activeCandidatePairStats) {
    return null;
  }

  var activeLocalCandidateStats = stats.get(activeCandidatePairStats.localCandidateId);
  var activeRemoteCandidateStats = stats.get(activeCandidatePairStats.remoteCandidateId);

  var standardizedCandidateStatsKeys = [
    { key: 'candidateType', type: 'string' },
    { key: 'ip', type: 'string' },
    { key: 'port', type: 'number' },
    { key: 'priority', type: 'number' },
    { key: 'protocol', type: 'string' },
    { key: 'url', type: 'string' }
  ];

  var standardizedLocalCandidateStatsKeys = standardizedCandidateStatsKeys.concat([
    { key: 'deleted', type: 'boolean' },
    { key: 'relayProtocol', type: 'string' }
  ]);

  var standatdizedLocalCandidateStatsReport = activeLocalCandidateStats
    ? standardizedLocalCandidateStatsKeys.reduce(function(report, keyInfo) {
      report[keyInfo.key] = typeof activeLocalCandidateStats[keyInfo.key] === keyInfo.type
        ? activeLocalCandidateStats[keyInfo.key]
        : keyInfo.key === 'deleted' ? false : null;
      return report;
    }, {})
    : null;

  var standardizedRemoteCandidateStatsReport = activeRemoteCandidateStats
    ? standardizedCandidateStatsKeys.reduce(function(report, keyInfo) {
      report[keyInfo.key] = typeof activeRemoteCandidateStats[keyInfo.key] === keyInfo.type
        ? activeRemoteCandidateStats[keyInfo.key]
        : null;
      return report;
    }, {})
    : null;

  return [
    { key: 'availableIncomingBitrate', type: 'number' },
    { key: 'availableOutgoingBitrate', type: 'number' },
    { key: 'bytesReceived', type: 'number' },
    { key: 'bytesSent', type: 'number' },
    { key: 'consentRequestsSent', type: 'number' },
    { key: 'currentRoundTripTime', type: 'number' },
    { key: 'lastPacketReceivedTimestamp', type: 'number' },
    { key: 'lastPacketSentTimestamp', type: 'number' },
    { key: 'nominated', type: 'boolean' },
    { key: 'priority', type: 'number' },
    { key: 'readable', type: 'boolean' },
    { key: 'requestsReceived', type: 'number' },
    { key: 'requestsSent', type: 'number' },
    { key: 'responsesReceived', type: 'number' },
    { key: 'responsesSent', type: 'number' },
    { key: 'retransmissionsReceived', type: 'number' },
    { key: 'retransmissionsSent', type: 'number' },
    { key: 'state', type: 'string' },
    { key: 'totalRoundTripTime', type: 'number' },
    { key: 'transportId', type: 'string' },
    { key: 'writable', type: 'boolean' }
  ].reduce(function(report, keyInfo) {
    report[keyInfo.key] = typeof activeCandidatePairStats[keyInfo.key] === keyInfo.type
      ? activeCandidatePairStats[keyInfo.key]
      : null;
    return report;
  }, {
    localCandidate: standatdizedLocalCandidateStatsReport,
    remoteCandidate: standardizedRemoteCandidateStatsReport
  });
}

/**
 * Standardize the active RTCIceCandidate pair's statistics in Firefox.
 * @param {RTCStatsReport} stats
 * @returns {?StandardizedActiveIceCandidatePairStatsReport}
 */
function standardizeFirefoxActiveIceCandidatePairStats(stats) {
  var activeCandidatePairStats = Array.from(stats.values()).find(function(stat) {
    return stat.type === 'candidate-pair' && stat.nominated;
  });

  if (!activeCandidatePairStats) {
    return null;
  }

  var activeLocalCandidateStats = stats.get(activeCandidatePairStats.localCandidateId);
  var activeRemoteCandidateStats = stats.get(activeCandidatePairStats.remoteCandidateId);

  var standardizedCandidateStatsKeys = [
    { key: 'candidateType', type: 'string' },
    { key: 'ip', ffKeys: ['address', 'ipAddress'], type: 'string' },
    { key: 'port', ffKeys: ['portNumber'], type: 'number' },
    { key: 'priority', type: 'number' },
    { key: 'protocol', ffKeys: ['transport'], type: 'string' },
    { key: 'url', type: 'string' }
  ];

  var standardizedLocalCandidateStatsKeys = standardizedCandidateStatsKeys.concat([
    { key: 'deleted', type: 'boolean' },
    { key: 'relayProtocol', type: 'string' }
  ]);

  var candidateTypes = {
    host: 'host',
    peerreflexive: 'prflx',
    relayed: 'relay',
    serverreflexive: 'srflx'
  };

  var standatdizedLocalCandidateStatsReport = activeLocalCandidateStats
    ? standardizedLocalCandidateStatsKeys.reduce(function(report, keyInfo) {
      var key = keyInfo.ffKeys && keyInfo.ffKeys.find(function(key) {
        return key in activeLocalCandidateStats;
      }) || keyInfo.key;
      report[keyInfo.key] = typeof activeLocalCandidateStats[key] === keyInfo.type
        ? key === 'candidateType'
          ? candidateTypes[activeLocalCandidateStats[key]] || activeLocalCandidateStats[key]
          : activeLocalCandidateStats[key]
        : key === 'deleted' ? false : null;
      return report;
    }, {})
    : null;

  var standardizedRemoteCandidateStatsReport = activeRemoteCandidateStats
    ? standardizedCandidateStatsKeys.reduce(function(report, keyInfo) {
      var key = keyInfo.ffKeys && keyInfo.ffKeys.find(function(key) {
        return key in activeRemoteCandidateStats;
      }) || keyInfo.key;
      report[keyInfo.key] = typeof activeRemoteCandidateStats[key] === keyInfo.type
        ? key === 'candidateType'
          ? candidateTypes[activeRemoteCandidateStats[key]] || activeRemoteCandidateStats[key]
          : activeRemoteCandidateStats[key]
        : null;
      return report;
    }, {})
    : null;

  return [
    { key: 'availableIncomingBitrate', type: 'number' },
    { key: 'availableOutgoingBitrate', type: 'number' },
    { key: 'bytesReceived', type: 'number' },
    { key: 'bytesSent', type: 'number' },
    { key: 'consentRequestsSent', type: 'number' },
    { key: 'currentRoundTripTime', type: 'number' },
    { key: 'lastPacketReceivedTimestamp', type: 'number' },
    { key: 'lastPacketSentTimestamp', type: 'number' },
    { key: 'nominated', type: 'boolean' },
    { key: 'priority', type: 'number' },
    { key: 'readable', type: 'boolean' },
    { key: 'requestsReceived', type: 'number' },
    { key: 'requestsSent', type: 'number' },
    { key: 'responsesReceived', type: 'number' },
    { key: 'responsesSent', type: 'number' },
    { key: 'retransmissionsReceived', type: 'number' },
    { key: 'retransmissionsSent', type: 'number' },
    { key: 'state', type: 'string' },
    { key: 'totalRoundTripTime', type: 'number' },
    { key: 'transportId', type: 'string' },
    { key: 'writable', type: 'boolean' }
  ].reduce(function(report, keyInfo) {
    report[keyInfo.key] = typeof activeCandidatePairStats[keyInfo.key] === keyInfo.type
      ? activeCandidatePairStats[keyInfo.key]
      : null;
    return report;
  }, {
    localCandidate: standatdizedLocalCandidateStatsReport,
    remoteCandidate: standardizedRemoteCandidateStatsReport
  });
}

/**
 * Get local/remote audio/video MediaStreamTracks.
 * @param {RTCPeerConnection} peerConnection - The RTCPeerConnection
 * @param {string} kind - 'audio' or 'video'
 * @param {string} [localOrRemote] - 'local' or 'remote'
 * @returns {Array<MediaStreamTrack>}
 */
function getTracks(peerConnection, kind, localOrRemote) {
  var getSendersOrReceivers = localOrRemote === 'local' ? 'getSenders' : 'getReceivers';
  if (peerConnection[getSendersOrReceivers]) {
    return peerConnection[getSendersOrReceivers]().map(function(senderOrReceiver) {
      return senderOrReceiver.track;
    }).filter(function(track) {
      return track && track.kind === kind;
    });
  }
  var getStreams = localOrRemote === 'local' ? 'getLocalStreams' : 'getRemoteStreams';
  return flatMap(peerConnection[getStreams](), function(stream) {
    var getTracks = kind === 'audio' ? 'getAudioTracks' : 'getVideoTracks';
    return stream[getTracks]();
  });
}

/**
 * Get the standardized statistics for a particular MediaStreamTrack.
 * @param {RTCPeerConnection} peerConnection
 * @param {MediaStreamTrack} track
 * @param {object} [options] - Used for testing
 * @returns {Promise.<StandardizedTrackStatsReport>}
 */
function getTrackStats(peerConnection, track, options) {
  options = options || {};

  if (typeof options.testForChrome !== 'undefined' || isChrome) {
    return chromeOrSafariGetTrackStats(peerConnection, track);
  }
  if (typeof options.testForFirefox  !== 'undefined' || isFirefox) {
    return firefoxGetTrackStats(peerConnection, track, options.isRemote);
  }
  if (typeof options.testForSafari  !== 'undefined' || isSafari) {
    if (typeof options.testForSafari  !== 'undefined'
      || 'currentDirection' in RTCRtpTransceiver.prototype) {
      return chromeOrSafariGetTrackStats(peerConnection, track);
    }
    // NOTE(syerrapragada): getStats() is not supported on
    // Safari versions where plan-b is the SDP format
    // due to this bug: https://bugs.webkit.org/show_bug.cgi?id=192601
    return Promise.reject(new Error([
      'getStats() is not supported on this version of Safari',
      'due to this bug: https://bugs.webkit.org/show_bug.cgi?id=192601'
    ].join(' ')));
  }
  return Promise.reject(new Error('RTCPeerConnection#getStats() not supported'));
}

/**
 * Get the standardized statistics for a particular MediaStreamTrack in Chrome or Safari.
 * @param {RTCPeerConnection} peerConnection
 * @param {MediaStreamTrack} track
 * @returns {Promise.<StandardizedTrackStatsReport>}
 */
function chromeOrSafariGetTrackStats(peerConnection, track) {
  return new Promise(function(resolve, reject) {
    peerConnection.getStats(track).then(function(response) {
      resolve(standardizeChromeOrSafariStats(response));
    }, reject);
  });
}

/**
 * Get the standardized statistics for a particular MediaStreamTrack in Firefox.
 * @param {RTCPeerConnection} peerConnection
 * @param {MediaStreamTrack} track
 * @param {boolean} isRemote
 * @returns {Promise.<StandardizedTrackStatsReport>}
 */
function firefoxGetTrackStats(peerConnection, track, isRemote) {
  return new Promise(function(resolve, reject) {
    peerConnection.getStats(track).then(function(response) {
      resolve(standardizeFirefoxStats(response, isRemote));
    }, reject);
  });
}

/**
 * Standardize the MediaStreamTrack's statistics in Chrome or Safari.
 * @param {RTCStatsResponse} response
 * @returns {StandardizedTrackStatsReport}
 */
function standardizeChromeOrSafariStats(response) {
  var inbound = null;
  var outbound = null;
  var track = null;
  var codec = null;

  response.forEach(function(stat) {
    switch (stat.type) {
      case 'inbound-rtp':
        inbound = stat;
        break;
      case 'outbound-rtp':
        outbound = stat;
        break;
      case 'track':
        track = stat;
        break;
      case 'codec':
        codec = stat;
        break;
    }
  });

  var isRemote = track && track.remoteSource;
  var standardizedStats = {};

  var first = isRemote ? inbound : outbound;
  var second = track;
  var third = codec;

  function getStatValue(name) {
    if (first && typeof first[name] !== 'undefined') {
      return first[name];
    }

    if (second && typeof second[name] !== 'undefined') {
      return second[name];
    }

    if (third && typeof third[name] !== 'undefined') {
      return third[name];
    }

    return null;
  }

  var ssrc = getStatValue('ssrc');
  if (typeof ssrc === 'number') {
    standardizedStats.ssrc = String(ssrc);
  }

  var timestamp = getStatValue('timestamp');
  standardizedStats.timestamp = Math.round(timestamp);

  var mimeType = getStatValue('mimeType');
  if (typeof mimeType === 'string') {
    mimeType = mimeType.split('/');
    standardizedStats.codecName = mimeType[mimeType.length - 1];
  }

  var roundTripTime = getStatValue('roundTripTime');
  if (typeof roundTripTime === 'number') {
    standardizedStats.roundTripTime = roundTripTime;
  }

  var jitter = getStatValue('jitter');
  if (typeof jitter === 'number') {
    standardizedStats.jitter = Math.round(jitter * 1000);
  }

  var frameWidth = getStatValue('frameWidth');
  if (typeof frameWidth === 'number') {
    if (isRemote) {
      standardizedStats.frameWidthReceived = frameWidth;
    } else {
      standardizedStats.frameWidthSent = frameWidth;
    }
  }

  var frameHeight = getStatValue('frameHeight');
  if (typeof frameHeight === 'number') {
    if (isRemote) {
      standardizedStats.frameHeightReceived = frameHeight;
    } else {
      standardizedStats.frameHeightSent = frameHeight;
    }
  }

  var framesPerSecond = getStatValue('framesPerSecond');
  if (typeof framesPerSecond === 'number') {
    standardizedStats.frameRateSent = framesPerSecond;
  }

  var bytesReceived = getStatValue('bytesReceived');
  if (typeof bytesReceived === 'number') {
    standardizedStats.bytesReceived = bytesReceived;
  }

  var bytesSent = getStatValue('bytesSent');
  if (typeof bytesSent === 'number') {
    standardizedStats.bytesSent = bytesSent;
  }

  var packetsLost = getStatValue('packetsLost');
  if (typeof packetsLost === 'number') {
    standardizedStats.packetsLost = packetsLost;
  }

  var packetsReceived = getStatValue('packetsReceived');
  if (typeof packetsReceived === 'number') {
    standardizedStats.packetsReceived = packetsReceived;
  }

  var packetsSent = getStatValue('packetsSent');
  if (typeof packetsSent === 'number') {
    standardizedStats.packetsSent = packetsSent;
  }

  var audioLevel = getStatValue('audioLevel');
  if (typeof audioLevel === 'number') {
    if (isRemote) {
      standardizedStats.audioOutputLevel = audioLevel;
    } else {
      standardizedStats.audioInputLevel = audioLevel;
    }
  }

  return standardizedStats;
}

/**
 * Standardize the MediaStreamTrack's statistics in Firefox.
 * @param {RTCStatsReport} response
 * @param {boolean} isRemote
 * @returns {StandardizedTrackStatsReport}
 */
function standardizeFirefoxStats(response, isRemote) {
  // NOTE(mroberts): If getStats is called on a closed RTCPeerConnection,
  // Firefox returns undefined instead of an RTCStatsReport. We workaround this
  // here. See the following bug for more details:
  //
  //   https://bugzilla.mozilla.org/show_bug.cgi?id=1377225
  //
  response = response || new Map();

  var inbound = null;
  var outbound = null;

  // NOTE(mmalavalli): Starting from Firefox 63, RTC{Inbound, Outbound}RTPStreamStats.isRemote
  // will be deprecated, followed by its removal in Firefox 66. Also, trying to
  // access members of the remote RTC{Inbound, Outbound}RTPStreamStats without
  // using RTCStatsReport.get(remoteId) will trigger console warnings. So, we
  // no longer depend on "isRemote", and we call RTCStatsReport.get(remoteId)
  // to access the remote RTC{Inbound, Outbound}RTPStreamStats.
  //
  // Source: https://blog.mozilla.org/webrtc/getstats-isremote-65/
  //
  response.forEach(function(stat) {
    if (stat.isRemote) {
      return;
    }
    switch (stat.type) {
      case 'inbound-rtp':
        inbound = stat;
        outbound = response.get(stat.remoteId);
        break;
      case 'outbound-rtp':
        outbound = stat;
        inbound = response.get(stat.remoteId);
        break;
    }
  });

  var first = isRemote ? inbound : outbound;
  var second = isRemote ? outbound : inbound;

  function getStatValue(name) {
    if (first && typeof first[name] !== 'undefined') {
      return first[name];
    }
    if (second && typeof second[name] !== 'undefined') {
      return second[name];
    }
    return null;
  }

  var standardizedStats = {};
  var timestamp = getStatValue('timestamp');
  standardizedStats.timestamp = Math.round(timestamp);

  var ssrc = getStatValue('ssrc');
  if (typeof ssrc === 'number') {
    standardizedStats.ssrc = String(ssrc);
  }

  var bytesSent = getStatValue('bytesSent');
  if (typeof bytesSent === 'number') {
    standardizedStats.bytesSent = bytesSent;
  }

  var packetsLost = getStatValue('packetsLost');
  if (typeof packetsLost === 'number') {
    standardizedStats.packetsLost = packetsLost;
  }

  var packetsSent = getStatValue('packetsSent');
  if (typeof packetsSent === 'number') {
    standardizedStats.packetsSent = packetsSent;
  }

  var roundTripTime = getStatValue('roundTripTime');
  if (typeof roundTripTime === 'number') {
    standardizedStats.roundTripTime = roundTripTime;
  }

  var jitter = getStatValue('jitter');
  if (typeof jitter === 'number') {
    standardizedStats.jitter = Math.round(jitter * 1000);
  }

  var frameRateSent = getStatValue('framerateMean');
  if (typeof frameRateSent === 'number') {
    standardizedStats.frameRateSent = Math.round(frameRateSent);
  }

  var bytesReceived = getStatValue('bytesReceived');
  if (typeof bytesReceived === 'number') {
    standardizedStats.bytesReceived = bytesReceived;
  }

  var packetsReceived = getStatValue('packetsReceived');
  if (typeof packetsReceived === 'number') {
    standardizedStats.packetsReceived = packetsReceived;
  }

  var frameRateReceived = getStatValue('framerateMean');
  if (typeof frameRateReceived === 'number') {
    standardizedStats.frameRateReceived = Math.round(frameRateReceived);
  }

  return standardizedStats;
}

/**
 * Standardized RTCIceCandidate statistics.
 * @typedef {object} StandardizedIceCandidateStatsReport
 * @property {'host'|'prflx'|'relay'|'srflx'} candidateType
 * @property {string} ip
 * @property {number} port
 * @property {number} priority
 * @property {'tcp'|'udp'} protocol
 * @property {string} url
 */

/**
 * Standardized local RTCIceCandidate statistics.
 * @typedef {StandardizedIceCandidateStatsReport} StandardizedLocalIceCandidateStatsReport
 * @property {boolean} [deleted=false]
 * @property {'tcp'|'tls'|'udp'} relayProtocol
 */

/**
 * Standardized active RTCIceCandidate pair statistics.
 * @typedef {object} StandardizedActiveIceCandidatePairStatsReport
 * @property {number} availableIncomingBitrate
 * @property {number} availableOutgoingBitrate
 * @property {number} bytesReceived
 * @property {number} bytesSent
 * @property {number} consentRequestsSent
 * @property {number} currentRoundTripTime
 * @property {number} lastPacketReceivedTimestamp
 * @property {number} lastPacketSentTimestamp
 * @property {StandardizedLocalIceCandidateStatsReport} localCandidate
 * @property {boolean} nominated
 * @property {number} priority
 * @property {boolean} readable
 * @property {StandardizedIceCandidateStatsReport} remoteCandidate
 * @property {number} requestsReceived
 * @property {number} requestsSent
 * @property {number} responsesReceived
 * @property {number} responsesSent
 * @property {number} retransmissionsReceived
 * @property {number} retransmissionsSent
 * @property {'frozen'|'waiting'|'in-progress'|'failed'|'succeeded'} state
 * @property {number} totalRoundTripTime
 * @property {string} transportId
 * @property {boolean} writable
 */

/**
 * Standardized {@link RTCPeerConnection} statistics.
 * @typedef {Object} StandardizedStatsResponse
 * @property {StandardizedActiveIceCandidatePairStatsReport} activeIceCandidatePair - Stats for active ICE candidate pair
 * @property Array<StandardizedTrackStatsReport> localAudioTracks - Stats for local audio MediaStreamTracks
 * @property Array<StandardizedTrackStatsReport> localVideoTracks - Stats for local video MediaStreamTracks
 * @property Array<StandardizedTrackStatsReport> remoteAudioTracks - Stats for remote audio MediaStreamTracks
 * @property Array<StandardizedTrackStatsReport> remoteVideoTracks - Stats for remote video MediaStreamTracks
 */

/**
 * Standardized MediaStreamTrack statistics.
 * @typedef {Object} StandardizedTrackStatsReport
 * @property {string} trackId - MediaStreamTrack ID
 * @property {string} ssrc - SSRC of the MediaStreamTrack
 * @property {number} timestamp - The Unix timestamp in milliseconds
 * @property {string} [codecName] - Name of the codec used to encode the MediaStreamTrack's media
 * @property {number} [roundTripTime] - Round trip time in milliseconds
 * @property {number} [jitter] - Jitter in milliseconds
 * @property {number} [frameWidthInput] - Width in pixels of the local video MediaStreamTrack's captured frame
 * @property {number} [frameHeightInput] - Height in pixels of the local video MediaStreamTrack's captured frame
 * @property {number} [frameWidthSent] - Width in pixels of the local video MediaStreamTrack's encoded frame
 * @property {number} [frameHeightSent] - Height in pixels of the local video MediaStreamTrack's encoded frame
 * @property {number} [frameWidthReceived] - Width in pixels of the remote video MediaStreamTrack's received frame
 * @property {number} [frameHeightReceived] - Height in pixels of the remote video MediaStreamTrack's received frame
 * @property {number} [frameRateInput] - Captured frames per second of the local video MediaStreamTrack
 * @property {number} [frameRateSent] - Frames per second of the local video MediaStreamTrack's encoded video
 * @property {number} [frameRateReceived] - Frames per second of the remote video MediaStreamTrack's received video
 * @property {number} [bytesReceived] - Number of bytes of the remote MediaStreamTrack's media received
 * @property {number} [bytesSent] - Number of bytes of the local MediaStreamTrack's media sent
 * @property {number} [packetsLost] - Number of packets of the MediaStreamTrack's media lost
 * @property {number} [packetsReceived] - Number of packets of the remote MediaStreamTrack's media received
 * @property {number} [packetsSent] - Number of packets of the local MediaStreamTrack's media sent
 * @property {AudioLevel} [audioInputLevel] - The {@link AudioLevel} of the local audio MediaStreamTrack
 * @property {AudioLevel} [audioOutputLevel] - The {@link AudioLevel} of the remote video MediaStreamTrack
 */

module.exports = getStats;
