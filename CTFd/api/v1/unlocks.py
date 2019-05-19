from flask import request
from flask_restplus import Namespace, Resource
from CTFd.models import (
    db, 
    get_class_by_tablename, 
    Unlocks, 
    HintUnlocks, 
    Hints
)
from CTFd.utils.user import get_current_user
from CTFd.utils.user import get_current_team
from CTFd.utils import config
from CTFd.schemas.unlocks import UnlockSchema
from CTFd.schemas.awards import AwardSchema
from CTFd.utils.decorators import (
    during_ctf_time_only,
    require_verified_emails,
    admins_only,
    authed_only
)

unlocks_namespace = Namespace('unlocks', description="Endpoint to retrieve Unlocks")


@unlocks_namespace.route('')
class UnlockList(Resource):
    @admins_only
    def get(self):
        hints = Unlocks.query.all()
        schema = UnlockSchema()
        response = schema.dump(hints)

        if response.errors:
            return {
                'success': False,
                'errors': response.errors
            }, 400

        return {
            'success': True,
            'data': response.data
        }

    @during_ctf_time_only
    @require_verified_emails
    @authed_only
    def post(self):
        req = request.get_json()
        user = get_current_user()

        req['user_id'] = user.id
        req['team_id'] = user.team_id

        Model = get_class_by_tablename(req['type'])
        target = Model.query.filter_by(id=req['target']).first_or_404()

        unlocked_hints = set()
        hints = []
        team = get_current_team()

        if config.is_teams_mode() and team is None:
            abort(403)

        unlocked_hints = set([
            u.target for u in HintUnlocks.query.filter_by(type='hints', account_id=user.account_id)
        ])
        print("unlocked_hints")
        print(unlocked_hints)

        if req['target'] in unlocked_hints:
            return {
                'success': False,
                'errors': 'Duplicate unlock'
            }, 400

        schema = UnlockSchema()
        response = schema.load(req, session=db.session)

        if response.errors:
            return {
                'success': False,
                'errors': response.errors
            }, 400

        db.session.add(response.data)

        award_schema = AwardSchema()
        print("[target]")
        print(target.name)
        print(target.challenge_id)
        print(target.cost)
        print(target.category)
        award = {
            'user_id': user.id,
            'team_id': user.team_id,
            'name': target.name,
            'description': target.description,
            'value': (-target.cost),
            'category': target.category
        }

        award = award_schema.load(award)
        db.session.add(award.data)
        db.session.commit()

        response = schema.dump(response.data)

        return {
            'success': True,
            'data': response.data
        }
