/*global module*/

(function () {

    "use strict";
    
    var utils = require("./utils.js"), engine = {};
    
    engine.getRadioId = function (data) {
        return utils.find(data, function (value) {
            if (value.type === "radio") {
                return value.radio_id;
            }
        });
    };
    
    engine.buildKeys = function (keys) {
        return {keys: keys};
    };
    
    engine.getMacKeys = function (data) {
        return engine.buildKeys(utils.map(data, function (value) {
            if (value.type === "beacon") {
                return value.mac;
            }
        }));
    };
    
    engine.parseResponse = function (response) {
        var list = [], seen = {};
        return utils.each(response.rows, function (row) {
            utils.each(row, function (val, key) {
                if (!seen[key]) {
                    seen[key] = true;
                    list.push(key);
                }
            });
        });
    };
    
    engine.parseRadioIds = function (response) {
        var seen={};
        return utils.map(response.rows, function (row) {
            var id = row.value.radio_id;
            if (!seen[id]) {
                seen[id] = true;
                return id;
            }
        });
    };
    
    engine.getKeys = function (response) {
        return engine.buildKeys(engine.parseResponse(response));
    };
    
    engine.lookupRange = function (radios, id) {
        return utils.find(radios.rows, function (row) {
            if (row.key === id) {
                return row.value;
            }
        });
    };
    
    engine.getRange = function (radios, id, data) {
        var range = {};
        utils.each(data, function (fp) {
            if (fp.type !== "fingerprint") {
                return;
            }
            range.min_rssi = range.min_rssi && range.min_rssi < fp.rssi ? range.min_rssi : fp.rssi;
            range.max_rssi = range.max_rssi && range.max_rssi > fp.rssi ? range.max_rssi : fp.rssi;
        });
        var dbRange = engine.lookupRange(radios, id);
        if (!dbRange) {
            return range;
        }
        return {
            min_rssi: range.min_rssi > dbRange.min_rssi ? dbRange.min_rssi : range.min_rssi,
            max_rssi: range.max_rssi < dbRange.max_rssi ? dbRange.max_rssi : range.max_rssi
        };
    };
    
    engine.normalize = function (val, min, max) {
        if (max === min) {
            return 1;
        }
        return (val - min) / (max - min);
    };
    
    engine.getRanks = function (data, range) {
        var ranks = {};
        utils.each(data, function (fp) {
            if (fp.type !== "fingerprint") {
                return;
            }
            ranks[fp.beacon_mac] = engine.normalize(fp.rssi, range.min_rssi, range.max_rssi);
        });
        return ranks;
    };
    
    engine.getDistance = function (tagRanks, ranks) {
        var dSquared = 0;
        utils.each(tagRanks, function (tagRank, tagMac) {
            var rank = ranks[tagMac];
            dSquared += Math.pow(tagRank - (rank || 0), 2);
        });
        utils.each(ranks, function (rank, mac) {
            var tagRank = tagRanks[mac];
            if (!tagRank) {
                dSquared += Math.pow(rank, 2);
            }
        });
        return Math.sqrt(dSquared);
    };
    
    engine.calculateDistances = function (data) {
        var ranks = engine.getRanks(data.data, engine.getRange(data.radios, data.radioId, data.data));
        var tags = {};
        utils.each(data.fingerprints.rows, function (row) {
            var tag = row.key;
            if (!tags[tag]) {
                tags[tag] = {
                    data: [],
                    radio_id: row.value.radio_id
                };
            }
            tags[tag].data.push({
                type: row.value.type,
                rssi: row.value.rssi,
                beacon_mac: row.value.beacon_mac
            });
        });
        var tagRanks = {};
        utils.each(tags, function (tag, tagName) {
            tagRanks[tagName] = engine.getRanks(tag.data, engine.lookupRange(data.radios, tag.radio_id));
        });
        var distances = {}, minDistance, maxDistance;
        utils.each(tagRanks, function (rankList, tag) {
            var distance = engine.getDistance(rankList, ranks);
            distances[tag] = distance;
            minDistance = minDistance && minDistance < distance ? minDistance : distance;
            maxDistance = maxDistance && maxDistance > distance ? maxDistance : distance;
        });
        
        utils.each(distances, function (distance, tag) {
            distances[tag] = engine.normalize(distance, maxDistance, minDistance);
        });
        
        return distances;
    };
    
    module.exports = engine;
    
})();