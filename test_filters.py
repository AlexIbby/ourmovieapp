#!/usr/bin/env python3
"""
Test script to debug movie filtering issues
"""
import sys
import os
sys.path.append('.')
from movie_app.app import create_app

def test_filtering():
    app = create_app()
    
    with app.test_client() as client:
        print("=== Testing Movie Filtering ===")
        
        # First login as Alex
        login_resp = client.post('/auth/login', json={'username': 'Alex', 'password': 'alex'})
        login_data = login_resp.get_json()
        print(f"Login response: {login_data}")
        
        if not login_data or not login_data.get('ok'):
            print("❌ Login failed!")
            return
        
        print("✅ Login successful")
        
        # Test 1: Get all movies (unfiltered)
        print("\n--- Test 1: All Movies (Unfiltered) ---")
        resp = client.get('/api/movies')
        print(f"Status: {resp.status_code}")
        
        if resp.status_code == 200:
            data = resp.get_json()
            items = data.get('items', [])
            print(f"Total movies: {len(items)}")
            
            if items:
                print("Sample movie genres:")
                for i, movie in enumerate(items[:3]):  # Show first 3
                    print(f"  {movie.get('title', 'No title')} ({movie.get('year', 'No year')}): {movie.get('genres', [])}")
            
            # Collect all unique genres for testing
            all_genres = set()
            for movie in items:
                if movie.get('genres'):
                    all_genres.update(movie['genres'])
            print(f"Available genres: {sorted(list(all_genres))}")
            
        else:
            print(f"❌ Error: {resp.status_code}")
            print(f"Response: {resp.get_data()}")
            return
        
        # Test 2: Genre filter with single genre
        print("\n--- Test 2: Single Genre Filter ---")
        if all_genres:
            test_genre = list(all_genres)[0]  # Pick first available genre
            print(f"Testing with genre: {test_genre}")
            
            resp = client.get(f'/api/movies?genre={test_genre}')
            print(f"Status: {resp.status_code}")
            
            if resp.status_code == 200:
                data = resp.get_json()
                items = data.get('items', [])
                print(f"Filtered movies count: {len(items)}")
                
                # Verify all returned movies have the genre
                for movie in items:
                    movie_genres = movie.get('genres', [])
                    has_genre = test_genre in movie_genres
                    print(f"  {movie.get('title', 'No title')}: {movie_genres} -> Contains '{test_genre}': {has_genre}")
            else:
                print(f"❌ Error: {resp.status_code}")
                print(f"Response: {resp.get_data()}")
        
        # Test 3: Multiple genre filter
        print("\n--- Test 3: Multiple Genre Filter ---")
        if len(all_genres) >= 2:
            test_genres = list(all_genres)[:2]  # Pick first 2 genres
            genre_param = ','.join(test_genres)
            print(f"Testing with genres: {test_genres}")
            
            resp = client.get(f'/api/movies?genre={genre_param}')
            print(f"Status: {resp.status_code}")
            
            if resp.status_code == 200:
                data = resp.get_json()
                items = data.get('items', [])
                print(f"Filtered movies count: {len(items)}")
                
                # Verify returned movies have at least one of the genres
                for movie in items:
                    movie_genres = movie.get('genres', [])
                    has_any_genre = any(g in movie_genres for g in test_genres)
                    print(f"  {movie.get('title', 'No title')}: {movie_genres} -> Has any of {test_genres}: {has_any_genre}")
            else:
                print(f"❌ Error: {resp.status_code}")
                print(f"Response: {resp.get_data()}")
        
        # Test 4: Year filter
        print("\n--- Test 4: Year Filter ---")
        resp = client.get('/api/movies?year_from=2020&year_to=2023')
        print(f"Status: {resp.status_code}")
        
        if resp.status_code == 200:
            data = resp.get_json()
            items = data.get('items', [])
            print(f"Year filtered movies count: {len(items)}")
            
            for movie in items:
                year = movie.get('year')
                in_range = year and 2020 <= year <= 2023
                print(f"  {movie.get('title', 'No title')} ({year}): In range 2020-2023: {in_range}")
        else:
            print(f"❌ Error: {resp.status_code}")
            print(f"Response: {resp.get_data()}")
        
        # Test 5: Rating filter
        print("\n--- Test 5: Rating Filter ---")
        resp = client.get('/api/movies?min_rating=4')
        print(f"Status: {resp.status_code}")
        
        if resp.status_code == 200:
            data = resp.get_json()
            items = data.get('items', [])
            print(f"Rating filtered movies count: {len(items)}")
            
            for movie in items:
                ratings = movie.get('ratings', {})
                print(f"  {movie.get('title', 'No title')}: Ratings: {ratings}")
        else:
            print(f"❌ Error: {resp.status_code}")
            print(f"Response: {resp.get_data()}")

if __name__ == "__main__":
    test_filtering()