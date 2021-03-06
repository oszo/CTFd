from flask_restplus import Namespace, Resource

from CTFd.models import Solves, Awards, Teams, db, Hints, Challenges
from CTFd.cache import cache, make_cache_key
from CTFd.utils.scores import get_standings
from CTFd.utils import get_config
from CTFd.utils.modes import TEAMS_MODE
from CTFd.utils.dates import unix_time_to_utc, isoformat
from CTFd.utils.decorators.visibility import check_account_visibility, check_score_visibility
from sqlalchemy.sql import and_


scoreboard_namespace = Namespace('scoreboard', description="Endpoint to retrieve scores")


@scoreboard_namespace.route('')
class ScoreboardList(Resource):
    @check_account_visibility
    @check_score_visibility
    @cache.cached(timeout=60, key_prefix=make_cache_key)
    def get(self):
        standings = get_standings()
        response = []
        mode = get_config('user_mode')

        if mode == TEAMS_MODE:
            team_ids = []
            for team in standings:
                team_ids.append(team.account_id)
            teams = Teams.query.filter(Teams.id.in_(team_ids)).all()
            teams = [next(t for t in teams if t.id == id) for id in team_ids]

        for i, x in enumerate(standings):
            entry = {
                'pos': i + 1,
                'account_id': x.account_id,
                'oauth_id': x.oauth_id,
                'name': x.name,
                'score': int(x.score),
                'solve': int(x.solve)
            }

            if mode == TEAMS_MODE:
                members = []
                for member in teams[i].members:
                    members.append({
                        'id': member.id,
                        'oauth_id': member.oauth_id,
                        'name': member.name,
                        'score': int(member.score)
                    })

                entry['members'] = members

            response.append(
                entry
            )
        return {
            'success': True,
            'data': response
        }


@scoreboard_namespace.route('/top/<count>')
@scoreboard_namespace.param('count', 'How many top teams to return')
class ScoreboardDetail(Resource):
    @check_account_visibility
    @check_score_visibility
    @cache.cached(timeout=60, key_prefix=make_cache_key)
    def get(self, count):
        response = {}

        standings = get_standings(count=count)

        team_ids = [team.account_id for team in standings]

        solves = Solves.query.filter(Solves.account_id.in_(team_ids))
        awards = db.session.query(
                Awards.account_id.label('account_id'),
                Awards.team_id.label('team_id'),
                Awards.user_id.label('user_id'),
                Awards.value.label('value'),
                Awards.date.label('date'),
        ).filter(Awards.account_id.in_(team_ids))
        hints_name_list =  db.session.query(
            db.func.concat("Hint ", Hints.id).label("hints_name")
        ).count()
        if hints_name_list > 0:
            hints_name = db.func.concat("Hint ", Hints.id).label("hints_name")
            awards = db.session.query(
                Awards.account_id.label('account_id'),
                Awards.team_id.label('team_id'),
                Awards.user_id.label('user_id'),
                Awards.value.label('value'),
                Awards.date.label('date'),
            ) \
                .join(Hints, Awards.name == hints_name) \
                .join(Solves, (Awards.account_id == Solves.account_id) & (Hints.challenge_id == Solves.challenge_id)) \
                .filter(Awards.value != 0) \
                .filter(Awards.account_id.in_(team_ids))

        awards_by_admin = db.session.query(
            Awards.account_id.label('account_id'),
            Awards.team_id.label('team_id'),
            Awards.user_id.label('user_id'),
            Awards.value.label('value'),
            Awards.date.label('date'),
        ) \
            .filter(Awards.account_id.in_(team_ids)) \
            .filter(Awards.category != 'hints')  

        awards = awards.union(awards_by_admin)

        freeze = get_config('freeze')

        if freeze:
            solves = solves.filter(Solves.date < unix_time_to_utc(freeze))
            awards = awards.filter(Awards.date < unix_time_to_utc(freeze))

        solves = solves.all()
        awards = awards.all()

        for i, team in enumerate(team_ids):
            response[i + 1] = {
                'id': standings[i].account_id,
                'name': standings[i].name,
                'solves': []
            }
            for solve in solves:
                if solve.account_id == team:
                    response[i + 1]['solves'].append({
                        'challenge_id': solve.challenge_id,
                        'account_id': solve.account_id,
                        'team_id': solve.team_id,
                        'user_id': solve.user_id,
                        'value': solve.challenge.value,
                        'date': isoformat(solve.date)
                    })
            for award in awards:
                if award.account_id == team:
                    response[i + 1]['solves'].append({
                        'challenge_id': None,
                        'account_id': award.account_id,
                        'team_id': award.team_id,
                        'user_id': award.user_id,
                        'value': award.value,
                        'date': isoformat(award.date)
                    })
            response[i + 1]['solves'] = sorted(response[i + 1]['solves'], key=lambda k: k['date'])

        return {
            'success': True,
            'data': response
        }


