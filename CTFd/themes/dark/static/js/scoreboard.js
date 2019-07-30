function truncatedstring (fullstr, len) {
    if(fullstr.length>len){
        return fullstr.substring(0, len-3) + "...";
    }else{
        return fullstr;
    }
}

function replaceSpacialChar(spacialstr){
    return spacialstr.replace(/[^a-zA-Z]/g, "_");
}

var scorebard_data = [];
var position = [];

function renderpercentwodigit(value, base){
    if (((value * 100) % base) === 0){
        return ((value * 100) / base).toString();
    }else{
        return ((value * 100) / base).toFixed(2);
    }
}

function renderposition(account_id, cat) {
    for (var i = 0; i < position[cat].length; i++) {
        if (position[cat][i].account_id === account_id && position[cat][i].state === "up"){
            return "<i class=\"fas fa-angle-up text-success\"></i>";
        }else if (position[cat][i].account_id === account_id && position[cat][i].state === "down"){
            return "<i class=\"fas fa-angle-down text-danger\"></i>";
        }
    }
    return "";
}

function rendernavtab(){
    count = 0;
    // Get all available categories and loop to update score bar for each category
    $.get(script_root + '/api/v1/challenges/allcat', function (response) {
        var challenge_cats = response.data;
        var navtab = "<li class=\"nav-item\"><a class=\"nav-link active\" id=\"nav-tab-all\" data-toggle=\"tab\" href=\"#tab-all\" role=\"tab\">Total score</a></li>";
        var tabcontent = "";
        for (var key in challenge_cats[0]) {
            var key_id = replaceSpacialChar(key);
            navtab += "<li class=\"nav-item\"><a class=\"nav-link\" id=\"nav-tab-{0}\" data-toggle=\"tab\" href=\"#tab-{0}\" role=\"tab\">{1}</a></li>".format(key_id, key);
            tabcontent += "<div class=\"tab-pane fade\" id=\"tab-{0}\" role=\"tabpanel\" >						<table class=\"table table-striped\"><thead><tr><td scope=\"col\" class=\"text-center\" width=\"10%\"><b>Place</b></td><td scope=\"col\" width=\"30%\"><b>{1}</b></td><td scope=\"col\" width=\"48%\"><b>Solve</b><small> (Percent of total challenge)</small></small></td><td scope=\"col\" class=\"text-right\" width=\"7%\"><b>Score</b></td><td scope=\"col\" class=\"text-center\" width=\"5%\"><b></b></td></tr></thead><tbody></tbody></table></div>".format(key_id, (user_mode === "teams" ? "Team" : "User"));
        }
        $("#nav-tab").empty();
        $("#nav-tab").append(navtab);
        $("#tab-content").append(tabcontent);
      });
    
    scoregraph();
  }

