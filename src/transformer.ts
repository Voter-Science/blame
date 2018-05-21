import * as trc from "trclib/trc2";
import * as moment from "moment";

export class Transformer {

    static transform(deltas: trc.IDeltaInfo[]): any {
        let viewData = {
            "records": {},
            "dailyEditCounts": {},
            "userEditCounts": {},
            "columnEditCounts": {},
            "columnValueCounts": {},
            "locations": {}
        };
        return deltas.reduce(Transformer.map, viewData);
    }

    private static map(previous: any, current: trc.IDeltaInfo): any {
        let thisDelta = current;
        let thisValue: trc.ISheetContents = current.Value;

        var recIds: string[] = thisValue["RecId"];
        for (var i in recIds) {

            let recId = thisValue["RecId"][i];
            let deltaDayString = Transformer.toDayString(new Date(thisDelta.Timestamp));

            if (!previous.records[recId]) previous.records[recId] = {};
            var thisRecord = previous.records[recId];
            thisRecord["xLastUser"] = thisDelta.User;
            thisRecord["xLastTimestamp"] = thisDelta.Timestamp;
            thisRecord["xApp"] = thisDelta.App;

            if (!previous.userEditCounts[thisDelta.User]) previous.userEditCounts[thisDelta.User] = 0;
            var userEditCounts = previous.userEditCounts;

            if (!previous.dailyEditCounts[deltaDayString]) previous.dailyEditCounts[deltaDayString] = 0;
            var dailyEditCounts = previous.dailyEditCounts;

            var xlat = thisDelta.GeoLat;
            var xlong = thisDelta.GeoLong;
            
            // loop thru columns in this delta
            for (let columnName in thisValue) {
                if (columnName === "RecId") continue;

                if (!thisRecord[columnName]) {
                    thisRecord[columnName] = {
                        "currentValue": "",
                        "changeHistory": [],
                        "changeHistoryCount": 0,
                        "uniqueEditors": {}
                    }
                }

                var columnValue = thisValue[columnName][i];

                if (columnName == "XLastModified") { // client values take precedence
                    thisRecord["xLastTimestamp"] = columnValue;
                }
                if (columnName == "XLat") {
                    xlat = columnValue;
                }
                if (columnName == "XLong") {
                    xlong = columnValue;
                }

                // assumes that the results are in ascending order, where the last 
                // change is the most recent change and is, therefore, the current value
                
                thisRecord[columnName]["currentValue"] = columnValue;
                let historyItem = Transformer.toHistoryItem(thisDelta, columnValue, deltaDayString);
                thisRecord[columnName].changeHistory.push(historyItem);
                thisRecord[columnName]["changeHistoryCount"]++;
                if (!thisRecord[columnName]["uniqueEditors"][thisDelta.User]) { thisRecord[columnName]["uniqueEditors"][thisDelta.User] = 0; }
                thisRecord[columnName]["uniqueEditors"][thisDelta.User]++;

                // update user edit counter
                userEditCounts[thisDelta.User]++;

                // update column edit counter
                if (!previous.columnEditCounts[columnName]) previous.columnEditCounts[columnName] = 0;
                var columnEditCounts = previous.columnEditCounts;
                columnEditCounts[columnName]++;

                // update column value counter
                if (!previous.columnValueCounts[columnName]) previous.columnValueCounts[columnName] = {};
                var columnValueCounts = previous.columnValueCounts[columnName];
                if (!columnValueCounts[columnValue]) columnValueCounts[columnValue] = 0;
                columnValueCounts[columnValue]++;

                // update daily edit counter
                dailyEditCounts[deltaDayString]++;
            }

            if (xlat && xlong) {
                // update location edit counter
                var locationKey = "".concat(xlat, xlong);
                if (!previous.locations[locationKey]) {
                    previous.locations[locationKey] = { "count": 0 };
                    previous.locations[locationKey]["coords"] = { "geoLat": xlat, "geoLong": xlong };
                }
                previous.locations[locationKey]["count"]++;
            }

        }

        return previous;
    }

    private static toHistoryItem(delta: trc.IDeltaInfo, columnValue: any, deltaDayString: string) {
        return {
            "version": delta.Version,
            "user": delta.User,
            "changedOn": delta.Timestamp,
            "changedOnDay": deltaDayString,
            "geoLat": delta.GeoLat,
            "geoLong": delta.GeoLong,
            "userIp": delta.UserIp,
            "app": delta.App,
            "value": columnValue
        };
    }

    private static toDayString(dateValue: Date) {
        return moment(dateValue).format("YYYY-MM-DD");
    }
}
