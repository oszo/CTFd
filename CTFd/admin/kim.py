from flask import render_template
from CTFd.utils.decorators import admins_only
from CTFd.admin import admin
from CTFd.scoreboard2 import get_standings


@admin.route('/admin/scoreboard2')
@admins_only
def scoreboard2_listing():
    standings = get_standings(admin=True)
    return render_template('admin/scoreboard2.html', standings=standings)
