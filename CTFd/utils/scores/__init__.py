from sqlalchemy.sql.expression import union_all

from CTFd.cache import cache
from CTFd.models import db, Solves, Awards, Challenges, Hints
from CTFd.utils.dates import unix_time_to_utc
from CTFd.utils import get_config
from CTFd.utils.modes import get_model


@cache.memoize(timeout=60)
def get_standings(count=None, admin=False):
    """
    Get standings as a list of tuples containing account_id, name, and score e.g. [(account_id, team_name, score)].

    Ties are broken by who reached a given score first based on the solve ID. Two users can have the same score but one
    user will have a solve ID that is before the others. That user will be considered the tie-winner.

    Challenges & Awards with a value of zero are filtered out of the calculations to avoid incorrect tie breaks.
    """
    Model = get_model()

    scores = db.session.query(
        Solves.account_id.label('account_id'),
        db.func.sum(Challenges.value).label('score'),
        db.func.max(Solves.id).label('id'),
        db.func.max(Solves.date).label('date'),
        db.func.concat("0", "").cast(db.Integer).label('unlock_count'),
        db.func.count(Solves.id).label('solve'),
    ).join(Challenges) \
        .filter(Challenges.value != 0) \
        .group_by(Solves.account_id)

    awards = db.session.query(
        Awards.account_id.label('account_id'),
        db.func.sum(Awards.value).label('score'),
        db.func.max(Awards.id).label('id'),
        db.func.max(Awards.date).label('date'),
        db.func.concat("0", "").cast(db.Integer).label('unlock_count'),
        db.func.concat("0", "").cast(db.Integer).label('solve')
    ) \
        .filter(Awards.value != 0) \
        .group_by(Awards.account_id)
    hints_name_list =  db.session.query(
        db.func.concat("Hint ", Hints.id).label("hints_name")
    ).count()
    if hints_name_list > 0:
        hints_name = db.func.concat("Hint ", Hints.id).label("hints_name")
        awards = db.session.query(
            Awards.account_id.label('account_id'),
            db.func.sum(Awards.value).label('score'),
            db.func.max(Awards.id).label('id'),
            db.func.max(Awards.date).label('date'),
            db.func.count(Awards.value < 0).label('unlock_count'),
            db.func.concat("0", "").cast(db.Integer).label('solve')
        ) \
            .join(Hints, Awards.name == hints_name) \
            .join(Solves, (Awards.account_id == Solves.account_id) & (Hints.challenge_id == Solves.challenge_id)) \
            .filter(Awards.value != 0) \
            .group_by(Awards.account_id)
    awards_by_admin = db.session.query(
        Awards.account_id.label('account_id'),
        db.func.sum(Awards.value).label('score'),
        db.func.max(Awards.id).label('id'),
        db.func.max(Awards.date).label('date'),
        db.func.concat("0", "").cast(db.Integer).label('unlock_count'),
        db.func.concat("0", "").cast(db.Integer).label('solve')
    ) \
        .filter(Awards.category != 'hints') \
        .group_by(Awards.account_id)

    """
    Filter out solves and awards that are before a specific time point.
    """
    freeze = get_config('freeze')
    if not admin and freeze:
        scores = scores.filter(Solves.date < unix_time_to_utc(freeze))
        awards = awards.filter(Awards.date < unix_time_to_utc(freeze))
        awards_by_admin = awards_by_admin.filter(Awards.date < unix_time_to_utc(freeze))

    awards = awards.union(awards_by_admin)

    """
    Combine awards and solves with a union. They should have the same amount of columns
    """
    results = union_all(scores, awards).alias('results')
    """
    Sum each of the results by the team id to get their score.
    """
    sumscores = db.session.query(
        results.columns.account_id,
        db.func.sum(results.columns.score).label('score'),
        db.func.max(results.columns.id).label('id'),
        db.func.max(results.columns.date).label('date'),
        db.func.max(results.columns.unlock_count).label('unlock_count'),
        db.func.sum(results.columns.solve).label('solve'),
    ).group_by(results.columns.account_id) \
        .subquery()

    """
    Admins can see scores for all users but the public cannot see banned users.

    Filters out banned users.
    Properly resolves value ties by ID.

    Different databases treat time precision differently so resolve by the row ID instead.
    """
    if admin:
        standings_query = db.session.query(
            Model.id.label('account_id'),
            Model.oauth_id.label('oauth_id'),
            Model.name.label('name'),
            Model.hidden,
            Model.banned,
            sumscores.columns.score
        ) \
            .join(sumscores, Model.id == sumscores.columns.account_id) \
            .order_by(sumscores.columns.score.desc(), sumscores.columns.unlock_count.asc(), sumscores.columns.date.asc(), sumscores.columns.id)
    else:
        standings_query = db.session.query(
            Model.id.label('account_id'),
            Model.oauth_id.label('oauth_id'),
            Model.name.label('name'),
            sumscores.columns.score,
            sumscores.columns.solve,
        ) \
            .join(sumscores, Model.id == sumscores.columns.account_id) \
            .filter(Model.banned == False, Model.hidden == False) \
            .order_by(sumscores.columns.score.desc(), sumscores.columns.unlock_count.asc(), sumscores.columns.date.asc(), sumscores.columns.id)

    """
    Only select a certain amount of users if asked.
    """
    if count is None:
        standings = standings_query.all()
    else:
        standings = standings_query.limit(count).all()

    db.session.close()
    return standings
