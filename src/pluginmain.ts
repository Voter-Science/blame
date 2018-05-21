/// <reference path="../typings/globals/chart.js/index.d.ts" />
/// <reference path="../MicrosoftMaps/Microsoft.Maps.all.d.ts" />

import * as trc from "trclib/trc2";
import {Transformer} from "./transformer";
import {DownloadHelper} from "trclib/trchtml";
import * as moment from "moment";

declare var $:any;
declare var noUiSlider:any;

export class Blame {
    private deltas:trc.IDeltaInfo[];
    private pluginContainer:HTMLElement;
    private filters:any;
    private sheetInfo:trc.ISheetInfoResult;
    private static MAPS_KEY:string = "AmBV66zGTINWZ54KsOnI82saGwMtUEK1LHAq2vdj32S7N6wnb891uclFsdnIFpNx";
    private static CHANGE_HISTORY_MODAL:string = "blame-changes-modal";
    private minTimestamp:Date;
    private maxTimestamp:Date;
    private isInitialized:boolean;

    public constructor(sheet:trc.Sheet, container:HTMLElement) {
        this.pluginContainer = container;
        this.filters = {
            "startDate": undefined,
            "endDate": moment().format("YYYY-MM-DD"),
            "changedOnDay": undefined,
            "user": undefined,
            "columns": []
        };
    }

    public static BrowserEntry(
        sheet:trc.ISheetReference,
        container:HTMLElement,
        opts:trc.IPluginOptions,
        next:(plugin : Blame) => void 
    ):void {

        let trcSheet = new trc.Sheet(sheet),
            plugin = new Blame(trcSheet, container);
        
        trcSheet.getInfo((result:trc.ISheetInfoResult)=> {
            plugin.sheetInfo = result;
            plugin.fetchDeltas(trcSheet);
        });

        next(plugin);
    }

    private fetchDeltasCallback(segment : trc.DeltaEnumerator) : void {
        // concat is slow. Use push() instead
        // http://stackoverflow.com/a/4156156/534514
         //this.deltas = this.deltas.concat(segment.Results);
         var thisArray =this.deltas; 
         thisArray.push.apply(thisArray, segment.Results);
         var percent : number = Math.round(this.deltas.length * 100 / this.sheetInfo.LatestVersion);
         $("#LoadStatus").text("Loaded " + this.deltas.length + " of " + this.sheetInfo.LatestVersion + " ( " + percent + "%) deltas.");

         if (segment.NextLink == null) {
             $("#LoadStatus").hide();
             // Done enumerating! 
            let startMoment = moment(this.deltas.length > 0 ? this.deltas[0].Timestamp : new Date()).startOf("month");
            let endMoment = moment().endOf("month");
            
            this.minTimestamp = startMoment.toDate();
            this.maxTimestamp = endMoment.toDate();
            this.filters.startDate = Blame.formatDateForFilter(this.minTimestamp);
            this.filters.endDate = Blame.formatDateForFilter(this.maxTimestamp);

            this.render();
         } else {
            segment.GetNext((segment) => this.fetchDeltasCallback(segment));
         }
    }        

    private fetchDeltas = (sheet:trc.Sheet):void => {
        this.deltas = [];
        sheet.getDeltas((segment) => this.fetchDeltasCallback(segment));
    };

    private render = () => {
        this.init(this.pluginContainer, this.filters);
        let filteredDeltas = Blame.filterDeltas(this.deltas, this.filters);
        this.bind(filteredDeltas);
    };

    private static removeChildren = (parent:Element):void => {
        while (parent.firstChild) {
            parent.removeChild(parent.firstChild);
        }
    }

    private  init = (parent:Element, filters:any) => {
        this.isInitialized = false;
        Blame.removeChildren(parent);

        let panel = Blame.createPanel("Filters");
        parent.appendChild(panel);
        let panelBody = panel.querySelector(".panel-body");
        
        let filterControl = this.createFilterControl();
        panelBody.appendChild(filterControl);

        let changesModal = Blame.createModal(Blame.CHANGE_HISTORY_MODAL, "Change History");
        parent.appendChild(changesModal);
        this.isInitialized = true;
    };

