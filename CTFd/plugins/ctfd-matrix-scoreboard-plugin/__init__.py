from flask import render_template, jsonify, Blueprint
from CTFd import utils, scoreboard, challenges
from CTFd.utils.plugins import override_template
from CTFd.models import db, Teams, Solves, Awards, Challenges
from sqlalchemy.sql import or_
from CTFd.utils.decorators.visibility import check_account_visibility, check_score_visibility
from CTFd.utils.scores import get_standings as scores_get_standings

import itertools
import os


def load(app):
    # @check_account_visibility
    # @check_score_visibility

    dir_path = os.path.dirname(os.path.realpath(__file__))
    template_path = os.path.join(dir_path, 'scoreboard-matrix.html')
    override_template('scoreboard.html', open(template_path).read())

    matrix = Blueprint('matrix', __name__, static_folder='static')
    app.register_blueprint(matrix, url_prefix='/matrix')

    def get_standings():
        standings = scores_get_standings()
        # TODO faster lookup here
        jstandings = []
        for account in standings:
            account_id = account[0]
            solves = db.session.query(Solves.challenge_id.label('challenge_id')).filter(Solves.account_id==account_id).all()
            jsolves = []
            for solve in solves:
                jsolves.append(solve.challenge_id)
            jstandings.append({'teamid':account.account_id, 'score':account.score, 'name':account.name,'solves':jsolves})
        db.session.close()
        return jstandings


    def get_challenges():
        if not utils.user.is_admin():
            if not utils.dates.ctftime():
                if utils.dates.view_after_ctf():
                    pass
                else:
                    return []
        # if utils.user_can_view_challenges() and (utils.dates.ctf_started() or utils.user.is_admin()):
        if (utils.dates.ctf_started() or utils.user.is_admin()):
            chals = db.session.query(
                    Challenges.id,
                    Challenges.name,
                    Challenges.category
                ).all()
            jchals = []
            for x in chals:
                jchals.append({
                    'id':x.id,
                    'name':x.name,
                    'category':x.category
                })

            # Sort into groups
            categories = set(map(lambda x:x['category'], jchals))
            jchals = [j for c in categories for j in jchals if j['category'] == c]
            print("jchals1")
            print(jchals)
            jchals.sort()
            print("jchals2")
            print(jchals)
            return jchals
        return []


    def scoreboard_view():
        if utils.get_config('view_scoreboard_if_authed') and not utils.user.authed():
            return redirect(url_for('auth.login', next=request.path))
        standings = get_standings()
        return render_template('scoreboard.html', teams=standings,
            score_frozen=utils.config.is_scoreboard_frozen(), challenges=get_challenges(), ctf_theme=utils.config.ctf_theme())

    @app.route('/scores', methods=['GET'])
    def scores():
        json = {'standings': []}
        if utils.get_config('view_scoreboard_if_authed') and not utils.user.authed():
            return redirect(url_for('auth.login', next=request.path))

        standings = get_standings()
        standings.sort()

        for i, x in enumerate(standings):
            json['standings'].append({'pos': i + 1, 'id': x['name'], 'team': x['name'],
                'score': int(x['score']), 'solves':x['solves']})
        return jsonify(json)


    # app.view_functions['scoreboard.scoreboard_view']  = scoreboard_view
    app.view_functions['scoreboard.listing'] = scoreboard_view
    
    # app.view_functions['scoreboard2']  = scoreboard_view
    app.view_functions['scoreboard.scores']  = scores
