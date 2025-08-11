#!/usr/bin/env python3
"""
Add genres column to movies table for filtering functionality
"""
import os
import sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from movie_app import create_app
from movie_app.extensions import db
from sqlalchemy import text

def add_genres_column():
    app = create_app()
    with app.app_context():
        print("Checking for genres column in movies table...")
        
        # Import models to ensure they're registered
        from movie_app.models.movie import Movie
        
        # Check if genres column already exists
        inspector = db.inspect(db.engine)
        columns = inspector.get_columns('movies')
        column_names = [col['name'] for col in columns]
        
        if 'genres' in column_names:
            print("✓ Genres column already exists in movies table")
            return
        
        print("Adding genres column to movies table...")
        
        # Add the genres column
        try:
            # SQLite-compatible approach
            with db.engine.connect() as conn:
                if 'sqlite' in str(db.engine.url):
                    conn.execute(text('ALTER TABLE movies ADD COLUMN genres JSON DEFAULT "[]"'))
                else:
                    # PostgreSQL approach  
                    conn.execute(text('ALTER TABLE movies ADD COLUMN genres JSON DEFAULT \'[]\''))
                conn.commit()
            
            print("✓ Successfully added genres column to movies table")
            
            # Verify the column was added
            inspector = db.inspect(db.engine)
            columns = inspector.get_columns('movies')
            print("Updated movies table columns:")
            for col in columns:
                print(f"  - {col['name']}: {col['type']}")
                
        except Exception as e:
            print(f"✗ Error adding genres column: {e}")
            print("You may need to run this script as an administrator or check database permissions")

if __name__ == "__main__":
    add_genres_column()