    private static formatDateForFilter = (value:Date):string => {
        return moment(value).format("YYYY-MM-DD");
    }

    private handleSliderChange = (start:Date, end:Date) => {
        this.filters.startDate = Blame.formatDateForFilter(start);
        this.filters.endDate = Blame.formatDateForFilter(end);
        this.render();
    };

    private createDateSlider = ():HTMLDivElement => {
        let container = document.createElement("div");
        let slider = document.createElement("div");
        container.appendChild(slider);
        let row = document.createElement("div");
        row.className = "row small";
        row.innerHTML = "<br/>";
        container.appendChild(row);
        let startValueLabel = document.createElement("div");
        startValueLabel.className = "col-md-3";
        row.appendChild(startValueLabel);
        let spacer = document.createElement("div");
        spacer.className = "col-md-6";
        row.appendChild(spacer);
        let endValueLabel = document.createElement("div");
        endValueLabel.className = "col-md-3 text-right";
        row.appendChild(endValueLabel);
        let valueLabels = [startValueLabel, endValueLabel];

        noUiSlider.create(slider, {
            range: { min: this.minTimestamp.getTime(), max: this.maxTimestamp.getTime()},
            start: [ moment(this.filters.startDate).toDate().getTime(), moment(this.filters.endDate).toDate().getTime()],
            // Steps of one day
            step: 1 * 24 * 60 * 60 * 1000
        });

        let dateSlider:any = slider as any;
        dateSlider.noUiSlider.on("update", (values:any, handle:any) => {
            let value = values[handle];
            let labelText = (moment(new Date(+value)).format("MMM D, YYYY"));
            valueLabels[handle].innerHTML = labelText;
        });

        dateSlider.noUiSlider.on("change", (values:any, handle:any) => {

            let start = new Date(+values[0]);
            let end = new Date(+values[1]);    

            this.handleSliderChange(start, end);
        });
        return container;
    }

    private createFilterControl = ():HTMLElement => {
        let filterLabels = new Array<string>();
        if (this.filters.changedOnDay) {
            filterLabels.push(`Changed on = ${this.filters.changedOnDay}`);
        } else {
            filterLabels.push(`Changed between ${this.filters.startDate} and ${this.filters.endDate}`);
        }

        if (this.filters.user) {
            filterLabels.push(`User = ${this.filters.user}`);
        }

        for(let column of this.filters.columns) {
            let c:any = column as any;
            filterLabels.push(`${c.name} = ${c.value}`);
        }

        let filterWell = document.createElement("div");
        filterWell.className = "well";
        filterWell.innerHTML = filterLabels.join(" & ") + " ";

        let resetButton = document.createElement("button");
        resetButton.innerHTML = "Reset";
        resetButton.addEventListener("click", this.handleReset);
        resetButton.className = "btn btn-primary"
        filterWell.appendChild(resetButton);
  
        return filterWell;
    }

    private handleReset = ():void => {
        delete this.filters["changedOnDay"];
        this.filters.startDate = Blame.formatDateForFilter(this.minTimestamp);
        this.filters.endDate = Blame.formatDateForFilter(this.maxTimestamp);
        delete this.filters["user"];
        this.filters.columns = [];
        this.render();
    }

    private static filterDeltas = (source:trc.IDeltaInfo[], filters:any):trc.IDeltaInfo[] => {
        return source.filter((value:trc.IDeltaInfo):boolean => {
            var theTimestampMoment = moment(value.Timestamp);
            if (filters.changedOnDay) {
                if (theTimestampMoment.format("YYYY-MM-DD") !== filters.changedOnDay) return false;
            } else {
                if (filters.startDate) {
                    if (theTimestampMoment.isBefore(moment(filters.startDate))) return false;
                }
                if (filters.endDate) {
                    if (theTimestampMoment.isAfter(moment(filters.endDate))) return false;
                }
            }
            if (filters.user) {
                if (value.User != filters.user) return false;
            }
            for(let column of filters.columns) {
                let c:any = column as any;
                if (!value.Value[c.name] || value.Value[c.name].indexOf(c.value) == -1) return false;
            }

            return true;
        });
    }

