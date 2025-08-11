#!/usr/bin/env python3
"""
Create missing database tables for reviews and tags functionality
"""
import os
import sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from movie_app import create_app
from movie_app.extensions import db

def create_tables():
    app = create_app()
    with app.app_context():
        print("Creating missing tables...")
        
        # Import all models to ensure they're registered
        from movie_app.models.movie import Movie
        from movie_app.models.user import User
        from movie_app.models.review import Review
        from movie_app.models.tag import Tag, MovieTag
        
        # Create all tables
        db.create_all()
        print("Tables created successfully!")
        
        # List existing tables
        inspector = db.inspect(db.engine)
        tables = inspector.get_table_names()
        print(f"Existing tables: {tables}")
        
        # Check reviews table columns
        if 'reviews' in tables:
            columns = inspector.get_columns('reviews')
            print("Reviews table columns:")
            for col in columns:
                print(f"  - {col['name']}: {col['type']}")

if __name__ == "__main__":
    create_tables()