# Add API to get score and solved count by category
# count, score and position are included
@scoreboard_namespace.route('/StatByCat/<cat>')
@scoreboard_namespace.param('cat', 'Category')
class ScoreboardByCategory(Resource):
    @check_account_visibility
    @check_score_visibility
    #@cache.cached(timeout=60, key_prefix=make_cache_key)
    def get(self, cat):
        response = []

        standings = get_standings()

        chals = db.session.query(
            Challenges.id,
            Challenges.category,
            Challenges.value
        ).all()

        for account in standings:

            entry = {
                'account_id': account.account_id,
                'name': account.name,
                'score': 0,
                'solve': 0
            }

            solves = db.session.query(
                Solves.challenge_id.label('challenge_id')
            ).filter(Solves.account_id==account.account_id).all()

            freeze = get_config('freeze')

            if freeze:
                solves = db.session.query(
                    Solves.challenge_id.label('challenge_id')
                ).filter(Solves.account_id==account.account_id) \
                .filter(Solves.date < unix_time_to_utc(freeze)).all()

            for solve in solves:
                for chal in chals:
                    if (solve.challenge_id == chal.id and cat == chal.category):
                        entry['solve'] += 1
                        entry['score'] += int(chal.value)

            hints_name_list =  db.session.query(
                db.func.concat("Hint ", Hints.id).label("hints_name")
            ).count()
            if hints_name_list > 0:
                hints_name = db.func.concat("Hint ", Hints.id).label("hints_name")
                award_score = db.func.sum(Awards.value).label('award_score')
                award_query = db.session.query(
                    Solves.challenge_id.label('challenge_id'),
                    award_score
                ) \
                    .join(Hints, Awards.name == hints_name) \
                    .join(Solves, (Awards.user_id == Solves.user_id) & (Hints.challenge_id == Solves.challenge_id)) \
                    .filter(Solves.account_id == account.account_id) \
                    .group_by(Solves.challenge_id)
                awards = award_query.all()
                for award in awards:
                    for chal in chals:
                        if (award.challenge_id == chal.id and cat == chal.category):
                            entry['score'] += int(award.award_score)

            response.append(entry)
            
        db.session.close()
 
        response = sorted(response, key = lambda i: i['score'], reverse=True)
        count = 0
        for r in response:
            r['pos'] = count + 1
            count += 1

        return {
            'success': True,
            'data': response
        }

# Add API to get score and solved count for all category
# count, score and position are included
@scoreboard_namespace.route('/StatByCat/all')
class ScoreboardByCategory(Resource):
    @check_account_visibility
    @check_score_visibility
    #@cache.cached(timeout=60, key_prefix=make_cache_key)
    def get(self):
        response = []

        #standings = get_standings(count=count)
        standings = get_standings()

        team_ids = [team.account_id for team in standings]


        solves = Solves.query.filter(Solves.account_id.in_(team_ids))

        solves = solves.all()

        for i, team in enumerate(team_ids):

            entry = {
                'account_id': standings[i].account_id,
                'name': standings[i].name,
                'score': 0,
                'solve': 0
            }
            
            for solve in solves:
                
                if solve.account_id == team:
                    challenges = Challenges.query.filter(
                            and_(Challenges.state != 'hidden', Challenges.state != 'locked', Challenges.id == solve.challenge_id)
                        ).first()
                    #category[challenges.category] = category[challenges.category] + 1
                    #if challenges.category == cat:
                    entry['solve'] = entry['solve'] + 1
                    entry['score'] = entry['score'] + challenges.value
                    
            response.append(entry)
            
        response = sorted(response, key = lambda i: i['score'], reverse=True)
        count = 0
        for r in response:
            r['pos'] = count + 1
            count += 1
        

        return {
            'success': True,
            'data': response
        }

    