    private static addFormGroup = (parent:Element, name:string, labelText:string, inputType?:string, placeholder?:any, value?:any):HTMLDivElement => {
        let formGroup = document.createElement("div");
        formGroup.className = "form-group";
        let label = document.createElement("label");
        label.setAttribute("for", name);
        label.innerText = labelText;
        formGroup.appendChild(label);
        let input = document.createElement("input");
        input.type = inputType || "text";
        input.className = "form-control";
        input.id = name;
        if (value) input.value = value;
        if (placeholder) input.placeholder = placeholder;
        formGroup.appendChild(input);
        parent.appendChild(formGroup);

        return formGroup;
    }

    private bind = (deltas:trc.IDeltaInfo[]):void => {
        let viewData = Transformer.transform(deltas);

        let chartsPanel = Blame.addChartsPanel("Charts", this.pluginContainer);
        let chartsContainer = chartsPanel.querySelector(".panel-body");

        let row1 = document.createElement("div");
        row1.className = "row";
        chartsContainer.appendChild(row1);

        let dailyData = Blame.createChartData(viewData.dailyEditCounts, "# Edits per Day");
        let dailyChart = this.addLineChart("changedOnDay", dailyData, row1, (div:HTMLDivElement)=> {
            let slider = this.createDateSlider();
            div.appendChild(slider);
        });

        let userData = Blame.createChartData(viewData.userEditCounts, "# Edits per User");
        let userChart = this.addBarChart("user", userData, row1);
        
        let fields = viewData.columnValueCounts;

        let skip = ["Comments", "RecId", "XLastModified", "XLat", "XLong"];
        for(let field in fields) {
            if (skip.indexOf(field)>-1) continue;

            let fieldData = Blame.createChartData(fields[field], field);
            let fieldChart = this.addBarChart(field, fieldData, chartsContainer);
        }

        Blame.addMap(this.pluginContainer, viewData.locations);

        Blame.addRecordsTable(this.sheetInfo, viewData.records, this.pluginContainer);
    }

    private static addMap = (parent:Element, locations:any) => {
        let panel = Blame.createPanel("Map");
        parent.appendChild(panel);
        let panelBody = panel.querySelector(".panel-body");

        let mapDiv = Blame.createMapDiv();
        panelBody.appendChild(mapDiv);

        let map = new Microsoft.Maps.Map(mapDiv, {
            "credentials": Blame.MAPS_KEY,
            "center": Blame.determineMapCenter(locations)
        });

        for(let key in locations) {
            let locationInfo = locations[key];
            let pushpin = new Microsoft.Maps.Pushpin(new Microsoft.Maps.Location(locationInfo.coords.geoLat, locationInfo.coords.geoLong));
            map.entities.push(pushpin);
        }
    }

    private static determineMapCenter = (locations:any):Microsoft.Maps.Location => {
        if (!locations || Object.keys(locations).length === 0) return undefined;
        let locationKey = Object.keys(locations)[0];
        let c = locations[locationKey].coords;
        if (!c) return undefined;
        return new Microsoft.Maps.Location(c.geoLat, c.geoLong);
    }

    private static addRecordsTable = (sheetInfo:trc.ISheetInfoResult, records:any, parent:Element) => {
        let recordsTable = Blame.createRecordsTable(sheetInfo, records);
        
        let gridPanel = Blame.createPanel(`Changed Records (${Object.keys(records).length} results)`);
        parent.appendChild(gridPanel);

        let gridPanelBody = gridPanel.querySelector(".panel-body");
        gridPanelBody.appendChild(recordsTable);

        let gridPanelHeader = gridPanel.querySelector(".panel-heading");
        
        DownloadHelper.appendDownloadCsvButton(gridPanelHeader, ()=>{
            return Blame.convertRecordsToISheetContents(sheetInfo, records);
        });

    }

