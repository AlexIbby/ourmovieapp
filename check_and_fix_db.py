#!/usr/bin/env python3
"""
Check and fix the database schema for the reviews table
"""
import os
import sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from movie_app import create_app
from movie_app.extensions import db

def check_and_fix_db():
    app = create_app()
    with app.app_context():
        print("Checking database schema...")
        
        # Check current schema
        inspector = db.inspect(db.engine)
        tables = inspector.get_table_names()
        print(f"Existing tables: {tables}")
        
        if 'reviews' in tables:
            columns = inspector.get_columns('reviews')
            print("\nCurrent reviews table columns:")
            column_names = []
            for col in columns:
                column_names.append(col['name'])
                print(f"  - {col['name']}: {col['type']}")
            
            # Check if user_id exists
            if 'user_id' not in column_names:
                print("\n❌ user_id column is MISSING from reviews table!")
                print("Adding user_id column...")
                
                # Add the missing column
                try:
                    with db.engine.connect() as conn:
                        conn.execute(db.text("ALTER TABLE reviews ADD COLUMN user_id INTEGER"))
                        conn.execute(db.text("ALTER TABLE reviews ADD CONSTRAINT fk_reviews_user_id FOREIGN KEY (user_id) REFERENCES users (id)"))
                        conn.commit()
                    print("✅ user_id column added successfully!")
                except Exception as e:
                    print(f"❌ Error adding user_id column: {e}")
                    print("Trying to drop and recreate the table...")
                    
                    # Drop and recreate the table
                    try:
                        db.drop_all(tables=['reviews'])
                        db.create_all()
                        print("✅ Reviews table recreated successfully!")
                    except Exception as e2:
                        print(f"❌ Error recreating table: {e2}")
            else:
                print("✅ user_id column exists in reviews table")
        else:
            print("❌ Reviews table doesn't exist, creating it...")
            db.create_all()
            print("✅ Tables created!")

if __name__ == "__main__":
    check_and_fix_db()