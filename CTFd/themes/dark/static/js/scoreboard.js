function truncatedstring (fullstr, len) {
    if(fullstr.length>len){
        return fullstr.substring(0, len-3) + "...";
    }else{
        return fullstr;
    }
}

var scorebard_data = [];
var position = [];
var challenges_count = 0;

function renderpercentwodigit(value, base){
    if (((value * 100) % base) === 0){
        return ((value * 100) / base).toString();
    }else{
        return ((value * 100) / base).toFixed(2);
    }
}

function renderposition(account_id) {
    for (var i = 0; i < position.length; i++) {
        if (position[i].account_id === account_id && position[i].state === "up"){
            console.log(account_id + ", " + position[i].name + " : show up");
            return "<i class=\"fas fa-angle-up text-success\"></i>";
        }else if (position[i].account_id === account_id && position[i].state === "down"){
            console.log(account_id + ", " + position[i].name + " : show down");
            return "<i class=\"fas fa-angle-down text-danger\"></i>";
        }
    }
    return "";
}

var firstime_updatescores = true;
function updatescores () {
    var update_table_delay = 0;
    if (firstime_updatescores){
        firstime_updatescores = false;
    } else {
        update_table_delay = 5000;
    }

    for (var i = 0; i < position.length; i++) {
        position[i].state = "stand";
    }

    $.get(script_root + '/api/v1/scoreboard', function (response) {
        var teams = response.data;

        $.get(script_root + "/api/v1/challenges/allcount", function (response) {
            var allcount = response.data;

            if ( JSON.stringify(scorebard_data) !== JSON.stringify(teams)){   
                var update_table = false;
                if (teams.length !== scorebard_data.length){
                    update_table = true;
                }

                var new_position = [];
                for (var i = 0; i < teams.length; i++) {
                    var newteam = teams[i];
                    newteam["state"] = "stand";
                    new_position.push(newteam);
                }
                if(position.length !== 0){
                    for (var i = 0; i < new_position.length; i++) {
                        for (var j = 0; j < position.length; j++) {
                            if (new_position[i].account_id === position[j].account_id){
                                if (new_position[i].pos < position[j].pos){
                                    new_position[i].state = "up";
                                }else if(new_position[i].pos > position[j].pos){
                                    new_position[i].state = "down";
                                }else{
                                    new_position[i].state = "stand";
                                }
                                update_table = true;
                                break;
                            }
                        }
                    }
                }
                position = new_position;
                
                for (var i = 0; i < teams.length; i++) {
                    var team_id = teams[i].account_id;
                    var team_name = htmlentities(truncatedstring(teams[i].name, 35));
                    var team_solve = renderpercentwodigit(teams[i].solve, allcount)
                    var team_score = teams[i].score;
                    var team_state = renderposition(team_id);

                    $("#account" + team_id + "-team a").text(team_name);
                    $("#account" + team_id + "-solve div div").attr("style", "width: " + team_solve + "%; -webkit-transition: width 2s; transition: width 2s;");

                    $("#account" + team_id + "-solve div div").attr("aria-valuenow", team_solve);
                    var current_solve = $("#account" + team_id + "-solve div div").text();
                    current_solve = current_solve.substring(0, current_solve.length-1);
                    if (current_solve !== team_solve){
                        $("#account" + team_id + "-solve div div").attr("class", "progress-bar bg-success progress-bar-striped progress-bar-animated");
                        setTimeout(function(){
                            $("#account" + team_id + "-solve div div").attr("class", "progress-bar bg-promary");
                        }, 3000);
                    }
                    $("#account" + team_id + "-solve div div").text(team_solve + "%");
                    $("#account" + team_id + "-score").text(team_score);
                    $("#account" + team_id + "-state").empty();
                    $("#account" + team_id + "-state").append(team_state);
                }
                
                if (update_table){
                    scorebard_data = teams;
                    challenges_count = allcount;
                    setTimeout(function(){
                        var table = $('#scoreboard tbody');
                        table.empty();
                        for (var i = 0; i < teams.length; i++) {
                            var row = "<tr>\n" +
                                "<th scope=\"row\" class=\"text-center\">{0}</th>".format(i + 1) +
                                "<td id=\"account{0}-team\"><a href=\"{1}/{2}/{3}\">{4}</a></td>".format(teams[i].account_id, script_root, user_mode, teams[i].account_id, htmlentities(truncatedstring(teams[i].name, 35))) +
                                "<td id=\"account{0}-solve\"><div class=\"progress\" style=\"height: 20px;\"><div id=\"score-progress-bar\" class=\"progress-bar bg-primary\" role=\"progressbar\" style=\"width: {1}%; -webkit-transition: width 2s; transition: width 2s;\" aria-valuenow=\"{1}\" aria-valuemin=\"0\" aria-valuemax=\"100\">{1}%</div></div></td>".format(teams[i].account_id, renderpercentwodigit(teams[i].solve, allcount)) +
                                "<td id=\"account{0}-score\" class=\"text-right\">{1}</td>".format(teams[i].account_id, teams[i].score) +
                                "<td id=\"account{0}-state\" class=\"text-center\">{1}</td>".format(teams[i].account_id, renderposition(teams[i].account_id)) +
                                "</tr>";
                            table.append(row);
                        }
                    }, update_table_delay);
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
        if (user_mode === 'users'){
            layout.title = 'Top 10 Users';
        }

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
