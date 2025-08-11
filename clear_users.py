#!/usr/bin/env python3
"""
Quick script to clear existing users so they can be recreated with new password format.
"""
from movie_app import create_app
from movie_app.models.user import User
from movie_app.extensions import db

app = create_app()

with app.app_context():
    # Delete all users
    User.query.delete()
    db.session.commit()
    print("All users cleared. Restart the app to recreate them with new password format.")