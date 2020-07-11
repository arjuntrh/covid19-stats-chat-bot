// See https://github.com/dialogflow/dialogflow-fulfillment-nodejs
// for Dialogflow fulfillment library docs, samples, and to report issues
'use strict';

const functions = require('firebase-functions');
const { WebhookClient } = require('dialogflow-fulfillment');
const bent = require('bent');
const getJSON = bent('json');

process.env.DEBUG = 'dialogflow:debug'; // enables lib debugging statements

exports.dialogflowFirebaseFulfillment = functions.https.onRequest((request, response) => {
    const agent = new WebhookClient({ request, response });
    console.log('Dialogflow Request headers: ' + JSON.stringify(request.headers));
    console.log('Dialogflow Request body: ' + JSON.stringify(request.body));

    // helper functions------------------------------------------------------------
    function uppercase(str) {
        var array1 = str.split(' ');
        var newarray1 = [];

        for (var x = 0; x < array1.length; x++) {
            newarray1.push(array1[x].charAt(0).toUpperCase() + array1[x].slice(1));
        }
        return newarray1.join(' ');
    }

    function editCountyNames(array) {
        var temp = [...array];
        var dummy = '';
        for (var i = 0; i < temp.length; i++) {
            dummy = temp[i].replace(/county|County/g, "").replace(/\s+$/, '');
            temp[i] = uppercase(dummy);
        }
        return temp;
    }

    function displayCountyInfo(response, counties, types, state) {
        var countyList = editCountyNames(counties);
        var countyTotalCount = [];
        countyList.forEach(function (county) {
            intializeStats();
            response.locations.forEach(function (location) {
                if (location.county === county) {
                    stats = addTwoObjects(stats, location.latest);
                }
            });
            stats.name = county + ' County';
            countyTotalCount.push(stats);
        });

        if (countyTotalCount.length) {
            countyTotalCount.stateCountryName = state;
            displayStats(countyTotalCount, types);
        }
    }

    function displayStatesInfo(response, states, types) {
        var stateTotalCount = [];
        states.forEach(function (state, value) {
            intializeStats();
            response.locations.forEach(function (location) {
                if (location.province === state) {
                    stats = addTwoObjects(stats, location.latest);
                }
            });
            stats.name = state;
            stateTotalCount.push(stats);
        });

        if (stateTotalCount.length) {
            displayStats(stateTotalCount, types);
        }
    }

    var stats = {};

    function intializeStats() {
        stats = {
            "confirmed": 0,
            "deaths": 0,
            "recovered": 0
        };
    }

    function addTwoObjects(...objs) {
        return objs.reduce((a, b) => {
            for (let k in b) {
                if (b.hasOwnProperty(k))
                    a[k] = (a[k] || 0) + b[k];
            }
            return a;
        }, {});
    }

    function displayStats(resultArray, types) {
        var displayLine = `According to latest COVID-19 stats, there are currently `;
        resultArray.forEach(function (item, value) {
            types.forEach(function (type, typeValue) {
                if (type != 'all') {
                    displayLine = displayLine + `${item[type]} ${type} `;
                    if (type !== 'deaths') {
                        displayLine = displayLine + `cases `;
                    }
                    if ((typeValue + 1) != types.length) {
                        displayLine = displayLine + `and `;
                    }
                }
                else {
                    displayLine = displayLine + `${item.confirmed} confirmed cases, ${item.deaths} deaths and ${item.recovered} recovered cases `;
                }
            });

            if (item.name) {
                displayLine = displayLine + `in ${item.name} `;
                if ((value + 1) != resultArray.length) {
                    displayLine = displayLine + `and `;
                }
            }
            else {
                displayLine = displayLine + `worldwide`;
            }
        });

        if (resultArray.stateCountryName) {
            displayLine = displayLine + `of ${resultArray.stateCountryName}`;
        }
        agent.add(displayLine);
    }

    function displayCountriesInfo(response, countries, types) {
        var countryTotalCount = [];

        countries.forEach(function (country) {
            intializeStats();
            response.locations.forEach(function (location) {
                if (location.country_code === country["alpha-2"]) {
                    stats = addTwoObjects(stats, location.latest);
                }
            });
            stats.name = country.name;
            countryTotalCount.push(stats);
        });

        if (countryTotalCount.length) {
            displayStats(countryTotalCount, types);
        }
    }

    function resolveStartDate(date) {
        if (date == "2020-01-22T00:00:00-05:00") {
            date = date.split("T")[0];
            date += "T00:00:00Z";

            return date;
        }

        var previousDay = new Date(date);
        previousDay.setDate(previousDay.getDate() - 1);
        previousDay = formatDate(previousDay);
        previousDay += "T00:00:00Z";

        return previousDay;
    }

    function resolveEndDate(date) {
        date = date.split("T")[0];

        var today = getLocalDate();
        today = formatDate(today);

        if (today == date) {
            // take yesterday's date
            var yesterday = getLocalDate();
            yesterday.setDate(yesterday.getDate() - 1);
            yesterday = formatDate(yesterday);
            yesterday += "T00:00:00Z";

            return yesterday;
        }
        else {
            date += "T00:00:00Z";

            return date;
        }
    }

    function getLocalDate() {
        var serverDate = new Date();
        const durationInMinutes = 240;
        serverDate.setMinutes(serverDate.getMinutes() - durationInMinutes);

        return serverDate;
    }

    function formatDate(date) {
        var dd = String(date.getDate()).padStart(2, '0');
        var mm = String(date.getMonth() + 1).padStart(2, '0'); //January is 0!
        var yyyy = date.getFullYear();

        date = yyyy + '-' + mm + '-' + dd;

        return date;
    }

    function getDefaultStatTable() {
        var statTable = {
            "confirmed": {
                text: "confirmed cases",
                count: 0
            },
            "recovered": {
                text: "recovered cases",
                count: 0
            },
            "deaths": {
                text: "deaths",
                count: 0
            }
        };

        return statTable;
    }

    function generateTypesString(types, statTable) {
        var tempStr = "";

        for (var i = 0; i < types.length; i++) {
            var type = types[i];
            tempStr += statTable[type].count;
            tempStr += " " + statTable[type].text;

            if (i < (types.length - 2))
                tempStr += ", ";
            else if (i == (types.length - 2))
                tempStr += " and ";
        }

        return tempStr;
    }
    //--------------------------------------------------------------------------------------------------------------------
    
    // API calls----------------------------------------------------------------------------------------------------------
    async function countryWiseApiRequest(locationData) {
        try {
            let result = await getJSON('https://coronavirus-tracker-api.ruizlab.org/v2/locations?source=jhu');
            displayCountriesInfo(result, locationData.country, locationData.types);
        } catch (error) {
            console.log("API request failed");
            agent.add("Sorry, I could not find the information you requested!");
            console.error(error);
        }
    }

    async function unitedStatesApiRequest(locationData) {
        try {

            if (locationData.county.length) {
                if (locationData.state.length) {
                    let result = await getJSON('https://coronavirus-tracker-api.ruizlab.org/v2/locations?source=csbs&country_code=US&province=' + locationData.state[0]);
                    displayCountyInfo(result, locationData.county, locationData.types, locationData.state[0]);
                }
                else {
                    let result = await getJSON('https://coronavirus-tracker-api.ruizlab.org/v2/locations?source=csbs&country_code=US');
                    displayCountyInfo(result, locationData.county, locationData.types);
                }
            }
            else if (locationData.state.length) {
                let result = await getJSON('https://coronavirus-tracker-api.ruizlab.org/v2/locations?source=csbs&country_code=US');
                displayStatesInfo(result, locationData.state, locationData.types);
            }

        }
        catch (error) {
            console.log("API request failed");
            agent.add("Sorry, I could not get the information you requested!");
            console.error(error);
        }
    }

    function getCurrentDateStats(types, countryCode, countryName, date, agent) {
        const dateProcessed = resolveEndDate(date); // in case the end date is today's date
        var statFlag = true;
        var statTable = getDefaultStatTable();

        if (types[0] == "all") {
            types = ["confirmed", "deaths", "recovered"];
        }

        return getJSON('https://coronavirus-tracker-api.ruizlab.org/v2/locations?source=jhu&country_code=' + countryCode + '&timelines=true').then((result) => {
            const locations = result.locations;
            for (var i = 0; i < locations.length; i++) {
                for (var j = 0; j < types.length; j++) {
                    var type = types[j];

                    if (type == "recovered")
                        continue;

                    const requiredTimeline = locations[i].timelines[type].timeline;
                    if (requiredTimeline[dateProcessed] !== undefined) {
                        statTable[type].count += requiredTimeline[dateProcessed];
                    }
                    else {
                        statFlag = false;
                        break;
                    }
                }
                if (!statFlag)
                    break;
            }
            if (statFlag) {
                var tempStr = generateTypesString(types, statTable);
                agent.add(`According to COVID-19 stats on that day, there were ${tempStr} in ${countryName}.`);
            }
            else
                agent.add(`Sorry, the requested stat is not avalible for that date.`);

        }).catch((error) => {
            console.error(error);
        });
    }

    function getDatePeriodStats(types, countryCode, countryName, datePeriod, agent) {
        const startDateProcessed = resolveStartDate(datePeriod.startDate);
        const endDateProcessed = resolveEndDate(datePeriod.endDate);
        var statFlag = true;
        var statTable = getDefaultStatTable();

        if (types[0] == "all")
            types = ["confirmed", "recovered", "deaths"];

        return getJSON('https://coronavirus-tracker-api.ruizlab.org/v2/locations?source=jhu&country_code=' + countryCode + '&timelines=true').then((result) => {
            const locations = result.locations;
            for (var i = 0; i < locations.length; i++) {
                for (var j = 0; j < types.length; j++) {
                    var type = types[j];

                    if (type == "recovered")
                        continue;

                    const requiredTimeline = locations[i].timelines[type].timeline;
                    if (requiredTimeline[startDateProcessed] !== undefined && requiredTimeline[endDateProcessed] !== undefined) {
                        const startCases = requiredTimeline[startDateProcessed];
                        const endCases = requiredTimeline[endDateProcessed];
                        statTable[type].count += startDateProcessed == endDateProcessed ? endCases : endCases - startCases;
                    }
                    else {
                        statFlag = false;
                        break;
                    }
                }
                if (!statFlag)
                    break;
            }

            if (statFlag) {
                var tempStr = generateTypesString(types, statTable);
                agent.add(`According to COVID-19 stats, there were ${tempStr} for that time period in ${countryName}.`);
            }
            else
                agent.add(`Sorry, the requested stat is not avalible for that period.`);


        }).catch((error) => {
            console.error(error);
        });
    }
    //------------------------------------------------------------------------------------------------------------------

    // Intent functions-------------------------------------------------------------------------------------------------
    function welcome(agent) {
        agent.add(`Welcome to my agent!`);
    }

    function fallback(agent) {
        agent.add(`I didn't understand.`);
        agent.add(`I'm sorry, can you try again?`);
    }

    function worldwideLatestStats(agent) {
        if (agent.parameters.type.length == 0) {
            fallback(agent);
            return;
        }
        const types = agent.parameters.type;

        return getJSON('https://coronavirus-tracker-api.herokuapp.com/v2/latest?source=csbs').then((result) => {
            var tempStr = "";

            for (var i = 0; i < types.length; i++) {
                var item = types[i];
                if (item == "confirmed") {
                    tempStr += `${result.latest.confirmed} confirmed cases`;
                }
                else if (item == "deaths") {
                    tempStr += `${result.latest.deaths} deaths`;
                }
                else if (item == "recovered") {
                    tempStr += `${result.latest.recovered} recovered cases`;
                }
                else {
                    tempStr += `${result.latest.confirmed} confirmed cases, ${result.latest.deaths} deaths and ${result.latest.recovered} recovered cases`;
                }

                if (i < (types.length - 2))
                    tempStr += ", ";
                else if (i == (types.length - 2))
                    tempStr += " and ";
            }

            agent.add(`According to the latest COVID-19 stats, there are currently ${tempStr} in the world.`);

        }).catch((error) => {
            console.error(error);
        });
    }

    async function locationLatestStats(agent) {
        var locationData = {
            types: agent.parameters.type,
            country: agent.parameters.country,
            state: agent.parameters.state,
            county: agent.parameters.county,
            city: agent.parameters.city
        };

        if (locationData.types.length && locationData.city === "" && (locationData.country.length || locationData.state.length || locationData.county.length)) {

            if ((locationData.county.length || locationData.state.length)) {
                let unitedStatesApiPromise = await unitedStatesApiRequest(locationData);
            }
            else if (locationData.country.length) {
                let countryWiseApiPromise = await countryWiseApiRequest(locationData);
            }
        }
        else {
            agent.add("Sorry, I could not get the information you requested!");
        }
    }

    function timeperiodLatestStats(agent) {
        if (agent.parameters.type.length == 0 || !agent.parameters.country) {
            fallback(agent);
            return;
        }

        const types = agent.parameters.type;
        const countryCode = agent.parameters.country["alpha-2"];
        const countryName = agent.parameters.country.name;
        const date = agent.parameters.date;
        const datePeriod = agent.parameters.date_period;

        if (date) {
            // if date is populated, just return the stats on that date
            return (getCurrentDateStats(types, countryCode, countryName, date, agent)).then(() => {
            }).catch((error) => {
                console.error(error);
            });
        }
        else if (datePeriod) {
            //return the stats in the given date range
            return (getDatePeriodStats(types, countryCode, countryName, datePeriod, agent)).then(() => {
            }).catch((error) => {
                console.error(error);
            });
        }
        else {
            fallback(agent);
        }
    }
    //-------------------------------------------------------------------------------------------------------------------

    // Run the proper function handler based on the matched Dialogflow intent name
    let intentMap = new Map();
    intentMap.set('Default Welcome Intent', welcome);
    intentMap.set('Default Fallback Intent', fallback);
    intentMap.set('Worldwide Latest Stats', worldwideLatestStats);
    intentMap.set('Location Latest Stats', locationLatestStats);
    intentMap.set('Time Period Latest Stats', timeperiodLatestStats);

    agent.handleRequest(intentMap);
});