    private static convertRecordsToISheetContents = (sheetInfo:trc.ISheetInfoResult, records:any):trc.ISheetContents => {
        let toReturn:trc.ISheetContents = { "RecId": []};

        for(let colDef of sheetInfo.Columns) {
            if (colDef.IsReadOnly === false) toReturn[colDef.Name] = [];            
        }

        toReturn["xLastTimestamp"] = [];
        toReturn["xLastUser"] = [];
        toReturn["xApp"] = [];

        let keysWeCareAbout = Object.keys(toReturn);

        for (let recId in records) {
            toReturn["RecId"].push(recId);    
            let thisRow = records[recId];
            for(let colKey of keysWeCareAbout) {
                if (colKey === "RecId") continue;
                let colValue = thisRow[colKey] && thisRow[colKey].hasOwnProperty("currentValue") ? thisRow[colKey].currentValue : thisRow[colKey];
                toReturn[colKey].push(colValue);
            }
        }

        return toReturn;
    }

    private static addChartsPanel = (title:string, parent:Element):Element => {
        let chartsPanel = Blame.createPanel("Charts");
        let panelBody = chartsPanel.querySelector(".panel-body");
        let instructions = document.createElement("p");
        instructions.innerHTML = "Click the charts to apply filters";
        panelBody.appendChild(instructions);

        parent.appendChild(chartsPanel);
        return chartsPanel;
    }

    private static createRecordsTable = (sheetInfo:trc.ISheetInfoResult, records:any):HTMLTableElement  => {
        let table = document.createElement("table");
        table.className = "table table-striped"
        let thead = document.createElement("thead");
        table.appendChild(thead);
        let header = document.createElement("tr");
        thead.appendChild(header);
        let columnNames = new Array<string>();
        for(let colDef of sheetInfo.Columns) {
            if (colDef.IsReadOnly === true && colDef.Name != "RecId") continue;
            columnNames.push(colDef.Name);

            let th = document.createElement("th")
            th.innerHTML = colDef.DisplayName;
            header.appendChild(th);
        }
        let xLastUserTh = document.createElement("th");
        xLastUserTh.innerHTML = "Last Changed By";
        header.appendChild(xLastUserTh);

        let xLastTimestampTh = document.createElement("th");
        xLastTimestampTh.innerHTML = "Last Changed On";
        header.appendChild(xLastTimestampTh);

        let xAppTh = document.createElement("th");
        xAppTh.innerHTML = "App";
        header.appendChild(xAppTh);


        let tbody = document.createElement("tbody");
        table.appendChild(tbody);
        for(let recId in records) {
            let tr = document.createElement("tr");
            
            for(let columnName of columnNames) {
                let td = document.createElement("td");
                if (columnName == "RecId") {
                    td.innerHTML = recId;
                } else {
                    let cell = records[recId][columnName];
                    if (cell) { 
                        td.innerHTML = cell.currentValue;
                        if (cell.changeHistoryCount > 1) {
                            let changes = document.createElement("button");
                            changes.type = "button";
                            changes.innerHTML = ` (${cell.changeHistoryCount-1} &#916;${cell.changeHistoryCount>2 ? 's' : ''})`;
                            changes.className = "small btn-link";
                            changes.addEventListener("click", (e:MouseEvent) => {
                                let modal = document.querySelector(`.${Blame.CHANGE_HISTORY_MODAL}`); //TODO: select from this.pluginContainer
                                let modalBody = modal.querySelector(".modal-body");
                                let modalTitle = modal.querySelector(".modal-title");
                                modalTitle.innerHTML = `${columnName} &#916;s on ${recId}`
                                Blame.removeChildren(modalBody);
                                let changesTable = Blame.createChangesTable(cell.changeHistory);
                                modalBody.appendChild(changesTable);
                                $(`.${Blame.CHANGE_HISTORY_MODAL}`).modal();
                            });
                            td.appendChild(changes);
                        }
                        if (Object.keys(cell.uniqueEditors).length > 1) td.className += " danger";
                    }
                }
                tr.appendChild(td);
            }
            let xLastUserTd = document.createElement("td");
            xLastUserTd.innerHTML = records[recId].xLastUser;
            tr.appendChild(xLastUserTd);

            let xLastTimestampTd = document.createElement("td");
            xLastTimestampTd.innerHTML = moment(records[recId].xLastTimestamp).format("M/D/YYYY h:m a");
            tr.appendChild(xLastTimestampTd);

            let xAppTd = document.createElement("td");
            xAppTd.innerHTML = records[recId].xApp;
            tr.appendChild(xAppTd);

            tbody.appendChild(tr);
        }

        return table;
    }

