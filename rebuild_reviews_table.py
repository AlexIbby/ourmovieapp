#!/usr/bin/env python3
"""
Rebuild the reviews table with complete schema
"""
import os
import sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from movie_app import create_app
from movie_app.extensions import db

def rebuild_reviews_table():
    app = create_app()
    with app.app_context():
        print("Rebuilding reviews table...")
        
        # Check current schema
        inspector = db.inspect(db.engine)
        tables = inspector.get_table_names()
        
        if 'reviews' in tables:
            print("Current reviews table exists, checking columns...")
            columns = inspector.get_columns('reviews')
            column_names = [col['name'] for col in columns]
            print(f"Current columns: {column_names}")
            
            # Drop the existing reviews table
            print("Dropping existing reviews table...")
            try:
                with db.engine.connect() as conn:
                    conn.execute(db.text("DROP TABLE IF EXISTS reviews CASCADE"))
                    conn.commit()
                print("✅ Reviews table dropped")
            except Exception as e:
                print(f"Error dropping table: {e}")
        
        # Import models to ensure they're registered
        from movie_app.models.movie import Movie
        from movie_app.models.user import User  
        from movie_app.models.review import Review
        from movie_app.models.tag import Tag, MovieTag
        
        # Create all tables (this will create reviews with proper schema)
        print("Creating tables with proper schema...")
        db.create_all()
        print("✅ All tables created!")
        
        # Verify the reviews table schema
        inspector = db.inspect(db.engine)
        if 'reviews' in inspector.get_table_names():
            columns = inspector.get_columns('reviews')
            print("\nReviews table columns after rebuild:")
            for col in columns:
                print(f"  - {col['name']}: {col['type']}")
                
            # Check required columns
            column_names = [col['name'] for col in columns]
            required_columns = ['id', 'movie_id', 'user_id', 'rating', 'comment', 'created_at', 'updated_at']
            missing = [col for col in required_columns if col not in column_names]
            
            if missing:
                print(f"❌ Still missing columns: {missing}")
            else:
                print("✅ All required columns present!")
        else:
            print("❌ Reviews table still doesn't exist!")

if __name__ == "__main__":
    rebuild_reviews_table()