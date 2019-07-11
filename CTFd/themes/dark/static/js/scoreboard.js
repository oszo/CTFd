function truncatedstring (fullstr, len) {
    if(fullstr.length>len){
        return fullstr.substring(0, len-3) + "...";
    }else{
        return fullstr;
    }
}

var scorebard_data = [];
var challenges_count = 0;
function updatescores () {
    $.get(script_root + '/api/v1/scoreboard', function (response) {
        var teams = response.data;
        $.get(script_root + "/api/v1/challenges/allcount", function (response) {
            var allcount = response.data;
            if (scorebard_data != teams | challenges_count != allcount){
                scorebard_data = teams;
                challenges_count = allcount;
                var table = $('#scoreboard tbody');
                table.empty();
                for (var i = 0; i < teams.length; i++) {
                    var row = "<tr>\n" +
                        "<th scope=\"row\" class=\"text-center\">{0}</th>".format(i + 1) +
                        "<td><a href=\"{0}/teams/{1}\">{2}</a></td>".format(script_root, teams[i].account_id, htmlentities(truncatedstring(teams[i].name, 35))) +
                        "<td><div class=\"progress\" style=\"height: 20px;\"><div id=\"score-progress-bar\" class=\"progress-bar bg-primary\" role=\"progressbar\" style=\"width: {0}%; -webkit-transition: width 2s; transition: width 2s;\" aria-valuenow=\"{0}\" aria-valuemin=\"0\" aria-valuemax=\"100\">{0}%</div></div></td>".format((teams[i].solve*100/allcount).toFixed(2)) +
                        "<td>{0}</td>".format(teams[i].score) +
                        "</tr>";
                    table.append(row);
                }
            }
        });
    });
}

function cumulativesum (arr) {
    var result = arr.concat();
    for (var i = 0; i < arr.length; i++){
        result[i] = arr.slice(0, i + 1).reduce(function(p, i){ return p + i; });
    }
    return result
}

function UTCtoDate(utc){
    var d = new Date(0);
    d.setUTCSeconds(utc);
    return d;
}

function scoregraph () {
    $.get(script_root + '/api/v1/scoreboard/top/10', function( response ) {
        var places = response.data;

        if (Object.keys(places).length === 0 ){
            // Replace spinner
            $('#score-graph').html(
                '<div class="text-center"><h3 class="spinner-error">No solves yet</h3></div>'
            );
            return;
        }

        var teams = Object.keys(places);
        var traces = [];
        for(var i = 0; i < teams.length; i++){
            var team_score = [];
            var times = [];
            for(var j = 0; j < places[teams[i]]['solves'].length; j++){
                team_score.push(places[teams[i]]['solves'][j].value);
                var date = moment(places[teams[i]]['solves'][j].date);
                times.push(date.toDate());
            }
            team_score = cumulativesum(team_score);
            var trace = {
                x: times,
                y: team_score,
                mode: 'lines+markers',
                name: places[teams[i]]['name'],
                marker: {
                    color: colorhash(places[teams[i]]['id'] + places[teams[i]]['name']),
                },
                line: {
                    color: colorhash(places[teams[i]]['id'] + places[teams[i]]['name']),
                    width: 4
                }
            };
            traces.push(trace);
        }

        traces.sort(function(a, b) {
            var scorediff = b['y'][b['y'].length - 1] - a['y'][a['y'].length - 1];
            if(!scorediff) {
                return a['x'][a['x'].length - 1] - b['x'][b['x'].length - 1];
            }
            return scorediff;
        });

        var layout = {
            title: 'Top 10 Teams',
            hovermode: 'closest',
            xaxis: {
                showgrid: false,
                showspikes: true,
            },
            yaxis: {
                showgrid: true,
                showspikes: true,
                showline: true,
                gridcolor: '#ffffff77',
                linecolor: '#ffffff77',
                gridwidth: 2,
                linewidth: 2
            },
            legend: {
                "orientation": "h"
            },
            plot_bgcolor: '#00000000',
            paper_bgcolor: '#00000000',
            font : {
                color : '#fff'
            }
        };

        $('#score-graph').empty(); // Remove spinners
        document.getElementById('score-graph').fn = 'CTFd_scoreboard_' + (new Date).toISOString().slice(0,19);
        Plotly.newPlot('score-graph', traces, layout, {
            // displayModeBar: false,
            displaylogo: false
        });
    });
}

function update(){
  updatescores();
  scoregraph();
}

setInterval(update, 15000); // Update scores every 15 sec
setTimeout(update, 1000); // Initial scores
scoregraph();

window.onresize = function () {
    Plotly.Plots.resize(document.getElementById('score-graph'));
};