    private static createChartData = (dictionary:any, title?:string):LinearChartData => {
        let toReturn:LinearChartData = { "labels":[], "datasets":[ { "label": title, "data":[] }]};

        let dataArray = toReturn.datasets[0].data as Array<number>;        
        for(let key in dictionary) {
            toReturn.labels.push(key);
            dataArray.push(dictionary[key]);
        }
        return toReturn;
    }

    private addBarChart = (name:string, data:LinearChartData, parent:Element):void => {
        Blame.addColor(data.datasets[0]);

        let options:ChartOptions = {
            responsive: true,
            maintainAspectRatio:true,
            onClick: undefined
        };

        let chartConfig:ChartConfiguration = {
            type: "bar",
            data: data,
            options: options
        };
        
        let canvas = document.createElement("canvas");
        Blame.wrapChartInDiv(canvas, parent);
        
        let ctx = canvas.getContext("2d");
        let chart = new Chart(ctx, chartConfig);

        this.handleBarChartCreated(name, chart, canvas);
    }

    private addLineChart = (name:string, data:LinearChartData, parent:Element, onChartWrappedInDiv?:(div:HTMLDivElement)=>void):void => {
        let options:ChartOptions = {
            responsive: true,
            maintainAspectRatio:true,
            onClick: undefined
        };

        let chartConfig:ChartConfiguration = {
            type: "line",
            data: data,
            options: options
        };
        
        let canvas = document.createElement("canvas");
        let div = Blame.wrapChartInDiv(canvas, parent);

        if (onChartWrappedInDiv) onChartWrappedInDiv(div);
        
        let ctx = canvas.getContext("2d");
        let chart = new Chart(ctx, chartConfig);

        this.handleLineChartCreated(name, chart, canvas);
    }

    private static addColor = (target:ChartDataSets):void => {
        let colors:Array<string> = new Array<string>();
        for(let i=0; i< target.data.length; i++) {
            colors.push(Blame.randomColor());
        }
        target.backgroundColor = colors;
    }

    private static randomColor = ():string => {
        return "#" + Math.random().toString(16).slice(2, 8);
    }

    private static wrapChartInDiv = (canvas:HTMLCanvasElement, parent:Element):HTMLDivElement => {
        let chartDiv = document.createElement("div");
        chartDiv.className = "col-xs-12 col-md-6";
        chartDiv.appendChild(canvas);

        parent.appendChild(chartDiv);

        return chartDiv;
    }

    private static createPanel = (title?:string):HTMLDivElement => {
        let panel = document.createElement("div");
        panel.className = "panel panel-default";
        let panelHeading = document.createElement("div");
        panelHeading.className = "panel-heading";
        panel.appendChild(panelHeading);
        let panelTitle = document.createElement("h3");
        panelTitle.className = "panel-title";
        panelTitle.innerText = title;
        panelHeading.appendChild(panelTitle);
        let panelBody = document.createElement("div");
        panelBody.className = "panel-body";
        panel.appendChild(panelBody);

        return panel;
    }

