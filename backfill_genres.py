#!/usr/bin/env python3
"""
Backfill genre data for existing movies using TMDB API
"""
import os
import sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from movie_app import create_app
from movie_app.extensions import db
from movie_app.models.movie import Movie
from movie_app.services import tmdb
import time

def backfill_genres():
    app = create_app()
    with app.app_context():
        print("Backfilling genre data for existing movies...")
        
        # Get all movies that don't have genre data
        # Use text() for database-agnostic JSON comparison
        from sqlalchemy import text
        
        # Check database type for appropriate query
        if 'sqlite' in str(db.engine.url):
            movies = Movie.query.filter(
                text("genres IS NULL OR genres = '[]' OR json_array_length(genres) = 0")
            ).all()
        else:
            # PostgreSQL
            movies = Movie.query.filter(
                text("genres IS NULL OR genres::text = '[]' OR json_array_length(genres) = 0")
            ).all()
        
        if not movies:
            print("✓ All movies already have genre data")
            return
            
        print(f"Found {len(movies)} movies without genre data")
        
        updated_count = 0
        failed_count = 0
        
        for movie in movies:
            try:
                print(f"Fetching genres for '{movie.title}' (TMDB ID: {movie.tmdb_id})...")
                
                # Get movie details from TMDB
                movie_data = tmdb.movie_details(movie.tmdb_id)
                
                if movie_data and movie_data.get("genres"):
                    movie.genres = movie_data.get("genres", [])
                    updated_count += 1
                    print(f"  ✓ Added genres: {', '.join(movie.genres)}")
                else:
                    print(f"  ✗ No genre data found")
                    failed_count += 1
                
                # Rate limit to be nice to TMDB API
                time.sleep(0.25)
                
            except Exception as e:
                print(f"  ✗ Error fetching data: {e}")
                failed_count += 1
        
        # Commit all changes
        try:
            if updated_count > 0:
                db.session.commit()
                print(f"\n✓ Successfully updated {updated_count} movies")
            if failed_count > 0:
                print(f"✗ Failed to update {failed_count} movies")
        except Exception as e:
            db.session.rollback()
            print(f"✗ Error saving changes: {e}")

if __name__ == "__main__":
    backfill_genres()