var firstime_updatescores = true;
function updatescoresbycat (cat, catcount) {
    var update_table_delay = 0;
    if (firstime_updatescores){
        firstime_updatescores = false;
    } else {
        update_table_delay = 5000;
    }

    var isCatInPosition = false;
    for (var key in position) {
        if (position.hasOwnProperty(cat)) {
            isCatInPosition = true;
        }
    }
    if (!isCatInPosition){
        position[cat]=[];
    }
    for (var i = 0; i < position[cat].length; i++) {
        position[cat][i].state = "stand";
    }

    $.get(script_root + (cat === 'all' ? '/api/v1/scoreboard' : '/api/v1/scoreboard/StatByCat/' + cat) , function (response) {
        var teams = response.data;
        var update_table = false;
        var isCatInScorebard_data = false;
        for (var key in scorebard_data) {
            if (key===cat) {
                isCatInScorebard_data = true;
            }
        }
        if (!isCatInScorebard_data){
            scorebard_data[cat]=[];
            update_table = true;
        }
        if ( JSON.stringify(scorebard_data[cat]) !== JSON.stringify(teams)){
            if(isCatInScorebard_data){
                if (teams.length !== scorebard_data[cat].length){
                    update_table = true;
                }
            }

            var new_position = [];
            for (var i = 0; i < teams.length; i++) {
                var newteam = teams[i];
                newteam["state"] = "stand";
                new_position.push(newteam);
            }
            if(position[cat].length !== 0){
                for (var i = 0; i < new_position.length; i++) {
                    for (var j = 0; j < position[cat].length; j++) {
                        if (new_position[i].account_id === position[cat][j].account_id){
                            if (new_position[i].pos < position[cat][j].pos){
                                new_position[i].state = "up";
                            }else if(new_position[i].pos > position[cat][j].pos){
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
            position[cat] = new_position;
            
            var element_id_prefix = "#tab-" + replaceSpacialChar(cat) + "-tbody-account";
            for (var i = 0; i < teams.length; i++) {
                var team_id = teams[i].account_id;
                var team_name = htmlentities(truncatedstring(teams[i].name, 35));
                var team_solve = renderpercentwodigit(teams[i].solve, catcount)
                var team_score = teams[i].score;
                var team_state = renderposition(team_id, cat);

                $(element_id_prefix + team_id + "-team a").text(team_name);
                $(element_id_prefix + team_id + "-solve div div").attr("style", "width: " + team_solve + "%; -webkit-transition: width 2s; transition: width 2s;");

                $(element_id_prefix + team_id + "-solve div div").attr("aria-valuenow", team_solve);
                var current_solve = $(element_id_prefix + team_id + "-solve div div").text();
                current_solve = current_solve.substring(0, current_solve.length-1);
                if (current_solve !== team_solve){
                    $(element_id_prefix + team_id + "-solve div div").attr("class", "progress-bar bg-success progress-bar-striped progress-bar-animated");
                    setTimeout(function(){
                        $(element_id_prefix + team_id + "-solve div div").attr("class", "progress-bar bg-promary");
                    }, 3000);
                }
                $(element_id_prefix + team_id + "-solve div div").text(team_solve + "%");
                $(element_id_prefix + team_id + "-score").text(team_score);
                $(element_id_prefix + team_id + "-state").empty();
                $(element_id_prefix + team_id + "-state").append(team_state);
            }
            console.log(update_table);
            if (update_table){
                scorebard_data[cat] = teams;
                setTimeout(function(){
                    var table = $('#tab-' + replaceSpacialChar(cat) + ' tbody');
                    console.log("table");
                    console.log('#tab-' + replaceSpacialChar(cat) + ' tbody');
                    table.empty();
                    for (var i = 0; i < teams.length; i++) {
                        var row = "<tr>\n" +
                            "<th scope=\"row\" class=\"text-center\">{0}</th>".format(i + 1) +
                            "<td id=\"{0}{1}-team\"><a href=\"{2}/{3}/{4}\">{5}</a></td>".format(element_id_prefix, teams[i].account_id, script_root, user_mode, teams[i].account_id, htmlentities(truncatedstring(teams[i].name, 35))) +
                            "<td id=\"{0}{1}-solve\"><div class=\"progress\" style=\"height: 20px;\"><div id=\"score-progress-bar\" class=\"progress-bar bg-primary\" role=\"progressbar\" style=\"width: {2}%; -webkit-transition: width 2s; transition: width 2s;\" aria-valuenow=\"{2}\" aria-valuemin=\"0\" aria-valuemax=\"100\">{2}%</div></div></td>".format(element_id_prefix, teams[i].account_id, renderpercentwodigit(teams[i].solve, catcount)) +
                            "<td id=\"{0}{1}-score\" class=\"text-right\">{2}</td>".format(element_id_prefix, teams[i].account_id, teams[i].score) +
                            "<td id=\"{0}{1}-state\" class=\"text-center\">{2}</td>".format(element_id_prefix, teams[i].account_id, renderposition(teams[i].account_id, cat)) +
                            "</tr>";
                        table.append(row);
                    }
                }, update_table_delay);
            }

        }
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
  count = 0;
  // Get all available categories and loop to update score bar for each category
  $.get(script_root + '/api/v1/challenges/allcat', function (response) {
        var allcat = response.data;

        // update total
        allcount = 0;
        for (var key in allcat[0]) {
            allcount += allcat[0][key];
        }
        updatescoresbycat("all", allcount);
        
        for (var key in allcat[0]) {
            // check if the property/key is defined in the object itself, not in parent
            if (allcat[0].hasOwnProperty(key)) {           
                updatescoresbycat(key, allcat[0][key]);
            }
        }
        
    });
  
  scoregraph();
}
setInterval(update, 15000); // Update scores every 15 sec
setTimeout(update, 1000); // Initial scores
scoregraph();
rendernavtab();

window.onresize = function () {
    Plotly.Plots.resize(document.getElementById('score-graph'));
};