    private handleBarChartCreated = (name:string, chart:{}, canvas:HTMLCanvasElement) => {
        let clickHandler = (aChart:any) => {return (e:any)=> {
            let a = aChart.getElementAtEvent(e);
            
            if (a && a.length > 0) {
                let model = a[0]._model;
                if (name in this.filters) {
                    this.filters[name] = model.label;
                } else {
                    this.filters.columns.push({ "name": name, "value": model.label});
                }
                this.render();
            }
        }};

        canvas.onclick = clickHandler(chart);
    }

    private handleLineChartCreated = (name:string, chart:{}, canvas:HTMLCanvasElement) => {
        let clickHandler = (aChart:any) => {return (e:any)=> {
            let a = aChart.getElementsAtEvent(e);
            if (a && a.length > 0) {
                let index = a[0]._index;
                let value = a[0]._chart.config.data.labels[index];
                if (name in this.filters) {
                    this.filters[name] = value;
                } else {
                    this.filters.columns.push({ "name": name, "value": value});
                }
                this.render();
            }
        }};

        canvas.onclick = clickHandler(chart);
    }

    private static createMapDiv = ():HTMLDivElement => {
        let div = document.createElement("div");
        div.style.position = "relative";
        div.style.width = "600px";
        div.style.height = "400px";
        return div;
    }

    private static createModal = (classId:string, title?:string):HTMLDivElement => {
        let modal = document.createElement("div");
        modal.className = `modal fade ${classId}`;
        modal.setAttribute("tabindex", "-1");
        modal.setAttribute("role", "dialog");
        let dialog = document.createElement("div");
        dialog.className = "modal-dialog";
        dialog.setAttribute("role", "document");
        modal.appendChild(dialog);
        let content = document.createElement("div");
        content.className = "modal-content";
        dialog.appendChild(content);
        let header = document.createElement("div");
        header.className = "modal-header";
        content.appendChild(header);
        let dismiss = document.createElement("button");        
        dismiss.type = "button";
        dismiss.className = "close";
        dismiss.setAttribute("data-dismiss", "modal");
        dismiss.setAttribute("aria-label", "Close");
        header.appendChild(dismiss);
        let dismissIcon = document.createElement("span");
        dismissIcon.innerHTML = "&times;";
        dismiss.appendChild(dismissIcon);
        let h4 = document.createElement("h4");
        h4.className = "modal-title";
        h4.innerHTML = title;
        header.appendChild(h4);
        let body = document.createElement("div");
        body.className = "modal-body";
        content.appendChild(body);
        let footer = document.createElement("div");
        footer.className = "modal-footer";
        content.appendChild(footer);
        let closeButton = document.createElement("button");
        closeButton.type = "button";
        closeButton.className = "btn btn-default";
        closeButton.setAttribute("data-dismiss", "modal");
        closeButton.innerHTML = "Close";
        footer.appendChild(closeButton);

        return modal;
    }

    private static createChangesTable = (changes:Array<any>):HTMLTableElement => {
        let table = document.createElement("table");
        table.className = "table table-striped"
        let thead = document.createElement("thead");
        table.appendChild(thead);
        let header = document.createElement("tr");
        thead.appendChild(header);
        let columnNames = ["Version", "By", "On", "Value"];
        for(let columnName of columnNames) {
            let th = document.createElement("th")
            th.innerHTML = columnName;
            header.appendChild(th);
        }
        let tbody = document.createElement("tbody");
        table.appendChild(tbody);

        let attachCell = (parent:Element, text:string) => {
            let td = document.createElement("td");
            td.innerHTML = text;
            parent.appendChild(td);
            return td;
        }

        //reverse the order of the changes (which come in ascending order)
        let copyOfChanges = [...changes];
        copyOfChanges.reverse();

        for(let change of copyOfChanges) {
            let tr = document.createElement("tr");
            tbody.appendChild(tr);
            attachCell(tr, change.version);
            attachCell(tr, change.user);
            attachCell(tr, moment(change.changedOn).format("ddd, MMM D, YYYY h:mm a"));
            attachCell(tr, change.value);
        }

        return table;
    }
}