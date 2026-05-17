import csv
import json
import random

csv_path = r"c:\Users\Vaylo\Downloads\fun\fun\chess\puzzles\lichess_db_puzzle.csv"
js_path = r"c:\Users\Vaylo\Downloads\fun\fun\chess\puzzles\puzzles_db.js"

print("Starting Lichess database random sampling...")

# Initialize reservoirs for rating buckets: 400-2800 (buckets 4 to 28)
reservoirs = {b: [] for b in range(4, 29)}
seen_counts = {b: 0 for b in range(4, 29)}
LIMIT = 1000 # 1000 puzzles per bucket

# Seed for reproducibility of sample indices
random.seed(42)

try:
    with open(csv_path, mode='r', encoding='utf-8') as f:
        reader = csv.reader(f)
        header = next(reader)
        
        # Header indices:
        # 0: PuzzleId, 1: FEN, 2: Moves, 3: Rating, 5: Popularity, 6: NbPlays, 7: Themes
        
        line_count = 0
        for row in reader:
            line_count += 1
            if line_count % 1000000 == 0:
                print(f"Processed {line_count} rows...")
                
            try:
                puzzle_id = row[0]
                fen = row[1]
                moves = row[2].split(' ')
                rating = int(row[3])
                popularity = int(row[5])
                nb_plays = int(row[6])
                themes = row[7].split(' ')
                
                # Basic baseline checks (filter out trolls or unplayed/rejected puzzles)
                if nb_plays < 30 or popularity < 50:
                    continue
                    
                bucket = rating // 100
                if bucket < 4:
                    bucket = 4
                elif bucket > 28:
                    bucket = 28
                    
                seen_counts[bucket] += 1
                count = seen_counts[bucket]
                
                puzzle_obj = {
                    "id": puzzle_id,
                    "fen": fen,
                    "moves": moves,
                    "rating": rating,
                    "themes": themes
                }
                
                if len(reservoirs[bucket]) < LIMIT:
                    reservoirs[bucket].append(puzzle_obj)
                else:
                    # Reservoir sampling replacement
                    j = random.randint(0, count - 1)
                    if j < LIMIT:
                        reservoirs[bucket][j] = puzzle_obj
            except Exception:
                # Skip invalid rows silently
                continue

    # Flatten reservoirs
    all_puzzles = []
    for b in sorted(reservoirs.keys()):
        all_puzzles.extend(reservoirs[b])

    print(f"Sampling complete. Total puzzles selected: {len(all_puzzles)}")

    # Shuffle the combined list to mix difficulty levels and themes uniformly
    random.shuffle(all_puzzles)

    # Write to puzzles_db.js
    with open(js_path, mode='w', encoding='utf-8') as f:
        f.write("// Massive Lichess Puzzles Database (25,000 Randomized Puzzles)\n")
        f.write("window.LICHESS_PUZZLES = ")
        json.dump(all_puzzles, f, separators=(',', ':'))
        f.write(";\n")

    print(f"Successfully generated database at {js_path}!")

except FileNotFoundError:
    print(f"CRITICAL ERROR: Lichess database file not found at: {csv_path}")
except Exception as e:
    print(f"An unexpected error occurred during parsing: {e}")
