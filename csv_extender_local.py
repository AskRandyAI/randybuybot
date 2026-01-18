import csv
import random
import os

def expand_csv(input_path, output_path, target_count, prefix):
    print(f"Expanding {input_path} to {target_count} rows...")
    
    with open(input_path, 'r', encoding='utf-8') as f:
        reader = list(csv.DictReader(f))
        headers = reader[0].keys()
    
    # Analyze existing traits to keep them within known bounds
    trait_pools = {h: set() for h in headers if h.startswith('Accessory_') or h == 'Base_Variation' or h == 'Base_Color'}
    for row in reader:
        for h in trait_pools:
            if row[h] and row[h].lower() != 'none':
                trait_pools[h].add(row[h])
    
    for h in trait_pools:
        trait_pools[h] = list(trait_pools[h])
        # ONLY add 'None' to Accessories, NEVER to Base
        if h.startswith('Accessory_'):
            if 'none' not in [t.lower() for t in trait_pools[h]]:
                trait_pools[h].append('None')

    # Rarity distribution
    rarities = ["Common", "Uncommon", "Rare", "Legendary"]
    rarity_weights = [0.60, 0.25, 0.12, 0.03]
    
    existing_combinations = set()
    for row in reader:
        combo = tuple(row[h] for h in headers if h.startswith('Accessory_') or h == 'Base_Variation' or h == 'Base_Color')
        existing_combinations.add(combo)
    
    expanded_rows = reader.copy()
    current_id = len(reader) + 1
    
    while len(expanded_rows) < target_count:
        new_row = {}
        new_row['NFT_Number'] = f"{prefix}_{str(current_id).zfill(3)}"
        
        for h in headers:
            if h == 'NFT_Number': continue
            if h == 'Final_Rarity':
                new_row[h] = random.choices(rarities, weights=rarity_weights)[0]
                continue
            
            if h in trait_pools:
                new_row[h] = random.choice(trait_pools[h])
            else:
                new_row[h] = ""

        # Ensure uniqueness
        combo = tuple(new_row[h] for h in headers if h.startswith('Accessory_') or h == 'Base_Variation' or h == 'Base_Color')
        if combo not in existing_combinations:
            existing_combinations.add(combo)
            expanded_rows.append(new_row)
            current_id += 1

    with open(output_path, 'w', encoding='utf-8', newline='') as f:
        writer = csv.DictWriter(f, fieldnames=headers)
        writer.writeheader()
        writer.writerows(expanded_rows)
    
    print(f"Success! {output_path} now has {len(expanded_rows)} rows.")

if __name__ == "__main__":
    base_dir = r"C:\Users\HHeltzinger\Desktop\WaterIsLife"
    configs = [
        (r"Drop014_FactorySprings\FactorySprings_NFT_Combinations.csv", "FS")
    ]
    
    for filename, prefix in configs:
        input_path = os.path.join(base_dir, filename)
        base_filename = os.path.basename(filename)
        output_name = base_filename.replace(".csv", "_Full_1188.csv")
        output_path = os.path.join(base_dir, output_name)
        expand_csv(input_path, output_path, 1188, prefix)
